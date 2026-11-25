// Pruebas del comando `npm run user:create` (scripts/create-user.js).
// Ejecutan el script real con la entrada redirigida y una base de datos temporal,
// nunca la real. (Ocultar la contraseña al escribir solo se puede comprobar a mano, en una terminal.)
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { abrirBaseDeDatos } from '../src/db/conexion.js';

const RAIZ = path.join(import.meta.dirname, '..');

describe('npm run user:create', () => {
  let carpeta;
  let dbMigrada;

  // Ejecuta un script del proyecto con DATABASE_PATH apuntando a `rutaDb`.
  function ejecutar(script, { rutaDb = dbMigrada, entrada = '', argumentos = [] } = {}) {
    return spawnSync(process.execPath, [script, ...argumentos], {
      cwd: RAIZ,
      env: { ...process.env, DATABASE_PATH: rutaDb },
      input: entrada,
      encoding: 'utf8',
    });
  }

  function usuariosGuardados() {
    const db = abrirBaseDeDatos(dbMigrada);
    try {
      return db.prepare('SELECT nombre, correo, password_hash FROM usuarios ORDER BY id').all();
    } finally {
      db.close();
    }
  }

  before(() => {
    carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'crear-usuario-prueba-'));
    dbMigrada = path.join(carpeta, 'migrada.db');
    const migracion = ejecutar('scripts/migrate.js');
    assert.equal(migracion.status, 0, migracion.stderr);
  });

  after(() => {
    fs.rmSync(carpeta, { recursive: true, force: true });
  });

  it('crea el usuario con los datos ingresados y nunca muestra la contraseña', () => {
    const resultado = ejecutar('scripts/create-user.js', {
      entrada: 'Ana Pérez\nAna@Empresa.pe\nclave-segura-123\nclave-segura-123\n',
    });

    assert.equal(resultado.status, 0, resultado.stderr);
    assert.match(resultado.stdout, /Usuario creado: Ana Pérez <ana@empresa\.pe>/);
    assert.ok(!(resultado.stdout + resultado.stderr).includes('clave-segura-123'));

    const [usuario] = usuariosGuardados();
    assert.equal(usuario.correo, 'ana@empresa.pe');
    assert.match(usuario.password_hash, /^\$2b\$12\$/);
  });

  it('rechaza argumentos en la línea de comandos y no crea nada', () => {
    const antes = usuariosGuardados().length;

    const resultado = ejecutar('scripts/create-user.js', { argumentos: ['clave-secreta-123'] });

    assert.equal(resultado.status, 1);
    assert.match(resultado.stderr, /no acepta argumentos/);
    assert.equal(usuariosGuardados().length, antes);
  });

  it('no crea el usuario si la confirmación no coincide', () => {
    const resultado = ejecutar('scripts/create-user.js', {
      entrada: 'Luis Rojas\nluis@empresa.pe\nclave-segura-123\nclave-distinta-123\n',
    });

    assert.equal(resultado.status, 1);
    assert.match(resultado.stderr, /no coinciden/);
    assert.ok(!usuariosGuardados().some((u) => u.correo === 'luis@empresa.pe'));
  });

  it('muestra los errores de validación', () => {
    const resultado = ejecutar('scripts/create-user.js', {
      entrada: 'Luis Rojas\nluis@empresa.pe\ncorta\ncorta\n',
    });

    assert.equal(resultado.status, 1);
    assert.match(resultado.stderr, /al menos 10 caracteres/);
  });

  it('avisa si la base de datos tiene migraciones pendientes', () => {
    const resultado = ejecutar('scripts/create-user.js', { rutaDb: path.join(carpeta, 'sin-migrar.db') });

    assert.equal(resultado.status, 1);
    assert.match(resultado.stderr, /npm run db:migrate/);
  });
});
