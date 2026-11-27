import { crearApp } from './app.js';
import { config } from './config/index.js';
import { abrirBaseDeDatos } from './db/conexion.js';
import { migracionesPendientes } from './db/migraciones.js';

// Direcciones a las que solo se llega desde esta misma computadora.
const DIRECCION_LOCAL = /^(localhost|127(\.\d{1,3}){3}|::1)$/i;

// B2: fuera de producción la cookie de sesión no lleva Secure y no se envía HSTS. Eso está bien en
// la propia computadora, pero no en un servidor al que se llega desde la red: se avisa al arrancar.
function avisarSiNoEsSeguro() {
  if (config.isProduction || (config.host !== null && DIRECCION_LOCAL.test(config.host))) {
    return;
  }
  const direccion = config.host ?? 'todas las interfaces';
  console.warn(
    `Aviso: NODE_ENV no es production y el servidor escucha en ${direccion}, accesible desde otras ` +
      'computadoras de la red. En este modo la cookie de sesión no lleva Secure y no se envía HSTS: ' +
      'úsalo solo en una red de confianza. En un servidor real, usa NODE_ENV=production.',
  );
}

function iniciar() {
  const db = abrirBaseDeDatos();

  const pendientes = migracionesPendientes(db);
  if (pendientes.length > 0) {
    throw new Error(
      `la base de datos ${config.databasePath} tiene migraciones pendientes (${pendientes.join(', ')}). ` +
        'Ejecuta: npm run db:migrate',
    );
  }

  // crearApp lanza un error si falta SESSION_SECRET: sin secreto, el servidor no arranca.
  const app = crearApp({ db });

  // Sin host (null), Node escucha en todas las interfaces.
  const direccion = config.host === null ? [config.port] : [config.port, config.host];
  app.listen(...direccion, (error) => {
    if (error) {
      console.error(`No se pudo iniciar el servidor: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    avisarSiNoEsSeguro();
    console.log(
      `Servidor escuchando en http://localhost:${config.port} ` +
        `(${config.nodeEnv}; en ${config.host ?? 'todas las interfaces'})`,
    );
  });
}

try {
  iniciar();
} catch (error) {
  console.error(`No se pudo iniciar el servidor: ${error.message}`);
  process.exitCode = 1;
}
