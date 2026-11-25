// Aplica las migraciones pendientes de src/db/migrations a la base de datos de DATABASE_PATH.
import { config } from '../src/config/index.js';
import { abrirBaseDeDatos } from '../src/db/conexion.js';
import { aplicarMigraciones } from '../src/db/migraciones.js';

const db = abrirBaseDeDatos();

try {
  const aplicadas = aplicarMigraciones(db);

  if (aplicadas.length === 0) {
    console.log(`Sin migraciones pendientes: ${config.databasePath} ya está al día.`);
  } else {
    for (const nombre of aplicadas) {
      console.log(`Aplicada: ${nombre}`);
    }
    console.log(`${aplicadas.length} migración(es) aplicada(s) en ${config.databasePath}.`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  db.close();
}
