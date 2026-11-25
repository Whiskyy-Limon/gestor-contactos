import { crearApp } from './app.js';
import { config } from './config/index.js';
import { abrirBaseDeDatos } from './db/conexion.js';
import { migracionesPendientes } from './db/migraciones.js';

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

  app.listen(config.port, (error) => {
    if (error) {
      console.error(`No se pudo iniciar el servidor: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Servidor escuchando en http://localhost:${config.port} (${config.nodeEnv})`);
  });
}

try {
  iniciar();
} catch (error) {
  console.error(`No se pudo iniciar el servidor: ${error.message}`);
  process.exitCode = 1;
}
