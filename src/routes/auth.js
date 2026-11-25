import { Router } from 'express';
import { redirigirSiHaySesion } from '../middlewares/auth.js';
import { crearLimitesLogin } from '../middlewares/limite-login.js';
import {
  DURACION_SESION_INICIADA_MS,
  destruirSesion,
  guardarSesion,
  regenerarSesion,
} from '../middlewares/sesion.js';
import { autenticar } from '../services/usuarios.js';

// U4: un solo mensaje para cualquier error, para no revelar qué correos tienen cuenta.
const MENSAJE_CREDENCIALES_INCORRECTAS = 'Correo o contraseña incorrectos.';
// U5.
const MENSAJE_DEMASIADOS_INTENTOS = 'Demasiados intentos. Espera unos minutos e intenta de nuevo.';

function mostrarLogin(res, { estado = 200, error = null, correo = '' } = {}) {
  res.status(estado).render('login', { titulo: 'Iniciar sesión', error, correo });
}

// Se vuelve a mostrar el correo escrito (para corregirlo), nunca la contraseña.
function correoEscrito(req) {
  return typeof req.body?.correo === 'string' ? req.body.correo : '';
}

// Rutas públicas: el formulario de login.
export function crearRutasLogin(db) {
  const router = Router();

  // Los contadores se crean con cada app, así cada instancia (y cada prueba) tiene los suyos.
  const limitesLogin = crearLimitesLogin({
    alBloquear: (req, res) =>
      mostrarLogin(res, { estado: 429, error: MENSAJE_DEMASIADOS_INTENTOS, correo: correoEscrito(req) }),
  });

  router.get('/login', redirigirSiHaySesion, (req, res) => {
    mostrarLogin(res);
  });

  router.post('/login', redirigirSiHaySesion, ...limitesLogin, async (req, res) => {
    const usuario = await autenticar(db, req.body ?? {});

    if (!usuario) {
      return mostrarLogin(res, { estado: 401, error: MENSAJE_CREDENCIALES_INCORRECTAS, correo: correoEscrito(req) });
    }

    // Id de sesión nuevo al iniciar sesión: si alguien plantó un id de sesión en el navegador
    // (fijación de sesión), ese id deja de servir.
    await regenerarSesion(req);
    req.session.usuarioId = usuario.id;
    req.session.cookie.maxAge = DURACION_SESION_INICIADA_MS;
    await guardarSesion(req);

    res.redirect(303, '/');
  });

  return router;
}

// Ruta protegida: cerrar sesión. Borra la sesión de la base de datos y la cookie del navegador.
export function crearRutaLogout({ nombreCookie, opcionesCookie }) {
  const router = Router();

  router.post('/logout', async (req, res) => {
    await destruirSesion(req);
    res.clearCookie(nombreCookie, opcionesCookie);
    res.redirect(303, '/login');
  });

  return router;
}
