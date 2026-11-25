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
// Pendiente para la etapa de fotos: el cuerpo de un formulario multipart lo lee multer después de
// este middleware, que hoy lo rechazaría con 403 por no ver el token. Esas rutas tendrán que quedar
// fuera de esta verificación y verificar el token ellas mismas, después de multer.

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

export function proteccionCsrf(req, res, next) {
  // Las vistas llaman a csrfToken() al dibujar un formulario. Recién entonces se crea el token,
  // así una visita a una página sin formularios no crea una sesión.
  res.locals.csrfToken = () => obtenerToken(req);

  if (METODOS_SEGUROS.has(req.method)) {
    return next();
  }

  const recibido = req.body?._csrf ?? req.get('x-csrf-token');
  if (!tokensIguales(recibido, req.session?.csrfToken)) {
    const error = new Error('Token CSRF ausente o inválido');
    error.status = 403;
    error.mensajePublico = MENSAJE_TOKEN_INVALIDO;
    return next(error);
  }
  next();
}
