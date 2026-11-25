// Pruebas de la creación de usuarios (src/services/usuarios.js), reglas U1–U3.
// Cada prueba usa una base de datos nueva en memoria y bcrypt con costo 4 para ir rápido.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { abrirBaseDeDatos } from '../src/db/conexion.js';
import { aplicarMigraciones } from '../src/db/migraciones.js';
import { crearUsuario } from '../src/services/usuarios.js';
import { MAXIMO_BYTES_PASSWORD } from '../src/validators/reglas.js';
import { ErrorDeValidacion } from '../src/validators/validar.js';

const COSTO_RAPIDO = { costo: 4 };

function datosValidos(cambios = {}) {
  return { nombre: 'Ana Pérez', correo: 'ana@empresa.pe', password: 'clave-segura-123', ...cambios };
}

// Verifica que la promesa falle con ErrorDeValidacion y que haya un error en `campo` cuyo mensaje cumpla `patron`.
async function assertRechaza(promesa, campo, patron) {
  await assert.rejects(promesa, (error) => {
    assert.ok(error instanceof ErrorDeValidacion, `se esperaba ErrorDeValidacion y llegó ${error}`);
    assert.ok(
      error.errores.some((e) => e.campo === campo && patron.test(e.mensaje)),
      `errores recibidos: ${JSON.stringify(error.errores)}`,
    );
    return true;
  });
}

describe('crearUsuario (U1–U3)', () => {
  let db;

  beforeEach(() => {
    db = abrirBaseDeDatos(':memory:');
    aplicarMigraciones(db);
  });

  afterEach(() => {
    db.close();
  });

  const filaDe = (id) => db.prepare('SELECT nombre, correo, password_hash FROM usuarios WHERE id = ?').get(id);

  it('crea el usuario y guarda un hash bcrypt, no la contraseña', async () => {
    const usuario = await crearUsuario(db, datosValidos(), COSTO_RAPIDO);

    const fila = filaDe(usuario.id);
    assert.notEqual(fila.password_hash, 'clave-segura-123');
    assert.match(fila.password_hash, /^\$2b\$04\$/);
    assert.equal(await bcrypt.compare('clave-segura-123', fila.password_hash), true);
    assert.equal(await bcrypt.compare('otra-clave-123', fila.password_hash), false);
  });

  it('quita los espacios del nombre y del correo, y guarda el correo en minúsculas', async () => {
    const usuario = await crearUsuario(
      db,
      datosValidos({ nombre: '  Ana Pérez  ', correo: '  Ana@Empresa.PE ' }),
      COSTO_RAPIDO,
    );

    assert.deepEqual(usuario, { id: usuario.id, nombre: 'Ana Pérez', correo: 'ana@empresa.pe' });
    assert.equal(filaDe(usuario.id).correo, 'ana@empresa.pe');
  });

  it('no recorta los espacios de la contraseña', async () => {
    const usuario = await crearUsuario(db, datosValidos({ password: ' clave-segura-123 ' }), COSTO_RAPIDO);

    const hash = filaDe(usuario.id).password_hash;
    assert.equal(await bcrypt.compare(' clave-segura-123 ', hash), true);
    assert.equal(await bcrypt.compare('clave-segura-123', hash), false);
  });

  it('rechaza un correo repetido aunque cambien las mayúsculas (U3)', async () => {
    await crearUsuario(db, datosValidos(), COSTO_RAPIDO);

    await assertRechaza(
      crearUsuario(db, datosValidos({ nombre: 'Otra Ana', correo: 'ANA@Empresa.pe' }), COSTO_RAPIDO),
      'correo',
      /Ya existe un usuario con ese correo/,
    );
  });

  it('si dos altas del mismo correo ocurren a la vez, solo se guarda una', async () => {
    // Las dos pasan la revisión previa antes de calcular el hash; el UNIQUE frena a la segunda.
    const resultados = await Promise.allSettled([
      crearUsuario(db, datosValidos(), COSTO_RAPIDO),
      crearUsuario(db, datosValidos({ nombre: 'Otra Ana' }), COSTO_RAPIDO),
    ]);

    assert.deepEqual(
      resultados.map((r) => r.status),
      ['fulfilled', 'rejected'],
    );
    assert.ok(resultados[1].reason instanceof ErrorDeValidacion);
    assert.equal(db.prepare('SELECT count(*) FROM usuarios').pluck().get(), 1);
  });

  it('rechaza una contraseña de menos de 10 caracteres (U2)', async () => {
    await assertRechaza(
      crearUsuario(db, datosValidos({ password: '123456789' }), COSTO_RAPIDO),
      'password',
      /al menos 10 caracteres/,
    );
  });

  it(`acepta una contraseña de exactamente ${MAXIMO_BYTES_PASSWORD} bytes (U2)`, async () => {
    await crearUsuario(db, datosValidos({ password: 'a'.repeat(MAXIMO_BYTES_PASSWORD) }), COSTO_RAPIDO);
  });

  it(`rechaza una contraseña de ${MAXIMO_BYTES_PASSWORD + 1} bytes (U2)`, async () => {
    await assertRechaza(
      crearUsuario(db, datosValidos({ password: 'a'.repeat(MAXIMO_BYTES_PASSWORD + 1) }), COSTO_RAPIDO),
      'password',
      /no puede superar los 72 bytes/,
    );
  });

  it('cuenta bytes y no caracteres: rechaza 37 eñes (37 caracteres, 74 bytes)', async () => {
    await assertRechaza(
      crearUsuario(db, datosValidos({ password: 'ñ'.repeat(37) }), COSTO_RAPIDO),
      'password',
      /no puede superar los 72 bytes/,
    );
  });

  it('el límite de bytes coincide con el punto en que bcrypt empieza a truncar', () => {
    assert.equal(bcrypt.truncates('a'.repeat(MAXIMO_BYTES_PASSWORD)), false);
    assert.equal(bcrypt.truncates('a'.repeat(MAXIMO_BYTES_PASSWORD + 1)), true);
  });

  it('reporta todos los errores a la vez', async () => {
    await assert.rejects(
      crearUsuario(db, { nombre: 'A', correo: 'no-es-correo', password: 'corta' }, COSTO_RAPIDO),
      (error) => {
        assert.deepEqual(error.errores.map((e) => e.campo).sort(), ['correo', 'nombre', 'password']);
        return true;
      },
    );
  });

  it('rechaza datos faltantes con mensajes claros', async () => {
    await assert.rejects(crearUsuario(db, {}, COSTO_RAPIDO), (error) => {
      assert.deepEqual(
        error.errores.map((e) => e.mensaje),
        ['El nombre es obligatorio.', 'El correo es obligatorio.', 'La contraseña es obligatoria.'],
      );
      return true;
    });
  });
});
