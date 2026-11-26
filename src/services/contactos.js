import { esquemaContacto } from '../validators/contactos.js';
import { ErrorDeValidacion, validar } from '../validators/validar.js';

// C2: DNI ya registrado. El error incluye el contacto que lo tiene, para enlazarlo desde el
// formulario (y, si está archivado, ofrecer restaurarlo). Si ese contacto ya no se encuentra al
// armar el mensaje, el mensaje es genérico.
function errorDniRepetido(existente) {
  if (!existente) {
    return new ErrorDeValidacion([{ campo: 'dni', mensaje: 'Ya existe un contacto con este DNI.' }]);
  }
  const nombre = `${existente.nombres} ${existente.apellidos}`;
  const archivado = existente.archivado_en !== null;
  const mensaje = archivado
    ? `Este DNI pertenece a un contacto archivado: ${nombre}.`
    : `Ya existe un contacto con este DNI: ${nombre}.`;
  return new ErrorDeValidacion([{ campo: 'dni', mensaje, contacto: { id: existente.id, nombre, archivado } }]);
}

function buscarPorDni(db, dni) {
  return db.prepare('SELECT id, nombres, apellidos, archivado_en FROM contactos WHERE dni = ?').get(dni);
}

function insertarTelefonosYCorreos(db, contactoId, { telefonos, correos }) {
  const insertarTelefono = db.prepare('INSERT INTO telefonos (contacto_id, numero, tipo) VALUES (?, ?, ?)');
  for (const { numero, tipo } of telefonos) {
    insertarTelefono.run(contactoId, numero, tipo);
  }
  const insertarCorreo = db.prepare('INSERT INTO correos (contacto_id, correo) VALUES (?, ?)');
  for (const correo of correos) {
    insertarCorreo.run(contactoId, correo);
  }
}

// Crea un contacto con sus teléfonos y correos y devuelve su id.
// `usuarioId` queda como quien lo creó y como su última modificación (A1).
// Lanza ErrorDeValidacion si los datos no cumplen las reglas o si el DNI ya existe (C2).
export function crearContacto(db, entrada, usuarioId) {
  const datos = validar(esquemaContacto, entrada);

  // Todo en una transacción: o se guardan el contacto, sus teléfonos y sus correos, o nada.
  const crear = db.transaction(() => {
    const resultado = db
      .prepare(
        `INSERT INTO contactos (nombres, apellidos, dni, tipo, creado_por, actualizado_por)
         VALUES (@nombres, @apellidos, @dni, @tipo, @usuarioId, @usuarioId)`,
      )
      .run({ nombres: datos.nombres, apellidos: datos.apellidos, dni: datos.dni, tipo: datos.tipo, usuarioId });
    const contactoId = Number(resultado.lastInsertRowid);

    insertarTelefonosYCorreos(db, contactoId, datos);
    return contactoId;
  });

  try {
    return crear();
  } catch (error) {
    // El DNI repetido lo detecta el UNIQUE de la tabla, que también funciona si dos personas guardan
    // el mismo DNI a la vez. Recién entonces se busca quién lo tiene, para el mensaje.
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' && error.message.includes('contactos.dni')) {
      throw errorDniRepetido(buscarPorDni(db, datos.dni));
    }
    throw error;
  }
}

// Contacto completo para la página de detalle, con su auditoría (A1), o null si no existe.
export function buscarContacto(db, id) {
  const fila = db
    .prepare(
      `SELECT c.id, c.nombres, c.apellidos, c.dni, c.tipo, c.foto, c.version,
              c.creado_en, c.actualizado_en, c.archivado_en,
              creador.nombre    AS creado_por_nombre,
              editor.nombre     AS actualizado_por_nombre,
              archivador.nombre AS archivado_por_nombre
       FROM contactos c
       JOIN usuarios creador        ON creador.id = c.creado_por
       JOIN usuarios editor         ON editor.id = c.actualizado_por
       LEFT JOIN usuarios archivador ON archivador.id = c.archivado_por
       WHERE c.id = ?`,
    )
    .get(id);
  if (!fila) {
    return null;
  }

  const telefonos = db.prepare('SELECT numero, tipo FROM telefonos WHERE contacto_id = ? ORDER BY id').all(id);
  const correos = db.prepare('SELECT correo FROM correos WHERE contacto_id = ? ORDER BY id').pluck().all(id);

  return {
    id: fila.id,
    nombres: fila.nombres,
    apellidos: fila.apellidos,
    dni: fila.dni,
    tipo: fila.tipo,
    foto: fila.foto,
    version: fila.version,
    archivado: fila.archivado_en !== null,
    auditoria: {
      creado: { por: fila.creado_por_nombre, en: fila.creado_en },
      actualizado: { por: fila.actualizado_por_nombre, en: fila.actualizado_en },
      archivado: fila.archivado_en ? { por: fila.archivado_por_nombre, en: fila.archivado_en } : null,
    },
    telefonos,
    correos,
  };
}
