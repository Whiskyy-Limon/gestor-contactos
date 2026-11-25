import session from 'express-session';
import { AlmacenSesionesSqlite } from '../db/almacen-sesiones.js';

// U4: una sesión anónima solo existe para los formularios públicos (login) y dura 1 día.
// Al iniciar sesión pasa a 30 días, que se renuevan con cada uso (rolling).
export const DURACION_SESION_ANONIMA_MS = 24 * 60 * 60 * 1000;
export const DURACION_SESION_INICIADA_MS = 30 * 24 * 60 * 60 * 1000;

const LARGO_MINIMO_SECRETO = 32;

// Configura express-session con las sesiones guardadas en SQLite.
// Devuelve el middleware y los datos de la cookie, que hacen falta para borrarla al cerrar sesión.
export function crearSesion({ db, secreto, produccion }) {
  if (typeof secreto !== 'string' || secreto.length < LARGO_MINIMO_SECRETO) {
    throw new Error(
      `SESSION_SECRET es obligatorio y debe tener al menos ${LARGO_MINIMO_SECRETO} caracteres. ` +
        `Genera uno con: node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`,
    );
  }

  // En producción, el prefijo __Host- hace que el navegador exija HTTPS, Path=/ y ningún dominio,
  // así un subdominio no puede reemplazar la cookie. Sobre http://localhost el navegador la rechazaría.
  const nombreCookie = produccion ? '__Host-gestor.sid' : 'gestor.sid';
  const opcionesCookie = { httpOnly: true, sameSite: 'lax', secure: produccion, path: '/' };

  const middleware = session({
    name: nombreCookie,
    secret: secreto,
    store: new AlmacenSesionesSqlite(db),
    cookie: { ...opcionesCookie, maxAge: DURACION_SESION_ANONIMA_MS },
    rolling: true, // cada respuesta renueva la cookie y el vencimiento
    resave: false, // si la sesión no cambió, solo se renueva el vencimiento (touch)
    saveUninitialized: false, // no se crean sesiones para visitas que no las necesitan
  });

  return { middleware, nombreCookie, opcionesCookie };
}

// Versiones con promesas de los métodos con callback de express-session.
export function regenerarSesion(req) {
  return new Promise((resolve, reject) => req.session.regenerate((error) => (error ? reject(error) : resolve())));
}

export function guardarSesion(req) {
  return new Promise((resolve, reject) => req.session.save((error) => (error ? reject(error) : resolve())));
}

export function destruirSesion(req) {
  return new Promise((resolve, reject) => req.session.destroy((error) => (error ? reject(error) : resolve())));
}
