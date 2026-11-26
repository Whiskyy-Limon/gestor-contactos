import crypto from 'node:crypto';

// Protección CSRF con token sincronizado.
//
// El ataque: una página maliciosa que la persona visita con su sesión abierta envía un formulario
// a esta app; el navegador adjunta nuestra cookie y, sin protección, el envío parece legítimo.
//
// La defensa: la sesión guarda un token aleatorio. Cada formulario lo lleva en un campo oculto
// `_csrf` y todo POST/PUT/PATCH/DELETE debe traerlo (o en la cabecera X-CSRF-Token) igual al de la
// sesión. La página maliciosa no puede leer nuestras páginas (política del mismo origen), así que
// no conoce el token.
//
// Formularios multipart (la foto de un contacto): su cuerpo lo lee multer en la propia ruta, así
// que el middleware global todavía no ve el campo `_csrf`. Esas rutas se declaran una por una
// (método y ruta) en la lista `excepto`, quedan fuera de la verificación global y la hacen ellas
// mismas con `verificarCsrf`, después de multer. La excepción NO se decide por el Content-Type:
// si no, un atacante podría enviar un multipart a cualquier otra ruta y saltarse el control.

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);
const MENSAJE_TOKEN_INVALIDO =
  'La página expiró o el formulario no es válido. Vuelve a cargar la página e intenta de nuevo.';

// Devuelve el token de la sesión y lo crea si todavía no existe.
function obtenerToken(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  return req.session.csrfToken;
}

// Compara en tiempo constante, para que el tiempo de respuesta no revele cuántos caracteres acertó.
function tokensIguales(recibido, esperado) {
  if (typeof recibido !== 'string' || typeof esperado !== 'string') {
    return false;
  }
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Verifica el token del cuerpo ya leído (campo `_csrf`) o de la cabecera X-CSRF-Token.
export function verificarCsrf(req, res, next) {
  const recibido = req.body?._csrf ?? req.get('x-csrf-token');
  if (!tokensIguales(recibido, req.session?.csrfToken)) {
    const error = new Error('Token CSRF ausente o inválido');
    error.status = 403;
    error.mensajePublico = MENSAJE_TOKEN_INVALIDO;
    return next(error);
  }
  next();
}

// Middleware global. `excepto`: [{ metodo, patron }] de las rutas multipart que verifican el token
// ellas mismas, después de leer el cuerpo.
export function crearProteccionCsrf({ excepto = [] } = {}) {
  return function proteccionCsrf(req, res, next) {
    // Las vistas llaman a csrfToken() al dibujar un formulario. Recién entonces se crea el token,
    // así una visita a una página sin formularios no crea una sesión.
    res.locals.csrfToken = () => obtenerToken(req);

    if (METODOS_SEGUROS.has(req.method)) {
      return next();
    }
    if (excepto.some(({ metodo, patron }) => metodo === req.method && patron.test(req.path))) {
      return next();
    }
    verificarCsrf(req, res, next);
  };
}
