// Pruebas de la lógica del menú de la foto (public/js/foto.js): elegir el archivo, el aviso del
// peso (F1), la subida con vista previa y cómo se cierra el menú (Escape, clic fuera, foco).
// Las dependencias son falsas y anotan lo que se les pidió: no hace falta un navegador.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { crearMenuFoto } from '../public/js/foto.js';
import { MENSAJE_FOTO_PESADA } from '../src/middlewares/subida-foto.js';
import { MAXIMO_BYTES_FOTO } from '../src/validators/reglas.js';

const archivo = (size) => ({ name: 'foto.jpg', size });

// Menú con dependencias falsas. `llamadas` anota en orden lo que la lógica pidió hacer; cada
// lectura de la vista previa queda en `lecturas` hasta que la prueba la resuelve o la rechaza.
function preparar({ abierto = true } = {}) {
  const llamadas = [];
  const lecturas = [];
  const estado = { abierto };

  const menu = crearMenuFoto({
    maximoBytes: MAXIMO_BYTES_FOTO,
    mensajePeso: MENSAJE_FOTO_PESADA,
    menuAbierto: () => estado.abierto,
    abrirMenu: () => {
      estado.abierto = true;
      llamadas.push('abrirMenu');
    },
    cerrarMenu: () => {
      estado.abierto = false;
      llamadas.push('cerrarMenu');
    },
    devolverFoco: () => llamadas.push('devolverFoco'),
    abrirSelector: () => llamadas.push('abrirSelector'),
    limpiarSeleccion: () => llamadas.push('limpiarSeleccion'),
    mostrarError: (mensaje) => llamadas.push(`mostrarError: ${mensaje}`),
    limpiarError: () => llamadas.push('limpiarError'),
    leerVistaPrevia: (elegido) =>
      new Promise((resolver, rechazar) => {
        lecturas.push({ archivo: elegido, resolver, rechazar });
      }),
    mostrarVistaPrevia: (url) => llamadas.push(`mostrarVistaPrevia: ${url}`),
    enviar: () => llamadas.push('enviar'),
    alCambiarEstado: (subiendo) => llamadas.push(`subiendo: ${subiendo}`),
  });

  return { menu, llamadas, lecturas, estado };
}

describe('menú de la foto (public/js/foto.js)', () => {
  describe('elegir y subir la foto', () => {
    it('"Cambiar foto" abre el selector de archivos', () => {
      const { menu, llamadas } = preparar();

      menu.elegir();

      assert.deepEqual(llamadas, ['abrirSelector']);
    });

    it('si se cierra el selector sin elegir, no pasa nada', () => {
      const { menu, llamadas } = preparar();

      menu.alElegirArchivo(undefined);

      assert.deepEqual(llamadas, []);
      assert.equal(menu.estaSubiendo(), false);
    });

    it('F1: una foto de más del máximo no se envía; avisa con el mensaje del servidor y deja el menú abierto', () => {
      const { menu, llamadas, lecturas, estado } = preparar({ abierto: false });

      menu.alElegirArchivo(archivo(MAXIMO_BYTES_FOTO + 1));

      assert.deepEqual(llamadas, ['limpiarSeleccion', `mostrarError: ${MENSAJE_FOTO_PESADA}`, 'abrirMenu']);
      assert.equal(estado.abierto, true);
      assert.equal(lecturas.length, 0);
      assert.equal(menu.estaSubiendo(), false);
    });

    it('F1: una foto de exactamente el máximo se envía', () => {
      const { menu, llamadas } = preparar();

      menu.alElegirArchivo(archivo(MAXIMO_BYTES_FOTO));

      assert.ok(llamadas.includes('enviar'));
    });

    it('una foto válida: borra el error, cierra el menú, vuelve al avatar, avisa que sube y la envía', () => {
      const { menu, llamadas, lecturas } = preparar();
      const elegido = archivo(1000);

      menu.alElegirArchivo(elegido);

      // Se envía enseguida: no espera a la vista previa.
      assert.deepEqual(llamadas, ['limpiarError', 'cerrarMenu', 'devolverFoco', 'subiendo: true', 'enviar']);
      assert.equal(lecturas.length, 1);
      assert.equal(lecturas[0].archivo, elegido);
      assert.equal(menu.estaSubiendo(), true);
    });

    it('cuando termina de leerla, muestra la vista previa en el avatar', async () => {
      const { menu, llamadas, lecturas } = preparar();
      const vistaPrevia = menu.alElegirArchivo(archivo(1000));

      lecturas[0].resolver('data:image/png;base64,AAAA');
      await vistaPrevia;

      assert.equal(llamadas.at(-1), 'mostrarVistaPrevia: data:image/png;base64,AAAA');
    });

    it('si el navegador no puede mostrarla, queda el avatar anterior (la foto ya se envió)', async () => {
      const { menu, llamadas, lecturas } = preparar();
      const vistaPrevia = menu.alElegirArchivo(archivo(1000));

      lecturas[0].rechazar(new Error('no es una imagen'));
      await vistaPrevia; // no falla

      assert.ok(llamadas.includes('enviar'));
      assert.ok(!llamadas.some((llamada) => llamada.startsWith('mostrarVistaPrevia')));
    });

    it('mientras sube, no se elige ni se envía otra foto', () => {
      const { menu, llamadas, lecturas } = preparar();
      menu.alElegirArchivo(archivo(1000));
      llamadas.length = 0;

      menu.elegir();
      menu.alElegirArchivo(archivo(2000));
      menu.alElegirArchivo(archivo(MAXIMO_BYTES_FOTO + 1));

      assert.deepEqual(llamadas, []);
      assert.equal(lecturas.length, 1);
    });
  });

  describe('cerrar el menú', () => {
    it('Escape lo cierra y, si el foco estaba dentro, lo devuelve al avatar', () => {
      const { menu, llamadas } = preparar();

      assert.equal(menu.alPresionarTecla('Escape', { focoDentro: true }), true);
      assert.deepEqual(llamadas, ['cerrarMenu', 'devolverFoco']);
    });

    it('Escape con el foco fuera del menú lo cierra sin mover el foco', () => {
      const { menu, llamadas } = preparar();

      assert.equal(menu.alPresionarTecla('Escape', { focoDentro: false }), true);
      assert.deepEqual(llamadas, ['cerrarMenu']);
    });

    it('Escape con el menú cerrado, u otra tecla, no hace nada', () => {
      const cerrado = preparar({ abierto: false });
      assert.equal(cerrado.menu.alPresionarTecla('Escape', { focoDentro: true }), false);
      assert.deepEqual(cerrado.llamadas, []);

      const abierto = preparar();
      assert.equal(abierto.menu.alPresionarTecla('Enter', { focoDentro: true }), false);
      assert.deepEqual(abierto.llamadas, []);
    });

    it('un clic fuera lo cierra; uno dentro, no', () => {
      const { menu, llamadas, estado } = preparar();

      menu.alHacerClic({ dentro: true });
      assert.equal(estado.abierto, true);

      menu.alHacerClic({ dentro: false });
      assert.equal(estado.abierto, false);
      assert.deepEqual(llamadas, ['cerrarMenu']);
    });

    it('un clic fuera con el menú cerrado no hace nada', () => {
      const { menu, llamadas } = preparar({ abierto: false });

      menu.alHacerClic({ dentro: false });

      assert.deepEqual(llamadas, []);
    });

    it('se cierra si el foco pasa a otra parte de la página, no si queda dentro', () => {
      const { menu, estado } = preparar();

      menu.alSalirElFoco({ hayDestino: true, destinoDentro: true });
      assert.equal(estado.abierto, true);

      menu.alSalirElFoco({ hayDestino: true, destinoDentro: false });
      assert.equal(estado.abierto, false);
    });

    it('queda abierto si el foco sale de la ventana (por ejemplo, al abrir el selector de archivos)', () => {
      const { menu, llamadas } = preparar();

      menu.alSalirElFoco({ hayDestino: false, destinoDentro: false });

      assert.deepEqual(llamadas, []);
    });
  });
});
