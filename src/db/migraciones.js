import fs from 'node:fs';
import path from 'node:path';

const CARPETA_MIGRACIONES = path.join(import.meta.dirname, 'migrations');
const PATRON_NOMBRE = /^\d{3}_[a-z0-9_]+\.sql$/;

// Nombres de los archivos de migración de la carpeta, en orden.
function listarMigraciones(carpeta) {
  const archivos = fs
    .readdirSync(carpeta)
    .filter((nombre) => nombre.endsWith('.sql'))
    .sort();

  for (const nombre of archivos) {
    if (!PATRON_NOMBRE.test(nombre)) {
      throw new Error(`Nombre de migración inválido: ${nombre}. Usa el formato 001_descripcion.sql`);
    }
  }
  return archivos;
}

// Migraciones ya registradas en schema_migrations (vacío si la tabla todavía no existe).
function migracionesRegistradas(db) {
  const existeTabla = db
    .prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'schema_migrations'")
    .get();
  if (!existeTabla) {
    return new Set();
  }
  return new Set(db.prepare('SELECT nombre FROM schema_migrations').pluck().all());
}

// Devuelve, en orden, las migraciones que faltan aplicar. No modifica la base de datos.
export function migracionesPendientes(db, carpeta = CARPETA_MIGRACIONES) {
  const registradas = migracionesRegistradas(db);
  return listarMigraciones(carpeta).filter((nombre) => !registradas.has(nombre));
}

// Aplica, en orden, las migraciones pendientes de la carpeta.
// Cada migración corre en su propia transacción: si falla, no queda aplicada a medias.
// Devuelve los nombres de las migraciones aplicadas en esta ejecución.
export function aplicarMigraciones(db, carpeta = CARPETA_MIGRACIONES) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      nombre       TEXT PRIMARY KEY,
      aplicada_en  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    ) STRICT
  `);

  const registrar = db.prepare('INSERT INTO schema_migrations (nombre) VALUES (?)');
  const aplicadas = [];

  for (const nombre of migracionesPendientes(db, carpeta)) {
    const sql = fs.readFileSync(path.join(carpeta, nombre), 'utf8');
    try {
      db.transaction(() => {
        db.exec(sql);
        registrar.run(nombre);
      })();
    } catch (error) {
      throw new Error(`Falló la migración ${nombre}: ${error.message}`, { cause: error });
    }
    aplicadas.push(nombre);
  }

  return aplicadas;
}
