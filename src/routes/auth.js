import { Router } from 'express';
import { redirigirSiHaySesion } from '../middlewares/auth.js';
import {
  DURACION_SESION_INICIADA_MS,
  destruirSesion,
  guardarSesion,
  regenerarSesion,
} from '../middlewares/sesion.js';
import { autenticar } from '../services/usuarios.js';

// U4: un solo mensaje para cualquier error, para no revelar qué correos tienen cuenta.
const MENSAJE_CREDENCIALES_INCORRECTAS = 'Correo o contraseña incorrectos.';

function mostrarLogin(res, { estado = 200, error = null, correo = '' } = {}) {
  res.status(estado).render('login', { titulo: 'Iniciar sesión', error, correo });
}

// Rutas públicas: el formulario de login.
export function crearRutasLogin(db) {
  const router = Router();

  router.get('/login', redirigirSiHaySesion, (req, res) => {
    mostrarLogin(res);
  });

  router.post('/login', redirigirSiHaySesion, async (req, res) => {
    const usuario = await autenticar(db, req.body ?? {});

    if (!usuario) {
      // Se vuelve a mostrar el correo escrito (para corregirlo), nunca la contraseña.
      const correo = typeof req.body?.correo === 'string' ? req.body.correo : '';
      return mostrarLogin(res, { estado: 401, error: MENSAJE_CREDENCIALES_INCORRECTAS, correo });
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
