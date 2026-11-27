// Pruebas de seguridad base: CSRF, fijación de sesión, límite de intentos de login (U5) y
// cabeceras de helmet.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { crearApp } from '../src/app.js';
import { crearUsuario } from '../src/services/usuarios.js';
import {
  MAXIMO_INTENTOS_FALLIDOS_POR_CORREO,
  MAXIMO_INTENTOS_FALLIDOS_POR_IP,
  MAXIMO_VISITAS_LOGIN_POR_IP,
} from '../src/validators/reglas.js';
import {
  CORREO,
  PASSWORD,
  SECRETO_DE_PRUEBA,
  contarSesiones,
  cookieDeSesion,
  crearEntornoDePrueba,
  iniciarSesion,
  tokenCsrf,
} from './helpers/app-de-prueba.js';

const MENSAJE_CSRF = /La página expiró o el formulario no es válido/;
const MENSAJE_DEMASIADOS_INTENTOS = /Demasiados intentos\. Espera unos minutos e intenta de nuevo\./;

// "gestor.sid=s%3A<id>.<firma>" → "<id>"
function idDeSesion(cookie) {
  const valor = decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1));
  return valor.slice(2, valor.lastIndexOf('.'));
}

// Directivas de la Content-Security-Policy como objeto { 'script-src': "'self'", ... }.
function directivasCsp(cabecera) {
  return Object.fromEntries(
    cabecera.split(';').map((directiva) => {
      const [nombre, ...valores] = directiva.trim().split(/\s+/);
      return [nombre, valores.join(' ')];
    }),
  );
}

describe('seguridad', () => {
  let entorno;

  beforeEach(async () => {
    entorno = await crearEntornoDePrueba();
  });

  afterEach(() => {
    entorno.db.close();
  });

  describe('protección CSRF', () => {
    it('los formularios de login y de cerrar sesión llevan un token de 64 caracteres hexadecimales', async () => {
      const agente = request.agent(entorno.app);

      const formulario = await agente.get('/login');
      assert.match(tokenCsrf(formulario.text), /^[0-9a-f]{64}$/);

      await agente.post('/login').type('form').send({ correo: CORREO, password: PASSWORD, _csrf: tokenCsrf(formulario.text) });
      const listado = await agente.get('/contactos');
      assert.match(tokenCsrf(listado.text), /^[0-9a-f]{64}$/);
    });

    it('POST /login sin token responde 403 y no inicia sesión', async () => {
      const agente = request.agent(entorno.app);
      await agente.get('/login');

      const respuesta = await agente.post('/login').type('form').send({ correo: CORREO, password: PASSWORD });

      assert.equal(respuesta.status, 403);
      assert.match(respuesta.text, MENSAJE_CSRF);
      assert.equal((await agente.get('/')).status, 302);
    });

    it('POST /login con un token equivocado responde 403', async () => {
      const agente = request.agent(entorno.app);
      await agente.get('/login');

      const respuesta = await agente
        .post('/login')
        .type('form')
        .send({ correo: CORREO, password: PASSWORD, _csrf: 'a'.repeat(64) });

      assert.equal(respuesta.status, 403);
    });

    it('el token de otra sesión no sirve', async () => {
      const atacante = request.agent(entorno.app);
      const tokenDelAtacante = tokenCsrf((await atacante.get('/login')).text);
      const victima = request.agent(entorno.app);
      await victima.get('/login');

      const respuesta = await victima
        .post('/login')
        .type('form')
        .send({ correo: CORREO, password: PASSWORD, _csrf: tokenDelAtacante });

      assert.equal(respuesta.status, 403);
    });

    it('POST /logout sin token responde 403 y la sesión sigue activa', async () => {
      const agente = request.agent(entorno.app);
      await iniciarSesion(agente);

      const respuesta = await agente.post('/logout');

      assert.equal(respuesta.status, 403);
      assert.equal((await agente.get('/contactos')).status, 200);
      assert.equal(contarSesiones(entorno.db), 1);
    });

    it('sin sesión, POST /logout responde 403 (no hay token con qué comparar)', async () => {
      const respuesta = await request(entorno.app).post('/logout');

      assert.equal(respuesta.status, 403);
    });

    it('acepta el token en la cabecera X-CSRF-Token', async () => {
      const agente = request.agent(entorno.app);
      await iniciarSesion(agente);
      const token = tokenCsrf((await agente.get('/contactos')).text);

      const respuesta = await agente.post('/logout').set('X-CSRF-Token', token);

      assert.equal(respuesta.status, 303);
    });

    it('el token cambia al iniciar sesión', async () => {
      const agente = request.agent(entorno.app);
      const formulario = await agente.get('/login');
      const tokenAnonimo = tokenCsrf(formulario.text);
      await agente.post('/login').type('form').send({ correo: CORREO, password: PASSWORD, _csrf: tokenAnonimo });

      const tokenConSesion = tokenCsrf((await agente.get('/contactos')).text);

      assert.notEqual(tokenConSesion, tokenAnonimo);
    });
  });

  describe('fijación de sesión', () => {
    it('al iniciar sesión cambia el id de sesión y el id anterior deja de servir', async () => {
      // Un atacante obtiene un id de sesión válido (abriendo el login) y lo planta en el navegador
      // de la víctima. La víctima inicia sesión con ese id.
      const agente = request.agent(entorno.app);
      const formulario = await agente.get('/login');
      const cookieAnonima = cookieDeSesion(formulario);
      const idAnonimo = idDeSesion(cookieAnonima);
      const existeSesion = (id) => entorno.db.prepare('SELECT count(*) FROM sesiones WHERE sid = ?').pluck().get(id);
      assert.equal(existeSesion(idAnonimo), 1);

      const login = await agente
        .post('/login')
        .type('form')
        .send({ correo: CORREO, password: PASSWORD, _csrf: tokenCsrf(formulario.text) });

      const idNuevo = idDeSesion(cookieDeSesion(login));
      assert.notEqual(idNuevo, idAnonimo);
      assert.equal(existeSesion(idAnonimo), 0);
      // El id que conocía el atacante no da acceso.
      const conIdViejo = await request(entorno.app).get('/').set('Cookie', cookieAnonima);
      assert.equal(conIdViejo.status, 302);
      assert.equal(conIdViejo.headers.location, '/login');
    });
  });

  describe('límite de intentos de login (U5)', () => {
    // Cada intento abre el formulario y lo envía, como un navegador. Todos vienen de 127.0.0.1.
    const intentar = (datos) => iniciarSesion(request.agent(entorno.app), datos);

    it(`bloquea el intento ${MAXIMO_INTENTOS_FALLIDOS_POR_CORREO + 1} para el mismo correo, aunque la contraseña sea correcta`, async () => {
      for (let i = 0; i < MAXIMO_INTENTOS_FALLIDOS_POR_CORREO; i++) {
        const fallido = await intentar({ password: 'otra-clave-123' });
        assert.equal(fallido.status, 401, `intento ${i + 1}`);
      }

      const bloqueado = await intentar({ password: PASSWORD });

      assert.equal(bloqueado.status, 429);
      assert.match(bloqueado.text, MENSAJE_DEMASIADOS_INTENTOS);
    });

    it('el contador por correo no distingue mayúsculas ni espacios', async () => {
      for (let i = 0; i < MAXIMO_INTENTOS_FALLIDOS_POR_CORREO; i++) {
        await intentar({ password: 'otra-clave-123' });
      }

      const bloqueado = await intentar({ correo: '  ANA@Empresa.PE ', password: 'otra-clave-123' });

      assert.equal(bloqueado.status, 429);
    });

    it('un correo bloqueado no bloquea a otro correo desde la misma IP', async () => {
      await crearUsuario(entorno.db, { nombre: 'Luis Rojas', correo: 'luis@empresa.pe', password: PASSWORD }, { costo: 4 });
      for (let i = 0; i < MAXIMO_INTENTOS_FALLIDOS_POR_CORREO; i++) {
        await intentar({ password: 'otra-clave-123' });
      }

      const otroCorreo = await intentar({ correo: 'luis@empresa.pe', password: PASSWORD });

      assert.equal(otroCorreo.status, 303);
    });

    it('los reintentos de un correo ya bloqueado no suman al tope por IP: otro correo de la misma IP entra igual', async () => {
      await crearUsuario(entorno.db, { nombre: 'Luis Rojas', correo: 'luis@empresa.pe', password: PASSWORD }, { costo: 4 });
      for (let i = 0; i < MAXIMO_INTENTOS_FALLIDOS_POR_CORREO; i++) {
        const fallido = await intentar({ password: 'otra-clave-123' });
        assert.equal(fallido.status, 401, `intento ${i + 1}`);
      }
      // Ana sigue intentando con su correo bloqueado hasta completar el tope por IP.
      const reintentos = MAXIMO_INTENTOS_FALLIDOS_POR_IP - MAXIMO_INTENTOS_FALLIDOS_POR_CORREO;
      for (let i = 0; i < reintentos; i++) {
        const bloqueado = await intentar({ password: 'otra-clave-123' });
        assert.equal(bloqueado.status, 429, `reintento ${i + 1}`);
      }

      const otroCorreo = await intentar({ correo: 'luis@empresa.pe', password: PASSWORD });

      assert.equal(otroCorreo.status, 303);
    });

    it('los inicios de sesión correctos no cuentan', async () => {
      for (let i = 0; i < MAXIMO_INTENTOS_FALLIDOS_POR_CORREO + 2; i++) {
        const correcto = await intentar({ password: PASSWORD });
        assert.equal(correcto.status, 303, `inicio de sesión ${i + 1}`);
      }
    });

    it(`tope por IP: bloquea el intento fallido ${MAXIMO_INTENTOS_FALLIDOS_POR_IP + 1} aunque cada correo sea distinto`, async () => {
      const correos = [];
      for (let i = 0; i <= MAXIMO_INTENTOS_FALLIDOS_POR_IP; i++) {
        const correo = `persona${i}@empresa.pe`;
        await crearUsuario(entorno.db, { nombre: `Persona ${i}`, correo, password: PASSWORD }, { costo: 4 });
        correos.push(correo);
      }

      for (let i = 0; i < MAXIMO_INTENTOS_FALLIDOS_POR_IP; i++) {
        const fallido = await intentar({ correo: correos[i], password: 'otra-clave-123' });
        assert.equal(fallido.status, 401, `intento ${i + 1}`);
      }

      const bloqueado = await intentar({ correo: correos[MAXIMO_INTENTOS_FALLIDOS_POR_IP], password: PASSWORD });

      assert.equal(bloqueado.status, 429);
    });
  });

  describe('límite de visitas al formulario de login (U7)', () => {
    it(`la visita ${MAXIMO_VISITAS_LOGIN_POR_IP + 1} desde la misma IP responde 429 y ya no crea sesiones`, async () => {
      // Cada visita sin cookie crea una sesión anónima nueva (la del token CSRF).
      for (let i = 0; i < MAXIMO_VISITAS_LOGIN_POR_IP; i++) {
        const visita = await request(entorno.app).get('/login');
        assert.equal(visita.status, 200, `visita ${i + 1}`);
      }
      assert.equal(contarSesiones(entorno.db), MAXIMO_VISITAS_LOGIN_POR_IP);

      const bloqueada = await request(entorno.app).get('/login');

      assert.equal(bloqueada.status, 429);
      assert.match(bloqueada.text, /Demasiadas visitas desde esta conexión/);
      assert.equal(tokenCsrf(bloqueada.text), null);
      assert.equal(cookieDeSesion(bloqueada), null);
      assert.equal(contarSesiones(entorno.db), MAXIMO_VISITAS_LOGIN_POR_IP);
    });

    it('con sesión iniciada, GET /login redirige y no cuenta para el límite', async () => {
      const agente = request.agent(entorno.app);
      await iniciarSesion(agente); // 1 visita al formulario
      for (let i = 0; i < MAXIMO_VISITAS_LOGIN_POR_IP; i++) {
        const respuesta = await agente.get('/login');
        assert.equal(respuesta.status, 302, `visita ${i + 1}`);
      }

      const otraPersona = await request(entorno.app).get('/login');

      assert.equal(otraPersona.status, 200);
    });
  });

  describe('cabeceras de seguridad (helmet)', () => {
    it('la CSP no permite scripts ni estilos en línea, ni mostrar la app en un iframe', async () => {
      const respuesta = await request(entorno.app).get('/login');
      const csp = respuesta.headers['content-security-policy'];
      const directivas = directivasCsp(csp);

      assert.equal(directivas['default-src'], "'self'");
      assert.equal(directivas['script-src'], "'self'");
      assert.equal(directivas['script-src-attr'], "'none'");
      assert.equal(directivas['style-src'], "'self'");
      assert.equal(directivas['object-src'], "'none'");
      assert.equal(directivas['form-action'], "'self'");
      assert.equal(directivas['frame-ancestors'], "'none'");
      assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
    });

    it('en desarrollo no envía HSTS ni upgrade-insecure-requests', async () => {
      const respuesta = await request(entorno.app).get('/login');

      assert.equal(respuesta.headers['strict-transport-security'], undefined);
      assert.doesNotMatch(respuesta.headers['content-security-policy'], /upgrade-insecure-requests/);
    });

    it('en producción envía HSTS y upgrade-insecure-requests', async () => {
      const app = crearApp({ db: entorno.db, sessionSecret: SECRETO_DE_PRUEBA, produccion: true, trustProxy: 1 });

      const respuesta = await request(app).get('/login').set('X-Forwarded-Proto', 'https');

      assert.equal(respuesta.headers['strict-transport-security'], 'max-age=15552000; includeSubDomains');
      assert.match(respuesta.headers['content-security-policy'], /upgrade-insecure-requests/);
    });

    it('envía X-Frame-Options DENY y X-Content-Type-Options nosniff, y no X-Powered-By', async () => {
      const respuesta = await request(entorno.app).get('/login');

      assert.equal(respuesta.headers['x-frame-options'], 'DENY');
      assert.equal(respuesta.headers['x-content-type-options'], 'nosniff');
      assert.equal(respuesta.headers['x-powered-by'], undefined);
    });

    it('los archivos estáticos también llevan las cabeceras', async () => {
      const respuesta = await request(entorno.app).get('/css/estilos.css');

      assert.ok(respuesta.headers['content-security-policy']);
      assert.equal(respuesta.headers['x-content-type-options'], 'nosniff');
    });
  });

  describe('caché', () => {
    it('las páginas dinámicas se envían con Cache-Control: no-store, también el login y los errores', async () => {
      const agente = request.agent(entorno.app);
      assert.equal((await agente.get('/login')).headers['cache-control'], 'no-store');

      await iniciarSesion(agente);
      for (const ruta of ['/', '/contactos', '/contactos/nuevo', '/no-existe']) {
        assert.equal((await agente.get(ruta)).headers['cache-control'], 'no-store', ruta);
      }
    });

    it('los archivos estáticos sí se pueden guardar en caché', async () => {
      for (const ruta of ['/css/estilos.css', '/js/filas.js']) {
        const respuesta = await request(entorno.app).get(ruta);
        assert.equal(respuesta.status, 200, ruta);
        assert.doesNotMatch(respuesta.headers['cache-control'], /no-store/, ruta);
      }
    });
  });
});
