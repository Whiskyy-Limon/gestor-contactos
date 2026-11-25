import path from 'node:path';
import express from 'express';
import { config } from './config/index.js';
import { requiereSesion } from './middlewares/auth.js';
import { proteccionCsrf } from './middlewares/csrf.js';
import { manejarErrores, noEncontrado } from './middlewares/errores.js';
import { cabecerasDeSeguridad } from './middlewares/seguridad.js';
import { crearSesion } from './middlewares/sesion.js';
import { crearRutaLogout, crearRutasLogin } from './routes/auth.js';
import inicioRouter from './routes/inicio.js';

const CARPETA_PUBLICA = path.join(import.meta.dirname, '..', 'public');
const CARPETA_VISTAS = path.join(import.meta.dirname, 'views');

// Construye la app sin escuchar en ningún puerto, para poder usarla en las pruebas.
//   db              conexión de better-sqlite3 (obligatoria)
//   sessionSecret   secreto de la cookie de sesión (obligatorio, mínimo 32 caracteres)
//   produccion      activa la cookie `secure` y el prefijo __Host-
//   trustProxy      valor de 'trust proxy' de Express (ver TRUST_PROXY en .env.example)
//   registrarError  dónde se registran los errores inesperados (las pruebas lo reemplazan)
export function crearApp({
  db,
  sessionSecret = config.sessionSecret,
  produccion = config.isProduction,
  trustProxy = config.trustProxy,
  registrarError = (error) => console.error(error),
} = {}) {
  if (!db) {
    throw new Error('crearApp necesita la conexión a la base de datos (db).');
  }

  const app = express();

  // No anunciar qué framework usa el servidor.
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);
  app.set('view engine', 'ejs');
  app.set('views', CARPETA_VISTAS);

  // 1. Cabeceras de seguridad (CSP, HSTS, etc.) en todas las respuestas, también en los estáticos.
  app.use(cabecerasDeSeguridad({ produccion }));

  // 2. Archivos estáticos: antes de la sesión, así el CSS no consulta la base de datos.
  app.use(express.static(CARPETA_PUBLICA, { index: false }));

  // 3. Formularios (application/x-www-form-urlencoded), con un límite de tamaño.
  app.use(express.urlencoded({ extended: false, limit: '10kb' }));

  // 4. Sesión guardada en SQLite.
  const sesion = crearSesion({ db, secreto: sessionSecret, produccion });
  app.use(sesion.middleware);

  // 5. CSRF: todo POST/PUT/PATCH/DELETE debe traer el token de la sesión, también el login.
  app.use(proteccionCsrf);

  // 6. Rutas públicas.
  app.use(crearRutasLogin(db));

  // 7. Desde aquí todo exige sesión iniciada. Toda ruta nueva se registra DEBAJO de esta línea,
  //    así queda protegida por defecto.
  app.use(requiereSesion(db));

  // 8. Rutas protegidas.
  app.use(inicioRouter);
  app.use(crearRutaLogout(sesion));

  // 9. Página no encontrada (solo la ve quien tiene sesión: al resto el paso 7 lo manda al login,
  //    así no se revela qué rutas existen).
  app.use(noEncontrado(registrarError));

  // 10. Errores: página genérica, sin stack.
  app.use(manejarErrores(registrarError));

  return app;
}
