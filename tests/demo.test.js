// Pruebas del comando `npm run db:demo` (scripts/demo.js): carga contactos ficticios para ver la
// app con datos. Ejecutan el script real con una base de datos y una carpeta de fotos temporales,
// nunca las reales.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { abrirBaseDeDatos } from '../src/db/conexion.js';
import { crearUsuario } from '../src/services/usuarios.js';

const RAIZ = path.join(import.meta.dirname, '..');
const VARIABLES = ['PORT', 'HOST', 'NODE_ENV', 'SESSION_SECRET', 'DATABASE_PATH', 'UPLOADS_PATH', 'TRUST_PROXY'];

describe('npm run db:demo', () => {
  let carpeta;
  let numero = 0;
  let rutaDb;
  let carpetaFotos;

  // Ejecuta un script del proyecto con la base de datos y la carpeta de fotos de la prueba.
  function ejecutar(script, variables = {}) {
    const entorno = { ...process.env };
    for (const nombre of VARIABLES) {
      delete entorno[nombre];
    }
    return spawnSync(process.execPath, [script], {
      cwd: RAIZ,
      env: { ...entorno, DATABASE_PATH: rutaDb, UPLOADS_PATH: carpetaFotos, ...variables },
      encoding: 'utf8',
    });
  }

  // Abre la base de datos de la prueba, ejecuta `consulta(db)` y la cierra.
  function conBaseDeDatos(consulta) {
    const db = abrirBaseDeDatos(rutaDb);
    try {
      return consulta(db);
    } finally {
      db.close();
    }
  }

  async function crearUsuarioDePrueba() {
    const db = abrirBaseDeDatos(rutaDb);
    try {
      await crearUsuario(db, { nombre: 'Rosa Medina', correo: 'rosa@empresa.pe', password: 'clave-segura-123' }, { costo: 4 });
    } finally {
      db.close();
    }
  }

  const contarContactos = () => conBaseDeDatos((db) => db.prepare('SELECT count(*) FROM contactos').pluck().get());

  before(() => {
    carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-prueba-'));
  });

  after(() => {
    fs.rmSync(carpeta, { recursive: true, force: true });
  });

  // Cada prueba con su base de datos migrada y su carpeta de fotos, vacías.
  beforeEach(() => {
    numero++;
    rutaDb = path.join(carpeta, `demo-${numero}.db`);
    carpetaFotos = path.join(carpeta, `fotos-${numero}`);
    const migracion = ejecutar('scripts/migrate.js');
    assert.equal(migracion.status, 0, migracion.stderr);
  });

  it('carga 25 contactos ficticios: 24 activos, 1 archivado y 2 con foto (con sus archivos)', async () => {
    await crearUsuarioDePrueba();

    const resultado = ejecutar('scripts/demo.js');

    assert.equal(resultado.status, 0, resultado.stderr);
    assert.match(resultado.stdout, /25 contactos/);
    assert.match(resultado.stdout, /Rosa Medina/);
    const datos = conBaseDeDatos((db) => ({
      activos: db.prepare('SELECT count(*) FROM contactos WHERE archivado_en IS NULL').pluck().get(),
      archivados: db.prepare('SELECT count(*) FROM contactos WHERE archivado_en IS NOT NULL').pluck().get(),
      fotos: db.prepare('SELECT foto FROM contactos WHERE foto IS NOT NULL').pluck().all(),
      tipos: db.prepare('SELECT DISTINCT tipo FROM contactos ORDER BY tipo').pluck().all(),
      sinTelefono: db.prepare('SELECT count(*) FROM contactos c WHERE NOT EXISTS (SELECT 1 FROM telefonos t WHERE t.contacto_id = c.id)').pluck().get(),
      sinCorreo: db.prepare('SELECT count(*) FROM contactos c WHERE NOT EXISTS (SELECT 1 FROM correos e WHERE e.contacto_id = c.id)').pluck().get(),
    }));
    assert.equal(datos.activos, 24);
    assert.equal(datos.archivados, 1);
    assert.deepEqual(datos.tipos, ['ambos', 'cliente', 'proveedor']);
    assert.equal(datos.sinTelefono, 0);
    assert.equal(datos.sinCorreo, 0);
    assert.equal(datos.fotos.length, 2);
    assert.deepEqual(fs.readdirSync(carpetaFotos).sort(), [...datos.fotos].sort());
  });

  it('se niega si ya hay contactos, y no cambia nada', async () => {
    await crearUsuarioDePrueba();
    assert.equal(ejecutar('scripts/demo.js').status, 0);

    const segunda = ejecutar('scripts/demo.js');

    assert.equal(segunda.status, 1);
    assert.match(segunda.stderr, /ya tiene contactos/);
    assert.equal(contarContactos(), 25);
  });

  it('se niega en producción', async () => {
    await crearUsuarioDePrueba();

    const resultado = ejecutar('scripts/demo.js', { NODE_ENV: 'production' });

    assert.equal(resultado.status, 1);
    assert.match(resultado.stderr, /producción/);
    assert.equal(contarContactos(), 0);
  });

  it('se niega si no hay usuarios (la auditoría necesita uno) y explica cómo crearlo', () => {
    const resultado = ejecutar('scripts/demo.js');

    assert.equal(resultado.status, 1);
    assert.match(resultado.stderr, /npm run user:create/);
    assert.equal(contarContactos(), 0);
  });

  it('se niega si la base de datos tiene migraciones pendientes', () => {
    rutaDb = path.join(carpeta, `sin-migrar-${numero}.db`);

    const resultado = ejecutar('scripts/demo.js');

    assert.equal(resultado.status, 1);
    assert.match(resultado.stderr, /npm run db:migrate/);
  });
});
