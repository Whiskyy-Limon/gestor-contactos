// Pruebas de la configuración (src/config): lo que se lee de las variables de entorno (.env).
// Cada prueba la carga en un proceso aparte con variables controladas, porque la configuración se
// lee una sola vez al importar el módulo. Nunca usan la base de datos real.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const RAIZ = path.join(import.meta.dirname, '..');
const VARIABLES = ['PORT', 'HOST', 'NODE_ENV', 'SESSION_SECRET', 'DATABASE_PATH', 'UPLOADS_PATH', 'TRUST_PROXY'];

// Entorno del proceso de prueba: el actual sin las variables de la app, más `variables`.
function entornoCon(variables) {
  const entorno = { ...process.env };
  for (const nombre of VARIABLES) {
    delete entorno[nombre];
  }
  return { ...entorno, ...variables };
}

// Carga src/config en otro proceso y devuelve { status, stderr, config }.
function cargarConfig(variables = {}) {
  const codigo =
    "const { config } = await import('./src/config/index.js'); console.log(JSON.stringify(config));";
  const resultado = spawnSync(process.execPath, ['--input-type=module', '-e', codigo], {
    cwd: RAIZ,
    env: entornoCon(variables),
    encoding: 'utf8',
  });
  const config = resultado.status === 0 ? JSON.parse(resultado.stdout) : null;
  return { status: resultado.status, stderr: resultado.stderr, config };
}

const POR_DEFECTO = {
  nodeEnv: 'development',
  isProduction: false,
  port: 3000,
  host: '127.0.0.1', // en desarrollo, solo esta computadora
  databasePath: 'storage/contactos.db',
  carpetaFotos: 'storage/uploads',
  trustProxy: false,
};

describe('configuración (src/config)', () => {
  it('sin variables, usa los valores por defecto', () => {
    const { status, stderr, config } = cargarConfig();

    assert.equal(status, 0, stderr);
    assert.deepEqual(config, POR_DEFECTO); // sessionSecret undefined no aparece en el JSON
  });

  it('una variable vacía (o solo con espacios) usa su valor por defecto', () => {
    const { status, stderr, config } = cargarConfig({
      PORT: '',
      HOST: '',
      NODE_ENV: '',
      SESSION_SECRET: '',
      DATABASE_PATH: '',
      UPLOADS_PATH: '   ',
      TRUST_PROXY: '',
    });

    assert.equal(status, 0, stderr);
    assert.deepEqual(config, POR_DEFECTO);
  });

  it('respeta los valores válidos', () => {
    const { status, stderr, config } = cargarConfig({
      PORT: '8080',
      NODE_ENV: 'production',
      SESSION_SECRET: 'x'.repeat(40),
      DATABASE_PATH: 'datos/app.db',
      UPLOADS_PATH: 'datos/fotos',
      TRUST_PROXY: '1',
    });

    assert.equal(status, 0, stderr);
    assert.deepEqual(config, {
      nodeEnv: 'production',
      isProduction: true,
      port: 8080,
      host: null, // en producción, sin HOST: todas las interfaces
      sessionSecret: 'x'.repeat(40),
      databasePath: 'datos/app.db',
      carpetaFotos: 'datos/fotos',
      trustProxy: 1,
    });
  });

  it('HOST: se respeta si se indica, en cualquier entorno', () => {
    assert.equal(cargarConfig({ HOST: '0.0.0.0' }).config.host, '0.0.0.0');
    assert.equal(cargarConfig({ HOST: ' 127.0.0.1 ', NODE_ENV: 'production' }).config.host, '127.0.0.1');
  });

  it('TRUST_PROXY: "0" y "false" son sin proxy; otro texto se pasa tal cual a Express', () => {
    assert.equal(cargarConfig({ TRUST_PROXY: '0' }).config.trustProxy, false);
    assert.equal(cargarConfig({ TRUST_PROXY: 'false' }).config.trustProxy, false);
    assert.equal(cargarConfig({ TRUST_PROXY: 'loopback' }).config.trustProxy, 'loopback');
  });

  it('un valor inválido detiene la carga con un mensaje claro que nombra cada variable, sin stack', () => {
    const { status, stderr } = cargarConfig({ PORT: 'tres mil', NODE_ENV: 'prod' });

    assert.equal(status, 1);
    assert.match(stderr, /PORT/);
    assert.match(stderr, /NODE_ENV/);
    assert.match(stderr, /development, production o test/);
    assert.doesNotMatch(stderr, /\n\s+at /); // sin stack trace
  });

  it('PORT fuera de rango (0 o más de 65535) se rechaza', () => {
    assert.match(cargarConfig({ PORT: '0' }).stderr, /PORT/);
    assert.match(cargarConfig({ PORT: '70000' }).stderr, /PORT/);
    assert.equal(cargarConfig({ PORT: '70000' }).status, 1);
  });

  it('el servidor no arranca con una configuración inválida (y no toca la base de datos)', () => {
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'config-prueba-'));
    try {
      const rutaDb = path.join(carpeta, 'no-debe-crearse.db');
      const resultado = spawnSync(process.execPath, ['src/server.js'], {
        cwd: RAIZ,
        env: entornoCon({ NODE_ENV: 'prod', DATABASE_PATH: rutaDb }),
        encoding: 'utf8',
        timeout: 10_000,
      });

      assert.equal(resultado.status, 1);
      assert.match(resultado.stderr, /NODE_ENV/);
      assert.equal(fs.existsSync(rutaDb), false);
    } finally {
      fs.rmSync(carpeta, { recursive: true, force: true });
    }
  });
});
