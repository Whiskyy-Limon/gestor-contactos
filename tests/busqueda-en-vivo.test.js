// Pruebas de la lógica de la búsqueda en vivo (public/js/busqueda.js): espera después de la última
// tecla, cancelación de la consulta anterior, respuestas que llegan tarde y errores. Usan
// temporizadores simulados y un "fetch" falso: no hace falta un navegador.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ESPERA_MS, crearBusquedaEnVivo } from '../public/js/busqueda.js';

const INICIAL = 'q=&tipo=&estado=activos';
const consulta = (q, tipo = '') => `q=${q}&tipo=${tipo}&estado=activos`;

// Deja correr las promesas pendientes (las respuestas del fetch falso).
const procesarPromesas = () => new Promise((resolver) => setImmediate(resolver));

// Búsqueda en vivo con dependencias falsas. Cada pedido queda en `pedidos` hasta que la prueba lo
// responde (pedido.responder) o lo hace fallar (pedido.fallar).
function preparar(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pedidos = [];
  const aplicados = [];
  const navegaciones = [];
  const estados = [];

  const busqueda = crearBusquedaEnVivo({
    consultaActual: INICIAL,
    pedir: (url, signal) =>
      new Promise((responder, fallar) => {
        pedidos.push({ url, signal, responder, fallar });
      }),
    aplicar: (html) => aplicados.push(html),
    navegar: (url) => navegaciones.push(url),
    alCambiarEstado: (ocupado) => estados.push(ocupado),
  });

  const respuestaOk = (html) => ({ ok: true, redirected: false, html });
  return { busqueda, pedidos, aplicados, navegaciones, estados, respuestaOk };
}

describe('búsqueda en vivo (public/js/busqueda.js)', () => {
  it(`al escribir, consulta recién ${ESPERA_MS} ms después de la última tecla, y una sola vez`, (t) => {
    const { busqueda, pedidos } = preparar(t);

    busqueda.programar(consulta('h'));
    t.mock.timers.tick(100);
    busqueda.programar(consulta('ho'));
    t.mock.timers.tick(100);
    busqueda.programar(consulta('hor'));
    t.mock.timers.tick(ESPERA_MS - 1);
    assert.equal(pedidos.length, 0);

    t.mock.timers.tick(1);
    assert.deepEqual(
      pedidos.map((pedido) => pedido.url),
      [`/contactos/resultados?${consulta('hor')}`],
    );
  });

  it('al cambiar un filtro consulta enseguida y descarta la espera pendiente', (t) => {
    const { busqueda, pedidos } = preparar(t);

    busqueda.programar(consulta('ho'));
    busqueda.buscar(consulta('ho', 'cliente'));
    assert.equal(pedidos.length, 1);

    t.mock.timers.tick(ESPERA_MS * 2);
    assert.equal(pedidos.length, 1);
  });

  it('una consulta nueva cancela la anterior', (t) => {
    const { busqueda, pedidos } = preparar(t);

    busqueda.buscar(consulta('ho'));
    busqueda.buscar(consulta('hor'));

    assert.equal(pedidos[0].signal.aborted, true);
    assert.equal(pedidos[1].signal.aborted, false);
  });

  it('una respuesta vieja que llega tarde no reemplaza a la nueva', async (t) => {
    const { busqueda, pedidos, aplicados, respuestaOk } = preparar(t);

    busqueda.buscar(consulta('ho'));
    busqueda.buscar(consulta('hor'));
    pedidos[1].responder(respuestaOk('resultados de "hor"'));
    await procesarPromesas();
    // El servidor ya había respondido la consulta vieja antes de la cancelación.
    pedidos[0].responder(respuestaOk('resultados de "ho"'));
    await procesarPromesas();

    assert.deepEqual(aplicados, ['resultados de "hor"']);
  });

  it('muestra la respuesta y marca la lista como ocupada mientras espera', async (t) => {
    const { busqueda, pedidos, aplicados, estados, respuestaOk } = preparar(t);

    busqueda.buscar(consulta('ho'));
    assert.deepEqual(estados, [true]);

    pedidos[0].responder(respuestaOk('resultados'));
    await procesarPromesas();

    assert.deepEqual(aplicados, ['resultados']);
    assert.deepEqual(estados, [true, false]);
  });

  it('no repite la consulta que ya se muestra', async (t) => {
    const { busqueda, pedidos, respuestaOk } = preparar(t);

    busqueda.buscar(INICIAL);
    assert.equal(pedidos.length, 0);

    busqueda.buscar(consulta('ho'));
    pedidos[0].responder(respuestaOk('resultados'));
    await procesarPromesas();
    busqueda.buscar(consulta('ho'));

    assert.equal(pedidos.length, 1);
  });

  for (const [descripcion, respuesta] of [
    ['redirigida (sesión vencida)', { ok: true, redirected: true, html: 'login' }],
    ['con error del servidor', { ok: false, redirected: false, html: 'error' }],
  ]) {
    it(`si la respuesta llega ${descripcion}, carga la página completa en vez de mostrarla`, async (t) => {
      const { busqueda, pedidos, aplicados, navegaciones } = preparar(t);

      busqueda.buscar(consulta('ho'));
      pedidos[0].responder(respuesta);
      await procesarPromesas();

      assert.deepEqual(aplicados, []);
      assert.deepEqual(navegaciones, [`/contactos?${consulta('ho')}`]);
    });
  }

  it('si falla la red, carga la página completa; una cancelación no hace nada', async (t) => {
    const { busqueda, pedidos, navegaciones } = preparar(t);

    busqueda.buscar(consulta('ho'));
    pedidos[0].fallar(new TypeError('Failed to fetch'));
    await procesarPromesas();
    assert.deepEqual(navegaciones, [`/contactos?${consulta('ho')}`]);

    busqueda.buscar(consulta('hor'));
    pedidos[1].fallar(new DOMException('cancelada', 'AbortError'));
    await procesarPromesas();
    assert.equal(navegaciones.length, 1);
  });
});
