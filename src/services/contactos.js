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

// El DNI repetido lo detecta el UNIQUE de la tabla, que también funciona si dos personas guardan el
// mismo DNI a la vez. Recién entonces se busca quién lo tiene, para el mensaje.
function esDniRepetido(error) {
  return error.code === 'SQLITE_CONSTRAINT_UNIQUE' && error.message.includes('contactos.dni');
}

const AHORA = "strftime('%Y-%m-%dT%H:%M:%SZ', 'now')";

// C7 y C5: una edición que no se guardó porque el contacto cambió mientras se editaba
// (motivo 'version') o porque está archivado (motivo 'archivado').
// `actual` describe la versión guardada: { version, por, en } (quién y cuándo la modificó).
export class ConflictoDeEdicion extends Error {
  constructor(motivo, actual) {
    super(`No se guardó la edición del contacto: ${motivo}`);
    this.name = 'ConflictoDeEdicion';
    this.status = 409;
    this.motivo = motivo;
    this.actual = actual;
  }
}

function contactoNoEncontrado() {
  const error = new Error('Contacto no encontrado');
  error.status = 404;
  return error;
}

function existeContacto(db, id) {
  return db.prepare('SELECT 1 FROM contactos WHERE id = ?').get(id) !== undefined;
}

// C7: versión que llegó en el campo oculto del formulario. Si no es un entero válido, 0: no
// coincide con ninguna (la columna exige version >= 1), así que se trata como un conflicto.
function versionDelFormulario(valor) {
  return typeof valor === 'string' && /^[1-9]\d{0,9}$/.test(valor) ? Number(valor) : 0;
}

// Por qué el UPDATE no modificó el contacto `id`: no existe, está archivado o cambió de versión.
function motivoDelRechazo(db, id) {
  const fila = db
    .prepare(
      `SELECT c.version, c.archivado_en, c.actualizado_en, u.nombre AS actualizado_por
       FROM contactos c JOIN usuarios u ON u.id = c.actualizado_por
       WHERE c.id = ?`,
    )
    .get(id);
  if (!fila) {
    return contactoNoEncontrado();
  }
  const actual = { version: fila.version, por: fila.actualizado_por, en: fila.actualizado_en };
  return new ConflictoDeEdicion(fila.archivado_en !== null ? 'archivado' : 'version', actual);
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
    throw esDniRepetido(error) ? errorDniRepetido(buscarPorDni(db, datos.dni)) : error;
  }
}

// Edita un contacto: reemplaza sus datos, sus teléfonos y sus correos, en una transacción.
// `entrada.version` es la versión que se leyó al abrir el formulario (C7): si el contacto cambió
// desde entonces, no se guarda nada. Un contacto archivado no se edita (C5). Queda `usuarioId`
// como su última modificación (A1).
// Lanza ErrorDeValidacion (datos inválidos o DNI de otro contacto), ConflictoDeEdicion, o un error
// 404 si el contacto no existe.
export function editarContacto(db, id, entrada, usuarioId) {
  const datos = validar(esquemaContacto, entrada);
  const version = versionDelFormulario(entrada.version);

  const editar = db.transaction(() => {
    // Solo modifica si la versión es la que se leyó y el contacto no está archivado.
    const resultado = db
      .prepare(
        `UPDATE contactos
         SET nombres = @nombres, apellidos = @apellidos, dni = @dni, tipo = @tipo,
             actualizado_por = @usuarioId, actualizado_en = ${AHORA}, version = version + 1
         WHERE id = @id AND version = @version AND archivado_en IS NULL`,
      )
      .run({ nombres: datos.nombres, apellidos: datos.apellidos, dni: datos.dni, tipo: datos.tipo, usuarioId, id, version });
    if (resultado.changes === 0) {
      throw motivoDelRechazo(db, id);
    }

    db.prepare('DELETE FROM telefonos WHERE contacto_id = ?').run(id);
    db.prepare('DELETE FROM correos WHERE contacto_id = ?').run(id);
    insertarTelefonosYCorreos(db, id, datos);
  });

  try {
    editar();
  } catch (error) {
    throw esDniRepetido(error) ? errorDniRepetido(buscarPorDni(db, datos.dni)) : error;
  }
}

// C4: pone en el contacto la foto `foto` (nombre del archivo, o null para quitarla) y devuelve el
// nombre de la foto anterior (o null). Cambiar o quitar la foto cuenta como modificación (A1) y
// sube la versión (C7). Quitar la foto de un contacto que no tiene no cambia nada.
// Un contacto archivado no se modifica (C5): lanza ConflictoDeEdicion; si no existe, un error 404.
export function reemplazarFoto(db, id, foto, usuarioId) {
  const reemplazar = db.transaction(() => {
    const fila = db.prepare('SELECT foto FROM contactos WHERE id = ? AND archivado_en IS NULL').get(id);
    if (!fila) {
      throw motivoDelRechazo(db, id);
    }
    if (fila.foto === null && foto === null) {
      return null;
    }
    db.prepare(
      `UPDATE contactos SET foto = ?, actualizado_por = ?, actualizado_en = ${AHORA}, version = version + 1
       WHERE id = ?`,
    ).run(foto, usuarioId, id);
    return fila.foto;
  });
  return reemplazar();
}

// C5, A1: archiva un contacto, con fecha y autor. Devuelve false si ya estaba archivado.
// Archivar no cuenta como su última modificación (tiene sus propias columnas), pero sí aumenta la
// versión (C7): una edición abierta antes ya no se puede guardar.
export function archivarContacto(db, id, usuarioId) {
  const { changes } = db
    .prepare(
      `UPDATE contactos SET archivado_en = ${AHORA}, archivado_por = ?, version = version + 1
       WHERE id = ? AND archivado_en IS NULL`,
    )
    .run(usuarioId, id);
  if (changes === 0 && !existeContacto(db, id)) {
    throw contactoNoEncontrado();
  }
  return changes === 1;
}

// C5, A1: restaura un contacto archivado. Se borra quién lo archivó y restaurar cuenta como su
// última modificación. Devuelve false si no estaba archivado.
export function restaurarContacto(db, id, usuarioId) {
  const { changes } = db
    .prepare(
      `UPDATE contactos
       SET archivado_en = NULL, archivado_por = NULL,
           actualizado_por = ?, actualizado_en = ${AHORA}, version = version + 1
       WHERE id = ? AND archivado_en IS NOT NULL`,
    )
    .run(usuarioId, id);
  if (changes === 0 && !existeContacto(db, id)) {
    throw contactoNoEncontrado();
  }
  return changes === 1;
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
