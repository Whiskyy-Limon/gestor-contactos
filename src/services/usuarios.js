import bcrypt from 'bcryptjs';
import { esquemaLogin, esquemaNuevoUsuario } from '../validators/usuarios.js';
import { ErrorDeValidacion, validar } from '../validators/validar.js';

// Costo de bcrypt (2^12 rondas). En esta máquina una comparación tarda unos 200 ms.
export const COSTO_BCRYPT = 12;

// Hash bcrypt (costo 12) de un texto aleatorio que no se guardó en ningún lado: no coincide con
// ninguna contraseña. Si el correo no existe, se compara contra este hash para que la respuesta
// tarde lo mismo que con un correo real y el tiempo no revele qué correos tienen cuenta (U4).
// Si se cambia COSTO_BCRYPT, hay que generar este hash de nuevo con el costo nuevo.
const HASH_FALSO = '$2b$12$eBiw5wb7LUFCzsT8I2sKcOlqDQxF8sg9UiZ07az33F3ty..59Sig.';

// Datos del usuario que se pueden mostrar (nunca el hash).
function datosPublicos(fila) {
  return { id: fila.id, nombre: fila.nombre, correo: fila.correo };
}

export function buscarUsuarioPorId(db, id) {
  const fila = db.prepare('SELECT id, nombre, correo FROM usuarios WHERE id = ?').get(id);
  return fila ? datosPublicos(fila) : null;
}

// Verifica correo y contraseña. Devuelve el usuario si son correctos o null si no (sin decir
// cuál de los dos falló).
export async function autenticar(db, entrada) {
  const resultado = esquemaLogin.safeParse(entrada);
  if (!resultado.success) {
    return null;
  }
  const { correo, password } = resultado.data;

  const fila = db.prepare('SELECT id, nombre, correo, password_hash FROM usuarios WHERE correo = ?').get(correo);
  const coincide = await bcrypt.compare(password, fila?.password_hash ?? HASH_FALSO);

  return fila && coincide ? datosPublicos(fila) : null;
}

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
