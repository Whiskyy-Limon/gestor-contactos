import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config/index.js';

// Abre la base de datos SQLite y aplica la configuración que necesita cada conexión.
// Recibe la ruta como parámetro para que las pruebas puedan usar ':memory:'.
export function abrirBaseDeDatos(ruta = config.databasePath) {
  if (ruta !== ':memory:') {
    fs.mkdirSync(path.dirname(ruta), { recursive: true });
  }

  const db = new Database(ruta);

  // SQLite solo verifica las claves foráneas si se activa en cada conexión.
  db.pragma('foreign_keys = ON');
  // WAL permite leer mientras otra operación escribe. En ':memory:' no aplica y SQLite lo ignora.
  db.pragma('journal_mode = WAL');

  return db;
}
