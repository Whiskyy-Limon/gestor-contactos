import bcrypt from 'bcryptjs';
import { esquemaNuevoUsuario } from '../validators/usuarios.js';
import { ErrorDeValidacion, validar } from '../validators/validar.js';

// Costo de bcrypt (2^12 rondas). En esta máquina una comparación tarda unos 200 ms.
export const COSTO_BCRYPT = 12;

const ERROR_CORREO_REPETIDO = { campo: 'correo', mensaje: 'Ya existe un usuario con ese correo.' };

// Crea un usuario (U1–U3) y devuelve { id, nombre, correo }.
// Lanza ErrorDeValidacion si los datos no cumplen las reglas o si el correo ya existe.
// `costo` solo se cambia en las pruebas, para que sean rápidas.
export async function crearUsuario(db, entrada, { costo = COSTO_BCRYPT } = {}) {
  const { nombre, correo, password } = validar(esquemaNuevoUsuario, entrada);

  // Revisión previa para dar un mensaje claro sin gastar tiempo en calcular el hash.
  // La columna correo es UNIQUE COLLATE NOCASE, así que la comparación ignora mayúsculas.
  const existe = db.prepare('SELECT 1 FROM usuarios WHERE correo = ?').get(correo);
  if (existe) {
    throw new ErrorDeValidacion([ERROR_CORREO_REPETIDO]);
  }

  const passwordHash = await bcrypt.hash(password, costo);

  try {
    const resultado = db
      .prepare('INSERT INTO usuarios (nombre, correo, password_hash) VALUES (?, ?, ?)')
      .run(nombre, correo, passwordHash);
    return { id: Number(resultado.lastInsertRowid), nombre, correo };
  } catch (error) {
    // Si otro proceso creó el mismo correo mientras se calculaba el hash, el UNIQUE lo frena.
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new ErrorDeValidacion([ERROR_CORREO_REPETIDO]);
    }
    throw error;
  }
}
