import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { config } from './config/index.js';
import { requiereSesion } from './middlewares/auth.js';
import { avisos } from './middlewares/avisos.js';
import { crearProteccionCsrf } from './middlewares/csrf.js';
import { manejarErrores, noEncontrado } from './middlewares/errores.js';
import { cabecerasDeSeguridad, sinCache } from './middlewares/seguridad.js';
import { crearSesion } from './middlewares/sesion.js';
import { crearRutaLogout, crearRutasLogin } from './routes/auth.js';
import { RUTAS_MULTIPART, crearRutasContactos } from './routes/contactos.js';
import { crearRutaFotos } from './routes/fotos.js';
import inicioRouter from './routes/inicio.js';
import * as ayudantes from './views/ayudantes.js';

const CARPETA_PUBLICA = path.join(import.meta.dirname, '..', 'public');
const CARPETA_VISTAS = path.join(import.meta.dirname, 'views');

// Construye la app sin escuchar en ningún puerto, para poder usarla en las pruebas.
//   db              conexión de better-sqlite3 (obligatoria)
//   sessionSecret   secreto de la cookie de sesión (obligatorio, mínimo 32 caracteres)
//   produccion      activa la cookie `secure` y el prefijo __Host-
//   trustProxy      valor de 'trust proxy' de Express (ver TRUST_PROXY en .env.example)
//   carpetaFotos    carpeta de las fotos de los contactos (ver UPLOADS_PATH; se crea si no existe)
//   registrarError  dónde se registran los errores inesperados (las pruebas lo reemplazan)
export function crearApp({
  db,
  sessionSecret = config.sessionSecret,
  produccion = config.isProduction,
  trustProxy = config.trustProxy,
  carpetaFotos = config.carpetaFotos,
  registrarError = (error) => console.error(error),
} = {}) {
  if (!db) {
    throw new Error('crearApp necesita la conexión a la base de datos (db).');
  }
  const carpetaDeFotos = path.resolve(carpetaFotos);
  fs.mkdirSync(carpetaDeFotos, { recursive: true });

  const app = express();

  // No anunciar qué framework usa el servidor.
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);
  app.set('view engine', 'ejs');
  app.set('views', CARPETA_VISTAS);
  // Funciones de presentación (fechas, teléfonos, iniciales) disponibles en todas las vistas.
  Object.assign(app.locals, ayudantes);

  // 1. Cabeceras de seguridad (CSP, HSTS, etc.) en todas las respuestas, también en los estáticos.
  app.use(cabecerasDeSeguridad({ produccion }));

  // 2. Archivos estáticos: antes de la sesión, así el CSS no consulta la base de datos.
  app.use(express.static(CARPETA_PUBLICA, { index: false }));

  // 3. Desde aquí todo es dinámico: Cache-Control: no-store (datos personales y token CSRF).
  app.use(sinCache);

  // 4. Formularios (application/x-www-form-urlencoded), con un límite de tamaño.
  //    extended: false → un campo repetido (name="telefonos" en varias filas) llega como lista.
  app.use(express.urlencoded({ extended: false, limit: '10kb' }));

  // 5. Sesión guardada en SQLite, y los avisos de una sola vez que se guardan en ella.
  const sesion = crearSesion({ db, secreto: sessionSecret, produccion });
  app.use(sesion.middleware);
  app.use(avisos);

  // 6. CSRF: todo POST/PUT/PATCH/DELETE debe traer el token de la sesión, también el login.
  //    Las rutas multipart (la foto) lo verifican ellas mismas, después de leer el cuerpo.
  app.use(crearProteccionCsrf({ excepto: RUTAS_MULTIPART }));

  // 7. Rutas públicas.
  app.use(crearRutasLogin(db));

  // 8. Desde aquí todo exige sesión iniciada. Toda ruta nueva se registra DEBAJO de esta línea,
  //    así queda protegida por defecto.
  app.use(requiereSesion(db));

  // 9. Rutas protegidas.
  app.use(inicioRouter);
  app.use(crearRutasContactos(db, { carpetaFotos: carpetaDeFotos, registrarError }));
  app.use(crearRutaFotos(db, carpetaDeFotos));
  app.use(crearRutaLogout(sesion));

  // 10. Página no encontrada (solo la ve quien tiene sesión: al resto el paso 8 lo manda al login,
  //     así no se revela qué rutas existen).
  app.use(noEncontrado(registrarError));

  // 11. Errores: página genérica, sin stack.
  app.use(manejarErrores(registrarError));

  return app;
}
