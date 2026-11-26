// Pruebas de inicio y cierre de sesión, rutas protegidas y sesión persistente (U4).
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { crearApp } from '../src/app.js';
import {
  CORREO,
  NOMBRE,
  PASSWORD,
  SECRETO_DE_PRUEBA,
  cerrarSesion,
  contarSesiones,
  cookieDeSesion,
  crearEntornoDePrueba,
  iniciarSesion,
  tokenCsrf,
} from './helpers/app-de-prueba.js';

const TREINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000;
const MENSAJE_GENERICO = 'Correo o contraseña incorrectos.';

// Texto del mensaje de error del formulario de login, o null si no hay.
function mensajeDeError(html) {
  return html.match(/<p class="alerta" role="alert">([^<]*)<\/p>/)?.[1] ?? null;
}

describe('autenticación', () => {
  let entorno;

  beforeEach(async () => {
    entorno = await crearEntornoDePrueba();
  });

  afterEach(() => {
    entorno.db.close();
  });

  // Inicia sesión y devuelve la cookie "gestor.sid=...".
  async function cookieConSesion() {
    const respuesta = await iniciarSesion(request.agent(entorno.app));
    return cookieDeSesion(respuesta);
  }

  describe('inicio de sesión', () => {
    it('GET /login muestra el formulario', async () => {
      const respuesta = await request(entorno.app).get('/login');

      assert.equal(respuesta.status, 200);
      assert.match(respuesta.text, /<form method="post" action="\/login"/);
    });

    it('con datos correctos redirige al inicio, que lleva al listado con el nombre y el botón de cerrar sesión', async () => {
      const agente = request.agent(entorno.app);

      const login = await iniciarSesion(agente);
      assert.equal(login.status, 303);
      assert.equal(login.headers.location, '/');

      const inicio = await agente.get('/');
      assert.equal(inicio.status, 302);
      assert.equal(inicio.headers.location, '/contactos');

      const listado = await agente.get('/contactos');
      assert.equal(listado.status, 200);
      assert.match(listado.text, new RegExp(`<span class="barra__usuario">${NOMBRE}</span>`));
      assert.match(listado.text, /<form method="post" action="\/logout"/);
    });

    it('acepta el correo con mayúsculas y espacios alrededor', async () => {
      const login = await iniciarSesion(request.agent(entorno.app), { correo: '  ANA@Empresa.pe ' });

      assert.equal(login.status, 303);
    });

    it('con contraseña incorrecta responde 401 con el mensaje genérico y no inicia sesión', async () => {
      const agente = request.agent(entorno.app);

      const login = await iniciarSesion(agente, { password: 'otra-clave-123' });

      assert.equal(login.status, 401);
      assert.equal(mensajeDeError(login.text), MENSAJE_GENERICO);
      assert.equal((await agente.get('/contactos')).status, 302);
    });

    it('con un correo inexistente responde exactamente igual que con una contraseña incorrecta', async () => {
      const malaPassword = await iniciarSesion(request.agent(entorno.app), { password: 'otra-clave-123' });
      const sinCuenta = await iniciarSesion(request.agent(entorno.app), { correo: 'nadie@empresa.pe' });

      assert.equal(sinCuenta.status, malaPassword.status);
      assert.equal(mensajeDeError(sinCuenta.text), MENSAJE_GENERICO);
      // La página es idéntica salvo por el correo escrito y el token CSRF (cada sesión tiene el suyo).
      const normalizar = (html, correo) =>
        html.replace(correo, 'CORREO').replace(/name="_csrf" value="[^"]+"/, 'name="_csrf" value="TOKEN"');
      assert.equal(normalizar(sinCuenta.text, 'nadie@empresa.pe'), normalizar(malaPassword.text, CORREO));
    });

    it('vuelve a mostrar el correo escrito, pero nunca la contraseña', async () => {
      const login = await iniciarSesion(request.agent(entorno.app), { password: 'otra-clave-123' });

      assert.match(login.text, /value="ana@empresa\.pe"/);
      assert.ok(!login.text.includes('otra-clave-123'));
    });

    it('escapa el correo al volver a mostrarlo (no permite inyectar HTML)', async () => {
      const login = await iniciarSesion(request.agent(entorno.app), { correo: '"><script>alert(1)</script>' });

      assert.equal(login.status, 401);
      assert.ok(!login.text.includes('<script>alert(1)</script>'));
      assert.match(login.text, /&#34;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    });

    it('si ya hay sesión, /login redirige al inicio', async () => {
      const agente = request.agent(entorno.app);
      await iniciarSesion(agente);

      const respuesta = await agente.get('/login');

      assert.equal(respuesta.status, 302);
      assert.equal(respuesta.headers.location, '/');
    });

    it('rechaza un formulario demasiado grande con una página genérica', async () => {
      const respuesta = await request(entorno.app)
        .post('/login')
        .type('form')
        .send({ correo: 'a'.repeat(20_000), password: 'x' });

      assert.equal(respuesta.status, 413);
      assert.match(respuesta.text, /Los datos enviados son demasiado grandes/);
    });
  });

  describe('rutas protegidas', () => {
    it('sin sesión, GET / redirige a /login y no crea una sesión', async () => {
      const respuesta = await request(entorno.app).get('/');

      assert.equal(respuesta.status, 302);
      assert.equal(respuesta.headers.location, '/login');
      assert.equal(cookieDeSesion(respuesta), null);
      assert.equal(contarSesiones(entorno.db), 0);
    });

    it('sin sesión, una ruta inexistente también redirige a /login (no revela qué rutas existen)', async () => {
      const respuesta = await request(entorno.app).get('/no-existe');

      assert.equal(respuesta.status, 302);
      assert.equal(respuesta.headers.location, '/login');
    });

    it('con sesión, una ruta inexistente muestra la página 404 genérica', async () => {
      const respuesta = await request(entorno.app).get('/no-existe').set('Cookie', await cookieConSesion());

      assert.equal(respuesta.status, 404);
      assert.match(respuesta.text, /La página que buscas no existe/);
    });

    it('los archivos estáticos no requieren sesión ni crean una', async () => {
      const respuesta = await request(entorno.app).get('/css/estilos.css');

      assert.equal(respuesta.status, 200);
      assert.match(respuesta.headers['content-type'], /text\/css/);
      assert.equal(cookieDeSesion(respuesta), null);
    });

    it('un usuario borrado pierde el acceso aunque conserve la cookie', async () => {
      const cookie = await cookieConSesion();
      entorno.db.prepare('DELETE FROM usuarios WHERE id = ?').run(entorno.usuario.id);

      const respuesta = await request(entorno.app).get('/').set('Cookie', cookie);

      assert.equal(respuesta.status, 302);
      assert.equal(respuesta.headers.location, '/login');
      assert.equal(contarSesiones(entorno.db), 0);
    });
  });

  describe('sesión persistente (U4)', () => {
    it('la cookie tiene nombre propio, HttpOnly, SameSite=Lax y vence en 30 días', async () => {
      const login = await iniciarSesion(request.agent(entorno.app));
      const cookie = login.headers['set-cookie'].find((c) => c.startsWith('gestor.sid='));

      assert.match(cookie, /; HttpOnly/);
      assert.match(cookie, /; SameSite=Lax/);
      assert.doesNotMatch(cookie, /; Secure/); // en desarrollo no hay HTTPS
      const vence = new Date(cookie.match(/; Expires=([^;]+)/)[1]).getTime();
      assert.ok(Math.abs(vence - (Date.now() + TREINTA_DIAS_MS)) < 60_000);
    });

    it('la sesión sigue válida al reusar la cookie en peticiones nuevas', async () => {
      const cookie = await cookieConSesion();

      for (let i = 0; i < 2; i++) {
        const respuesta = await request(entorno.app).get('/contactos').set('Cookie', cookie);
        assert.equal(respuesta.status, 200);
      }
    });

    it('la sesión sobrevive a reiniciar el servidor (app nueva, misma base de datos)', async () => {
      const cookie = await cookieConSesion();
      const appReiniciada = entorno.nuevaApp();

      const respuesta = await request(appReiniciada).get('/contactos').set('Cookie', cookie);

      assert.equal(respuesta.status, 200);
      assert.match(respuesta.text, new RegExp(`<span class="barra__usuario">${NOMBRE}</span>`));
    });

    it('cada uso renueva el vencimiento por 30 días más (rolling)', async () => {
      const cookie = await cookieConSesion();
      entorno.db.prepare('UPDATE sesiones SET expira_en = ?').run(Date.now() + 60_000);

      const respuesta = await request(entorno.app).get('/contactos').set('Cookie', cookie);

      assert.equal(respuesta.status, 200);
      assert.ok(cookieDeSesion(respuesta), 'la respuesta debe renovar la cookie');
      const expiraEn = entorno.db.prepare('SELECT expira_en FROM sesiones').pluck().get();
      assert.ok(expiraEn > Date.now() + TREINTA_DIAS_MS - 60_000);
    });

    it('una sesión vencida ya no sirve', async () => {
      const cookie = await cookieConSesion();
      entorno.db.prepare('UPDATE sesiones SET expira_en = ?').run(Date.now() - 1000);

      const respuesta = await request(entorno.app).get('/').set('Cookie', cookie);

      assert.equal(respuesta.status, 302);
      assert.equal(respuesta.headers.location, '/login');
    });
  });

  describe('cierre de sesión', () => {
    it('borra la sesión de la base de datos y la cookie, y redirige a /login', async () => {
      const agente = request.agent(entorno.app);
      await iniciarSesion(agente);
      assert.equal(contarSesiones(entorno.db), 1);

      const logout = await cerrarSesion(agente);

      assert.equal(logout.status, 303);
      assert.equal(logout.headers.location, '/login');
      assert.equal(contarSesiones(entorno.db), 0);
      const cookieBorrada = logout.headers['set-cookie'].find((c) => c.startsWith('gestor.sid=;'));
      assert.match(cookieBorrada, /Expires=Thu, 01 Jan 1970/);
    });

    it('después de cerrar sesión, la cookie vieja ya no sirve', async () => {
      const cookie = await cookieConSesion();
      const pagina = await request(entorno.app).get('/contactos').set('Cookie', cookie);
      const logout = await request(entorno.app)
        .post('/logout')
        .set('Cookie', cookie)
        .type('form')
        .send({ _csrf: tokenCsrf(pagina.text) });
      assert.equal(logout.status, 303);

      const respuesta = await request(entorno.app).get('/').set('Cookie', cookie);

      assert.equal(respuesta.status, 302);
      assert.equal(respuesta.headers.location, '/login');
    });
  });

  describe('configuración y errores', () => {
    it('la app no se crea sin SESSION_SECRET ni con uno de menos de 32 caracteres', () => {
      for (const sessionSecret of ['', 'x'.repeat(31)]) {
        assert.throws(() => crearApp({ db: entorno.db, sessionSecret }), /SESSION_SECRET es obligatorio/);
      }
      assert.doesNotThrow(() => crearApp({ db: entorno.db, sessionSecret: 'x'.repeat(32) }));
    });

    it('en producción, detrás de un proxy con HTTPS, usa la cookie __Host- con Secure', async () => {
      const app = crearApp({ db: entorno.db, sessionSecret: SECRETO_DE_PRUEBA, produccion: true, trustProxy: 1 });

      // El agente de pruebas no reenvía cookies Secure por http, así que la cookie se pasa a mano.
      const formulario = await request(app).get('/login').set('X-Forwarded-Proto', 'https');
      const cookieAnonima = cookieDeSesion(formulario, '__Host-gestor.sid');
      assert.ok(cookieAnonima, 'la sesión anónima también usa __Host-');
      const login = await request(app)
        .post('/login')
        .set('X-Forwarded-Proto', 'https')
        .set('Cookie', cookieAnonima)
        .type('form')
        .send({ correo: CORREO, password: PASSWORD, _csrf: tokenCsrf(formulario.text) });

      assert.equal(login.status, 303);
      const cookie = login.headers['set-cookie'].find((c) => c.startsWith('__Host-gestor.sid='));
      assert.ok(cookie, 'debe enviar la cookie __Host-gestor.sid');
      assert.match(cookie, /; Secure/);
      assert.match(cookie, /; Path=\//);
      assert.doesNotMatch(cookie, /; Domain=/);
    });

    it('si la base de datos falla, muestra una página genérica sin detalles y registra el error', async () => {
      const cookie = await cookieConSesion();
      entorno.db.close();

      const respuesta = await request(entorno.app).get('/').set('Cookie', cookie);

      assert.equal(respuesta.status, 500);
      assert.match(respuesta.text, /Ocurrió un error inesperado/);
      assert.doesNotMatch(respuesta.text, /SqliteError|TypeError|database|\bat \S+ \(/i);
      assert.equal(entorno.erroresRegistrados.length, 1);
    });
  });
});
