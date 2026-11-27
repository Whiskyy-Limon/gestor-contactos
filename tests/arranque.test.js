// Pruebas del arranque del servidor (src/server.js): en qué dirección escucha y el aviso cuando
// queda accesible desde la red sin el modo producción (cookie sin Secure, sin HSTS).
// Arrancan el servidor real en otro proceso, con una base de datos y una carpeta de fotos
// temporales (nunca las reales), y lo detienen apenas anuncia que está escuchando.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const RAIZ = path.join(import.meta.dirname, '..');
const VARIABLES = ['PORT', 'HOST', 'NODE_ENV', 'SESSION_SECRET', 'DATABASE_PATH', 'UPLOADS_PATH', 'TRUST_PROXY'];
const AVISO = /Aviso: NODE_ENV no es production/;

// Un puerto libre de esta computadora.
function puertoLibre() {
  return new Promise((resolver, rechazar) => {
    const servidor = net.createServer();
    servidor.once('error', rechazar);
    servidor.listen(0, '127.0.0.1', () => {
      const { port } = servidor.address();
      servidor.close(() => resolver(port));
    });
  });
}

describe('arranque del servidor', () => {
  let carpeta;
  let rutaDb;

  // Entorno del servidor: el actual sin las variables de la app, más las de la prueba.
  function entornoCon(variables) {
    const entorno = { ...process.env };
    for (const nombre of VARIABLES) {
      delete entorno[nombre];
    }
    return {
      ...entorno,
      SESSION_SECRET: 'secreto-de-prueba-'.padEnd(40, '0'),
      DATABASE_PATH: rutaDb,
      UPLOADS_PATH: path.join(carpeta, 'fotos'),
      ...variables,
    };
  }

  // Arranca el servidor y devuelve { salida, errores } cuando anuncia que escucha (o termina).
  async function arrancar(variables) {
    const PORT = String(await puertoLibre());
    const proceso = spawn(process.execPath, ['src/server.js'], { cwd: RAIZ, env: entornoCon({ PORT, ...variables }) });
    let salida = '';
    let errores = '';
    proceso.stdout.setEncoding('utf8').on('data', (texto) => (salida += texto));
    proceso.stderr.setEncoding('utf8').on('data', (texto) => (errores += texto));

    await new Promise((resolver) => {
      const limite = setTimeout(resolver, 10_000);
      const revisar = () => {
        if (salida.includes('Servidor escuchando')) {
          clearTimeout(limite);
          resolver();
        }
      };
      proceso.stdout.on('data', revisar);
      proceso.once('exit', () => {
        clearTimeout(limite);
        resolver();
      });
    });
    // Se espera a que el proceso cierre su salida, para no perder lo que todavía estaba en camino.
    const cerrado = new Promise((resolver) => proceso.once('close', resolver));
    proceso.kill();
    await cerrado;
    return { salida, errores };
  }

  before(() => {
    carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'arranque-prueba-'));
    rutaDb = path.join(carpeta, 'app.db');
    const migracion = spawnSync(process.execPath, ['scripts/migrate.js'], {
      cwd: RAIZ,
      env: entornoCon({}),
      encoding: 'utf8',
    });
    assert.equal(migracion.status, 0, migracion.stderr);
  });

  after(() => {
    fs.rmSync(carpeta, { recursive: true, force: true });
  });

  it('en desarrollo, sin HOST, escucha solo en esta computadora (127.0.0.1) y no avisa', async () => {
    const { salida, errores } = await arrancar({ NODE_ENV: 'development' });

    assert.match(salida, /Servidor escuchando/);
    assert.match(salida, /127\.0\.0\.1/);
    assert.doesNotMatch(errores, AVISO);
  });

  it('en desarrollo con un HOST accesible desde la red, avisa que la cookie no es segura', async () => {
    const { salida, errores } = await arrancar({ NODE_ENV: 'development', HOST: '0.0.0.0' });

    assert.match(salida, /Servidor escuchando/);
    assert.match(errores, AVISO);
    assert.match(errores, /0\.0\.0\.0/);
    assert.match(errores, /NODE_ENV=production/);
  });

  it('en producción escucha en todas las interfaces sin avisar', async () => {
    const { salida, errores } = await arrancar({ NODE_ENV: 'production' });

    assert.match(salida, /Servidor escuchando/);
    assert.match(salida, /todas las interfaces/);
    assert.doesNotMatch(errores, AVISO);
  });
});
