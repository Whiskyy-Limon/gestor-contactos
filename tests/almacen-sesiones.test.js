// Pruebas del almacén de sesiones sobre SQLite (src/db/almacen-sesiones.js).
// Cada prueba usa una base de datos nueva en memoria: nunca toca la base real.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import session from 'express-session';
import { abrirBaseDeDatos } from '../src/db/conexion.js';
import { aplicarMigraciones } from '../src/db/migraciones.js';
import { AlmacenSesionesSqlite } from '../src/db/almacen-sesiones.js';

const UN_DIA_MS = 24 * 60 * 60 * 1000;
const TREINTA_DIAS_MS = 30 * UN_DIA_MS;

// Sesión con la forma que guarda express-session. Del contenido, el almacén solo usa cookie.expires.
function sesionQueVenceEn(ms, datos = { usuarioId: 7 }) {
  return {
    cookie: { originalMaxAge: ms, expires: new Date(Date.now() + ms).toISOString(), httpOnly: true, path: '/' },
    ...datos,
  };
}

describe('AlmacenSesionesSqlite', () => {
  let db;
  let almacen;

  beforeEach(() => {
    db = abrirBaseDeDatos(':memory:');
    aplicarMigraciones(db);
    almacen = new AlmacenSesionesSqlite(db);
  });

  afterEach(() => {
    almacen.cerrar();
    db.close();
  });

  // Versiones con promesas de los métodos con callback.
  const obtener = (sid) =>
    new Promise((resolve, reject) => almacen.get(sid, (error, sesion) => (error ? reject(error) : resolve(sesion))));
  const guardar = (sid, sesion) =>
    new Promise((resolve, reject) => almacen.set(sid, sesion, (error) => (error ? reject(error) : resolve())));
  const renovar = (sid, sesion) =>
    new Promise((resolve, reject) => almacen.touch(sid, sesion, (error) => (error ? reject(error) : resolve())));
  const destruir = (sid) =>
    new Promise((resolve, reject) => almacen.destroy(sid, (error) => (error ? reject(error) : resolve())));

  const expiraEn = (sid) => db.prepare('SELECT expira_en FROM sesiones WHERE sid = ?').pluck().get(sid);
  const sidsGuardados = () => db.prepare('SELECT sid FROM sesiones ORDER BY sid').pluck().all();

  it('es un Store de express-session', () => {
    assert.ok(almacen instanceof session.Store);
  });

  it('guarda una sesión y la devuelve igual', async () => {
    const sesion = sesionQueVenceEn(UN_DIA_MS);

    await guardar('abc', sesion);

    assert.deepEqual(await obtener('abc'), sesion);
  });

  it('devuelve null si la sesión no existe', async () => {
    assert.equal(await obtener('no-existe'), null);
  });

  it('no devuelve una sesión vencida', async () => {
    await guardar('abc', sesionQueVenceEn(-1000));

    assert.equal(await obtener('abc'), null);
  });

  it('guardar de nuevo reemplaza los datos y el vencimiento', async () => {
    await guardar('abc', sesionQueVenceEn(UN_DIA_MS, { usuarioId: 1 }));
    const nueva = sesionQueVenceEn(TREINTA_DIAS_MS, { usuarioId: 2 });

    await guardar('abc', nueva);

    assert.deepEqual(await obtener('abc'), nueva);
    assert.equal(expiraEn('abc'), new Date(nueva.cookie.expires).getTime());
  });

  it('touch extiende el vencimiento', async () => {
    await guardar('abc', sesionQueVenceEn(60 * 60 * 1000));
    const antes = expiraEn('abc');

    await renovar('abc', sesionQueVenceEn(TREINTA_DIAS_MS));

    assert.ok(expiraEn('abc') > antes);
  });

  it('touch no revive una sesión vencida', async () => {
    await guardar('abc', sesionQueVenceEn(-1000));

    await renovar('abc', sesionQueVenceEn(TREINTA_DIAS_MS));

    assert.equal(await obtener('abc'), null);
  });

  it('destroy borra la sesión', async () => {
    await guardar('abc', sesionQueVenceEn(UN_DIA_MS));

    await destruir('abc');

    assert.deepEqual(sidsGuardados(), []);
  });

  it('una sesión sin vencimiento en la cookie dura como máximo un día', async () => {
    const antes = Date.now();

    await guardar('abc', { cookie: { originalMaxAge: null, expires: null }, usuarioId: 7 });

    const vence = expiraEn('abc');
    assert.ok(vence >= antes + UN_DIA_MS && vence <= Date.now() + UN_DIA_MS);
  });

  it('borrarExpiradas borra solo las sesiones vencidas', async () => {
    await guardar('vencida', sesionQueVenceEn(-1000));
    await guardar('vigente', sesionQueVenceEn(UN_DIA_MS));

    assert.equal(almacen.borrarExpiradas(), 1);
    assert.deepEqual(sidsGuardados(), ['vigente']);
  });

  it('al crearse borra las sesiones vencidas que ya había', () => {
    db.prepare('INSERT INTO sesiones (sid, datos, expira_en) VALUES (?, ?, ?)').run('vieja', '{}', Date.now() - 1000);

    const otroAlmacen = new AlmacenSesionesSqlite(db);
    otroAlmacen.cerrar();

    assert.deepEqual(sidsGuardados(), []);
  });

  it('si la base de datos falla, entrega el error al callback', () => {
    const dbCerrada = abrirBaseDeDatos(':memory:');
    aplicarMigraciones(dbCerrada);
    const almacenSinBd = new AlmacenSesionesSqlite(dbCerrada);
    almacenSinBd.cerrar();
    dbCerrada.close();

    const llamadas = [];
    almacenSinBd.get('abc', (error, sesion) => llamadas.push({ error, sesion }));

    assert.equal(llamadas.length, 1);
    assert.ok(llamadas[0].error instanceof Error);
    assert.equal(llamadas[0].sesion, undefined);
  });

  it('llama al callback una sola vez aunque el callback lance un error', () => {
    let llamadas = 0;

    assert.throws(
      () =>
        almacen.get('abc', () => {
          llamadas++;
          throw new Error('falla dentro del callback');
        }),
      /falla dentro del callback/,
    );
    assert.equal(llamadas, 1);
  });
});
