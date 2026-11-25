import { buscarUsuarioPorId } from '../services/usuarios.js';
import { destruirSesion } from './sesion.js';

// Después de un GET se redirige con 302; después de un POST, con 303 para que el navegador pida la
// página nueva con GET en vez de reenviar el formulario.
function redirigir(req, res, destino) {
  res.redirect(req.method === 'GET' || req.method === 'HEAD' ? 302 : 303, destino);
}

// Exige una sesión iniciada. Carga el usuario desde la base de datos en cada petición, así un
// cambio de nombre se ve enseguida y un usuario borrado pierde el acceso.
export function requiereSesion(db) {
  return async (req, res, next) => {
    const usuarioId = req.session?.usuarioId;
    if (!usuarioId) {
      return redirigir(req, res, '/login');
    }

    const usuario = buscarUsuarioPorId(db, usuarioId);
    if (!usuario) {
      await destruirSesion(req);
      return redirigir(req, res, '/login');
    }

    req.usuario = usuario;
    res.locals.usuario = usuario;
    next();
  };
}

// Para /login: si ya hay sesión iniciada, no tiene sentido mostrar el formulario.
export function redirigirSiHaySesion(req, res, next) {
  if (req.session?.usuarioId) {
    return redirigir(req, res, '/');
  }
  next();
}
