// Pruebas del esquema de la base de datos y del migrador.
// Cada prueba usa una base de datos nueva en memoria: nunca toca la base real.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { abrirBaseDeDatos } from '../src/db/conexion.js';
import { aplicarMigraciones, migracionesPendientes } from '../src/db/migraciones.js';
import { normalizarParaBusqueda } from '../src/services/busqueda.js';
import {
  CODIGOS_AREA_PROVINCIA,
  LARGO_DNI,
  LETRAS_NO_ASCII_NOMBRE,
  MAXIMO_CARACTERES_CORREO,
  MAXIMO_CARACTERES_NOMBRE,
  MAXIMO_CORREOS_POR_CONTACTO,
  MAXIMO_TELEFONOS_POR_CONTACTO,
  MINIMO_CARACTERES_NOMBRE,
  TIPOS_CONTACTO,
} from '../src/validators/reglas.js';

// Texto con forma de hash bcrypt. Estas pruebas no verifican contraseñas.
const HASH_DE_PRUEBA = '$2b$10$' + 'a'.repeat(53);
const CARPETA_MIGRACIONES = path.join(import.meta.dirname, '..', 'src', 'db', 'migrations');
const AHORA = "strftime('%Y-%m-%dT%H:%M:%SZ', 'now')";

describe('esquema de la base de datos', () => {
  let db;
  let usuarioId;

  beforeEach(() => {
    db = abrirBaseDeDatos(':memory:');
    aplicarMigraciones(db);
    usuarioId = insertarUsuario('prueba@empresa.pe');
  });

  afterEach(() => {
    db.close();
  });

  function insertarUsuario(correo) {
    const resultado = db
      .prepare('INSERT INTO usuarios (nombre, correo, password_hash) VALUES (?, ?, ?)')
      .run('Usuaria de Prueba', correo, HASH_DE_PRUEBA);
    return Number(resultado.lastInsertRowid);
  }

  function insertarContacto({
    dni = '12345678',
    nombres = 'Ana María',
    apellidos = 'Pérez Núñez',
    tipo = 'cliente',
    actualizadoPor = usuarioId,
  } = {}) {
    const resultado = db
      .prepare(
        `INSERT INTO contactos (nombres, apellidos, dni, tipo, creado_por, actualizado_por)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(nombres, apellidos, dni, tipo, usuarioId, actualizadoPor);
    return Number(resultado.lastInsertRowid);
  }

  function archivar(contactoId, archivadoPor = usuarioId) {
    db.prepare(`UPDATE contactos SET archivado_en = ${AHORA}, archivado_por = ? WHERE id = ?`).run(
      archivadoPor,
      contactoId,
    );
  }

  function leerContacto(contactoId) {
    return db.prepare('SELECT * FROM contactos WHERE id = ?').get(contactoId);
  }

  function insertarTelefono(contactoId, numero, tipo = 'celular') {
    db.prepare('INSERT INTO telefonos (contacto_id, numero, tipo) VALUES (?, ?, ?)').run(contactoId, numero, tipo);
  }

  function insertarCorreo(contactoId, correo) {
    db.prepare('INSERT INTO correos (contacto_id, correo) VALUES (?, ?)').run(contactoId, correo);
  }

  function contarTelefonos(contactoId) {
    return db.prepare('SELECT count(*) FROM telefonos WHERE contacto_id = ?').pluck().get(contactoId);
  }

  function contarCorreos(contactoId) {
    return db.prepare('SELECT count(*) FROM correos WHERE contacto_id = ?').pluck().get(contactoId);
  }

  describe('DNI (C2)', () => {
    it('rechaza un DNI duplicado', () => {
      insertarContacto({ dni: '12345678' });

      assert.throws(() => insertarContacto({ dni: '12345678', nombres: 'Luis' }), {
        code: 'SQLITE_CONSTRAINT_UNIQUE',
      });
    });

    it('rechaza un DNI duplicado aunque el contacto esté archivado', () => {
      archivar(insertarContacto({ dni: '12345678' }));

      assert.throws(() => insertarContacto({ dni: '12345678', nombres: 'Luis' }), {
        code: 'SQLITE_CONSTRAINT_UNIQUE',
      });
    });

    const dnisInvalidos = [
      ['1234567', 'de 7 dígitos'],
      ['123456789', 'de 9 dígitos'],
      ['1234567a', 'con una letra'],
      ['1234 567', 'con un espacio'],
      ['', 'vacío'],
    ];
    for (const [dni, descripcion] of dnisInvalidos) {
      it(`rechaza un DNI ${descripcion} (${JSON.stringify(dni)})`, () => {
        assert.throws(() => insertarContacto({ dni }), { code: 'SQLITE_CONSTRAINT_CHECK', message: /dni/ });
      });
    }

    it('rechaza un DNI enviado como número en vez de texto (perdería los ceros a la izquierda)', () => {
      assert.throws(() => insertarContacto({ dni: 12345678 }), { code: 'SQLITE_CONSTRAINT_CHECK', message: /dni/ });
    });
  });

  describe('teléfonos (C3, T1–T5)', () => {
    it('rechaza un teléfono repetido en el mismo contacto', () => {
      const contactoId = insertarContacto();
      insertarTelefono(contactoId, '987654321');

      assert.throws(() => insertarTelefono(contactoId, '987654321'), { code: 'SQLITE_CONSTRAINT_UNIQUE' });
    });

    it('permite el mismo teléfono en contactos distintos', () => {
      const ana = insertarContacto({ dni: '11111111' });
      const luis = insertarContacto({ dni: '22222222' });

      insertarTelefono(ana, '012345678', 'fijo');
      insertarTelefono(luis, '012345678', 'fijo');

      assert.equal(contarTelefonos(luis), 1);
    });

    it('acepta celular, fijo de Lima y fijo de provincia', () => {
      const contactoId = insertarContacto();

      insertarTelefono(contactoId, '987654321', 'celular');
      insertarTelefono(contactoId, '012345678', 'fijo');
      insertarTelefono(contactoId, '44123456', 'fijo');

      assert.equal(contarTelefonos(contactoId), 3);
    });

    const telefonosInvalidos = [
      ['celular', '887654321', 'un celular que no empieza con 9'],
      ['celular', '98765432', 'un celular de 8 dígitos'],
      ['celular', '987 654 321', 'un número sin normalizar'],
      ['celular', '51987654321', 'un celular con el prefijo 51'],
      ['fijo', '987654321', 'un celular marcado como fijo'],
      ['fijo', '01234567', 'un fijo de Lima de 8 dígitos'],
      ['fijo', '044123456', 'un fijo de provincia con el 0 inicial'],
      ['fijo', '45123456', 'un fijo con un código de área que no existe'],
      ['movil', '987654321', 'un tipo desconocido'],
    ];
    for (const [tipo, numero, descripcion] of telefonosInvalidos) {
      it(`rechaza ${descripcion} (${tipo} ${JSON.stringify(numero)})`, () => {
        const contactoId = insertarContacto();
        assert.throws(() => insertarTelefono(contactoId, numero, tipo), { code: 'SQLITE_CONSTRAINT_CHECK' });
      });
    }

    it('acepta exactamente los códigos de área de CODIGOS_AREA_PROVINCIA', () => {
      const contactoId = insertarContacto();
      const aceptados = [];

      for (let n = 0; n <= 99; n++) {
        const codigo = String(n).padStart(2, '0');
        try {
          insertarTelefono(contactoId, `${codigo}123456`, 'fijo');
          aceptados.push(codigo);
          db.prepare('DELETE FROM telefonos WHERE contacto_id = ?').run(contactoId);
        } catch (error) {
          assert.equal(error.code, 'SQLITE_CONSTRAINT_CHECK');
        }
      }

      assert.deepEqual(aceptados, [...CODIGOS_AREA_PROVINCIA]);
    });

    it(`rechaza más de ${MAXIMO_TELEFONOS_POR_CONTACTO} teléfonos por contacto`, () => {
      const contactoId = insertarContacto();
      for (let i = 0; i < MAXIMO_TELEFONOS_POR_CONTACTO; i++) {
        insertarTelefono(contactoId, `98765432${i}`);
      }

      assert.throws(() => insertarTelefono(contactoId, '987654329'), {
        code: 'SQLITE_CONSTRAINT_TRIGGER',
        message: /más de 5 teléfonos/,
      });
    });
  });

  describe('correos (C3, E1)', () => {
    it('rechaza un correo repetido en el mismo contacto', () => {
      const contactoId = insertarContacto();
      insertarCorreo(contactoId, 'ana@empresa.pe');

      assert.throws(() => insertarCorreo(contactoId, 'ana@empresa.pe'), { code: 'SQLITE_CONSTRAINT_UNIQUE' });
    });

    it('rechaza un correo con mayúsculas', () => {
      const contactoId = insertarContacto();

      assert.throws(() => insertarCorreo(contactoId, 'Ana@Empresa.pe'), { code: 'SQLITE_CONSTRAINT_CHECK' });
    });

    it(`rechaza más de ${MAXIMO_CORREOS_POR_CONTACTO} correos por contacto`, () => {
      const contactoId = insertarContacto();
      for (let i = 0; i < MAXIMO_CORREOS_POR_CONTACTO; i++) {
        insertarCorreo(contactoId, `ana${i}@empresa.pe`);
      }

      assert.throws(() => insertarCorreo(contactoId, 'ana9@empresa.pe'), {
        code: 'SQLITE_CONSTRAINT_TRIGGER',
        message: /más de 5 correos/,
      });
    });
  });

  describe('largos de texto (C1, C2, E1)', () => {
    // true si la base de datos acepta el cambio; false si lo rechaza un CHECK.
    function acepta(accion) {
      try {
        accion();
        return true;
      } catch (error) {
        assert.equal(error.code, 'SQLITE_CONSTRAINT_CHECK');
        return false;
      }
    }

    it('nombres y apellidos: la BD acepta exactamente el rango de reglas.js', () => {
      let dni = 10000000;
      const aceptaLargo = (campo, largo) =>
        acepta(() => insertarContacto({ dni: String(dni++), [campo]: 'a'.repeat(largo) }));

      for (const campo of ['nombres', 'apellidos']) {
        assert.equal(aceptaLargo(campo, MINIMO_CARACTERES_NOMBRE - 1), false, campo);
        assert.equal(aceptaLargo(campo, MINIMO_CARACTERES_NOMBRE), true, campo);
        assert.equal(aceptaLargo(campo, MAXIMO_CARACTERES_NOMBRE), true, campo);
        assert.equal(aceptaLargo(campo, MAXIMO_CARACTERES_NOMBRE + 1), false, campo);
      }
    });

    it('DNI: la BD exige LARGO_DNI dígitos', () => {
      assert.equal(acepta(() => insertarContacto({ dni: '1'.repeat(LARGO_DNI - 1) })), false);
      assert.equal(acepta(() => insertarContacto({ dni: '1'.repeat(LARGO_DNI + 1) })), false);
      assert.equal(acepta(() => insertarContacto({ dni: '1'.repeat(LARGO_DNI) })), true);
    });

    it('correo: la BD acepta hasta MAXIMO_CARACTERES_CORREO caracteres', () => {
      const contactoId = insertarContacto();
      const correoDeLargo = (largo) => `${'a'.repeat(largo - '@empresa.pe'.length)}@empresa.pe`;

      assert.equal(acepta(() => insertarCorreo(contactoId, correoDeLargo(MAXIMO_CARACTERES_CORREO + 1))), false);
      assert.equal(acepta(() => insertarCorreo(contactoId, correoDeLargo(MAXIMO_CARACTERES_CORREO))), true);
    });
  });

  describe('tipo de contacto (C6)', () => {
    it('acepta exactamente los tipos de TIPOS_CONTACTO', () => {
      const candidatos = [...TIPOS_CONTACTO, 'Cliente', 'clientes', 'proveedores', 'otro', ' ambos', ''];
      const aceptados = [];

      candidatos.forEach((tipo, i) => {
        try {
          insertarContacto({ dni: String(10000000 + i), tipo });
          aceptados.push(tipo);
        } catch (error) {
          assert.equal(error.code, 'SQLITE_CONSTRAINT_CHECK');
        }
      });

      assert.deepEqual(aceptados, [...TIPOS_CONTACTO]);
    });

    it('rechaza un contacto sin tipo', () => {
      const sinTipo = () =>
        db
          .prepare('INSERT INTO contactos (nombres, apellidos, dni, creado_por, actualizado_por) VALUES (?, ?, ?, ?, ?)')
          .run('Ana', 'Pérez', '12345678', usuarioId, usuarioId);

      assert.throws(sinTipo, { code: 'SQLITE_CONSTRAINT_CHECK', message: /tipo/ });
    });
  });

  describe('auditoría (A1)', () => {
    it('rechaza un contacto sin quién lo modificó por última vez', () => {
      assert.throws(() => insertarContacto({ actualizadoPor: null }), {
        code: 'SQLITE_CONSTRAINT_CHECK',
        message: /actualizado_por/,
      });
    });

    it('rechaza como autor a alguien que no es un usuario', () => {
      const contactoId = insertarContacto();

      assert.throws(() => insertarContacto({ dni: '22222222', actualizadoPor: 999 }), {
        code: 'SQLITE_CONSTRAINT_FOREIGNKEY',
      });
      assert.throws(() => archivar(contactoId, 999), { code: 'SQLITE_CONSTRAINT_FOREIGNKEY' });
    });

    it('un contacto se archiva con fecha y autor, o no tiene ninguno de los dos', () => {
      const contactoId = insertarContacto();
      const soloFecha = () => db.prepare(`UPDATE contactos SET archivado_en = ${AHORA} WHERE id = ?`).run(contactoId);
      const soloAutor = () =>
        db.prepare('UPDATE contactos SET archivado_por = ? WHERE id = ?').run(usuarioId, contactoId);

      assert.throws(soloFecha, { code: 'SQLITE_CONSTRAINT_CHECK', message: /archivado_por/ });
      assert.throws(soloAutor, { code: 'SQLITE_CONSTRAINT_CHECK', message: /archivado_por/ });

      archivar(contactoId);
      assert.equal(leerContacto(contactoId).archivado_por, usuarioId);

      db.prepare('UPDATE contactos SET archivado_en = NULL, archivado_por = NULL WHERE id = ?').run(contactoId);
      assert.equal(leerContacto(contactoId).archivado_en, null);
    });

    it('no permite borrar a un usuario que modificó o archivó un contacto', () => {
      const editora = insertarUsuario('editora@empresa.pe');
      const archivadora = insertarUsuario('archivadora@empresa.pe');
      const sinContactos = insertarUsuario('nueva@empresa.pe');
      archivar(insertarContacto({ actualizadoPor: editora }), archivadora);
      const borrarUsuario = (id) => db.prepare('DELETE FROM usuarios WHERE id = ?').run(id);
      // SQLite informa ON DELETE RESTRICT con el código SQLITE_CONSTRAINT_TRIGGER; se verifica el mensaje.
      const restriccion = { message: /FOREIGN KEY constraint failed/ };

      assert.throws(() => borrarUsuario(editora), restriccion);
      assert.throws(() => borrarUsuario(archivadora), restriccion);
      assert.equal(borrarUsuario(sinContactos).changes, 1);
    });
  });

  describe('versión (C7)', () => {
    it('empieza en 1 y no acepta valores menores', () => {
      const contactoId = insertarContacto();

      assert.equal(leerContacto(contactoId).version, 1);
      assert.throws(() => db.prepare('UPDATE contactos SET version = 0 WHERE id = ?').run(contactoId), {
        code: 'SQLITE_CONSTRAINT_CHECK',
        message: /version/,
      });
    });
  });

  describe('búsqueda sin tildes (B2)', () => {
    function columnasDeBusqueda(contactoId) {
      return db
        .prepare('SELECT nombres_busqueda, apellidos_busqueda FROM contactos WHERE id = ?')
        .get(contactoId);
    }

    it('guarda nombres y apellidos sin tildes ni mayúsculas, con la ñ como n', () => {
      const contactoId = insertarContacto({ nombres: 'José Ñandú', apellidos: "Álvarez-Müller O'Brien" });

      assert.deepEqual(columnasDeBusqueda(contactoId), {
        nombres_busqueda: 'jose nandu',
        apellidos_busqueda: "alvarez-muller o'brien",
      });
    });

    it('se recalculan solas al cambiar el nombre y no se pueden escribir a mano', () => {
      const contactoId = insertarContacto();

      db.prepare('UPDATE contactos SET nombres = ? WHERE id = ?').run('Íñigo', contactoId);

      assert.equal(columnasDeBusqueda(contactoId).nombres_busqueda, 'inigo');
      assert.throws(
        () => db.prepare("UPDATE contactos SET nombres_busqueda = 'otro' WHERE id = ?").run(contactoId),
        /generated column/,
      );
    });

    it('dan el mismo resultado que normalizarParaBusqueda() con cada carácter que admite C1', () => {
      const mayusculas = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const permitidos = [...mayusculas, ...mayusculas.toLowerCase(), ...LETRAS_NO_ASCII_NOMBRE, ' ', "'", '-'];
      const contactoId = insertarContacto();
      const cambiarNombre = db.prepare('UPDATE contactos SET nombres = ?, apellidos = ? WHERE id = ?');

      for (const caracter of permitidos) {
        const texto = `a${caracter}a`;
        cambiarNombre.run(texto, texto, contactoId);

        const { nombres_busqueda, apellidos_busqueda } = columnasDeBusqueda(contactoId);
        const esperado = normalizarParaBusqueda(texto);
        assert.equal(nombres_busqueda, esperado, `nombres con ${JSON.stringify(caracter)}`);
        assert.equal(apellidos_busqueda, esperado, `apellidos con ${JSON.stringify(caracter)}`);
        assert.match(esperado, /^[a-z' -]+$/, `${JSON.stringify(caracter)} debe quedar en ASCII`);
      }
    });

    it('el orden por apellidos ignora las tildes: "Álvarez" queda en la A y "Ñique" junto a la N', () => {
      const apellidos = ['Zúñiga', 'Benítez', 'Álvarez', 'alvarado', 'Ñique', 'Ochoa'];
      apellidos.forEach((apellido, i) => insertarContacto({ dni: String(10000000 + i), apellidos: apellido }));

      const orden = db
        .prepare(
          `SELECT apellidos FROM contactos WHERE archivado_en IS NULL
           ORDER BY apellidos_busqueda, nombres_busqueda`,
        )
        .pluck()
        .all();

      assert.deepEqual(orden, ['alvarado', 'Álvarez', 'Benítez', 'Ñique', 'Ochoa', 'Zúñiga']);
    });

    it('el listado de activos se lee en orden desde el índice, sin ordenar en memoria', () => {
      const plan = db
        .prepare(
          `EXPLAIN QUERY PLAN SELECT id FROM contactos WHERE archivado_en IS NULL
           ORDER BY apellidos_busqueda, nombres_busqueda`,
        )
        .all()
        .map((paso) => paso.detail)
        .join('\n');

      assert.match(plan, /contactos_activos_por_nombre/);
      assert.doesNotMatch(plan, /TEMP B-TREE/);
    });
  });

  describe('usuarios (U3)', () => {
    it('rechaza un correo de usuario repetido aunque cambien las mayúsculas', () => {
      assert.throws(() => insertarUsuario('PRUEBA@Empresa.pe'), { code: 'SQLITE_CONSTRAINT_UNIQUE' });
    });
  });

  describe('sesiones (002)', () => {
    it('rechaza datos de sesión que no son JSON', () => {
      assert.throws(
        () =>
          db
            .prepare('INSERT INTO sesiones (sid, datos, expira_en) VALUES (?, ?, ?)')
            .run('abc', 'no es json', Date.now()),
        { code: 'SQLITE_CONSTRAINT_CHECK' },
      );
    });
  });

  describe('borrado en cascada', () => {
    // La aplicación archiva en vez de borrar (C5); la cascada protege la integridad
    // si alguna vez se borra un contacto directamente en la base de datos.
    it('borrar un contacto borra sus teléfonos y correos, y no los de otros contactos', () => {
      const borrado = insertarContacto({ dni: '11111111' });
      const otro = insertarContacto({ dni: '22222222' });
      insertarTelefono(borrado, '987654321');
      insertarTelefono(borrado, '012345678', 'fijo');
      insertarCorreo(borrado, 'ana@empresa.pe');
      insertarTelefono(otro, '912345678');
      insertarCorreo(otro, 'luis@empresa.pe');

      db.prepare('DELETE FROM contactos WHERE id = ?').run(borrado);

      assert.equal(contarTelefonos(borrado), 0);
      assert.equal(contarCorreos(borrado), 0);
      assert.equal(contarTelefonos(otro), 1);
      assert.equal(contarCorreos(otro), 1);
    });
  });
});

describe('migraciones', () => {
  it('aplica las migraciones pendientes una sola vez', () => {
    const db = abrirBaseDeDatos(':memory:');
    try {
      const primera = aplicarMigraciones(db);
      const segunda = aplicarMigraciones(db);

      assert.ok(primera.includes('001_esquema_inicial.sql'));
      assert.deepEqual(segunda, []);
    } finally {
      db.close();
    }
  });

  it('migracionesPendientes lista lo que falta sin modificar la base de datos', () => {
    const db = abrirBaseDeDatos(':memory:');
    try {
      const antes = migracionesPendientes(db);
      const tablas = db.prepare("SELECT count(*) FROM sqlite_schema WHERE type = 'table'").pluck().get();

      assert.ok(antes.includes('001_esquema_inicial.sql') && antes.includes('002_sesiones.sql'));
      assert.equal(tablas, 0);

      aplicarMigraciones(db);
      assert.deepEqual(migracionesPendientes(db), []);
    } finally {
      db.close();
    }
  });

  it('si una migración falla, no deja cambios a medias ni la registra', (t) => {
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'migraciones-prueba-'));
    t.after(() => fs.rmSync(carpeta, { recursive: true, force: true }));
    fs.writeFileSync(path.join(carpeta, '001_crea_a.sql'), 'CREATE TABLE a (x INTEGER) STRICT;');
    fs.writeFileSync(
      path.join(carpeta, '002_falla.sql'),
      'CREATE TABLE b (x INTEGER) STRICT; INSERT INTO tabla_que_no_existe VALUES (1);',
    );

    const db = abrirBaseDeDatos(':memory:');
    try {
      assert.throws(() => aplicarMigraciones(db, carpeta), /Falló la migración 002_falla\.sql/);

      const tablas = db
        .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name IN ('a', 'b') ORDER BY name")
        .pluck()
        .all();
      const registradas = db.prepare('SELECT nombre FROM schema_migrations').pluck().all();

      assert.deepEqual(tablas, ['a']);
      assert.deepEqual(registradas, ['001_crea_a.sql']);
    } finally {
      db.close();
    }
  });

  it('003 no se aplica si ya hay contactos, porque no puede inventarles un tipo ni un autor', (t) => {
    const MIGRACION_003 = '003_tipo_auditoria_y_busqueda.sql';
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'migraciones-prueba-'));
    t.after(() => fs.rmSync(carpeta, { recursive: true, force: true }));
    const copiar = (nombre) => fs.copyFileSync(path.join(CARPETA_MIGRACIONES, nombre), path.join(carpeta, nombre));
    copiar('001_esquema_inicial.sql');
    copiar('002_sesiones.sql');

    const db = abrirBaseDeDatos(':memory:');
    try {
      aplicarMigraciones(db, carpeta);
      const usuarioId = db
        .prepare('INSERT INTO usuarios (nombre, correo, password_hash) VALUES (?, ?, ?)')
        .run('Usuaria de Prueba', 'prueba@empresa.pe', HASH_DE_PRUEBA).lastInsertRowid;
      db.prepare('INSERT INTO contactos (nombres, apellidos, dni, creado_por) VALUES (?, ?, ?, ?)').run(
        'Ana',
        'Pérez',
        '12345678',
        usuarioId,
      );
      copiar(MIGRACION_003);

      assert.throws(() => aplicarMigraciones(db, carpeta), /Falló la migración 003_tipo_auditoria_y_busqueda\.sql/);

      const columnas = db.prepare("SELECT name FROM pragma_table_xinfo('contactos')").pluck().all();
      assert.deepEqual(
        columnas.filter((columna) => ['tipo', 'actualizado_por', 'apellidos_busqueda'].includes(columna)),
        [],
      );
      assert.equal(db.prepare('SELECT count(*) FROM contactos').pluck().get(), 1);
      assert.deepEqual(migracionesPendientes(db, carpeta), [MIGRACION_003]);
    } finally {
      db.close();
    }
  });
});
