// Prueba de humo: la app arranca y responde en /.
// Usa fetch nativo mientras no instalemos supertest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { crearApp } from '../src/app.js';

test('GET / responde "Hola"', async (t) => {
  const servidor = crearApp().listen(0);
  t.after(() => {
    servidor.closeAllConnections();
    servidor.close();
  });
  await once(servidor, 'listening');

  const { port } = servidor.address();
  const respuesta = await fetch(`http://127.0.0.1:${port}/`);

  assert.equal(respuesta.status, 200);
  assert.equal(await respuesta.text(), 'Hola');
});
