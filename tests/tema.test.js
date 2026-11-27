// Pruebas del modo claro/oscuro: el script del <head> que aplica el modo elegido antes del primer
// dibujo (public/js/tema-inicial.js), la lógica del botón (public/js/tema.js), que toda página los
// cargue como corresponde y que estilos.css defina la paleta una sola vez.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import request from 'supertest';
import { CLAVE_TEMA, colorSchemeDe, crearTema, modoValido, textoDelBoton } from '../public/js/tema.js';
import { crearContacto } from '../src/services/contactos.js';
import { crearEntornoDePrueba, iniciarSesion } from './helpers/app-de-prueba.js';

const SCRIPT_INICIAL = fs.readFileSync(new URL('../public/js/tema-inicial.js', import.meta.url), 'utf8');
const ESTILOS = fs.readFileSync(new URL('../public/css/estilos.css', import.meta.url), 'utf8');

// Ejecuta tema-inicial.js como el navegador en el <head>, con un documento y un almacenamiento
// falsos. `guardado`: lo que hay en localStorage. `almacenamiento`: 'normal', 'falla al leer'
// (getItem lanza un error) o 'bloqueado' (ya acceder a localStorage lanza un error, como con las
// cookies desactivadas). Devuelve el data-tema de <html> y el contenido del <meta name="color-scheme">.
function ejecutarScriptInicial({ guardado = {}, almacenamiento = 'normal' } = {}) {
  const raiz = { dataset: {} };
  const meta = {
    content: 'light dark',
    setAttribute(nombre, valor) {
      this[nombre] = valor;
    },
  };
  const localStorageFalso = {
    getItem(clave) {
      if (almacenamiento === 'falla al leer') {
        throw new Error('SecurityError');
      }
      return Object.hasOwn(guardado, clave) ? guardado[clave] : null;
    },
  };
  const contexto = {
    document: {
      documentElement: raiz,
      querySelector: (selector) => (selector === 'meta[name="color-scheme"]' ? meta : null),
    },
  };
  Object.defineProperty(contexto, 'localStorage', {
    get() {
      if (almacenamiento === 'bloqueado') {
        throw new Error('SecurityError');
      }
      return localStorageFalso;
    },
  });

  vm.runInNewContext(SCRIPT_INICIAL, contexto);

  return { tema: raiz.dataset.tema, colorScheme: meta.content };
}

// Lógica del botón con dependencias falsas. `llamadas` anota en orden lo que pidió hacer en la
// página; `guardados`, lo que guardó en el navegador. `sistema.oscuro` simula el modo del sistema.
function preparar({ guardado = null, sistemaOscuro = false, guardarFalla = false } = {}) {
  const llamadas = [];
  const guardados = [];
  const sistema = { oscuro: sistemaOscuro };
  const tema = crearTema({
    guardado,
    guardar: (modo) => {
      if (guardarFalla) {
        throw new Error('QuotaExceededError');
      }
      guardados.push(modo);
    },
    sistemaOscuro: () => sistema.oscuro,
    aplicar: (modo) => llamadas.push(`aplicar: ${modo}`),
    mostrar: (modo) => llamadas.push(`mostrar: ${modo}`),
  });
  return { tema, llamadas, guardados, sistema };
}

describe('modo claro/oscuro', () => {
  describe('script del <head> (public/js/tema-inicial.js)', () => {
    for (const [modo, colorScheme] of [['oscuro', 'dark'], ['claro', 'light']]) {
      it(`aplica el modo ${modo} guardado con la clave de tema.js: data-tema="${modo}" y color-scheme "${colorScheme}"`, () => {
        const resultado = ejecutarScriptInicial({ guardado: { [CLAVE_TEMA]: modo } });

        assert.deepEqual(resultado, { tema: modo, colorScheme });
        // El mismo color-scheme que pone tema.js al cambiar de modo.
        assert.equal(resultado.colorScheme, colorSchemeDe(modo));
      });
    }

    it('sin elección guardada no hace nada: la página sigue el modo del sistema', () => {
      const resultado = ejecutarScriptInicial();

      assert.deepEqual(resultado, { tema: undefined, colorScheme: 'light dark' });
      assert.equal(resultado.colorScheme, colorSchemeDe(null));
    });

    it('ignora un valor guardado que no es un modo', () => {
      for (const valor of ['azul', '', 'OSCURO', 'dark', 'true']) {
        assert.deepEqual(
          ejecutarScriptInicial({ guardado: { [CLAVE_TEMA]: valor } }),
          { tema: undefined, colorScheme: 'light dark' },
          valor,
        );
      }
    });

    it('si el navegador no deja leer el almacenamiento, no falla y sigue el modo del sistema', () => {
      for (const almacenamiento of ['falla al leer', 'bloqueado']) {
        assert.deepEqual(
          ejecutarScriptInicial({ guardado: { [CLAVE_TEMA]: 'oscuro' }, almacenamiento }),
          { tema: undefined, colorScheme: 'light dark' },
          almacenamiento,
        );
      }
    });
  });

  describe('botón del modo (public/js/tema.js)', () => {
    it('sin elección, sigue al sistema: muestra la luna con el sistema oscuro y el sol con el claro', () => {
      const oscuro = preparar({ sistemaOscuro: true });
      oscuro.tema.iniciar();
      assert.deepEqual(oscuro.llamadas, ['aplicar: null', 'mostrar: oscuro']);

      const claro = preparar({ sistemaOscuro: false });
      claro.tema.iniciar();
      assert.deepEqual(claro.llamadas, ['aplicar: null', 'mostrar: claro']);
    });

    it('con una elección guardada, la usa aunque el sistema esté en el otro modo', () => {
      const { tema, llamadas } = preparar({ guardado: 'claro', sistemaOscuro: true });

      tema.iniciar();

      assert.deepEqual(llamadas, ['aplicar: claro', 'mostrar: claro']);
    });

    it('un valor guardado que no es un modo se ignora', () => {
      const { tema, llamadas } = preparar({ guardado: 'azul', sistemaOscuro: true });

      tema.iniciar();

      assert.deepEqual(llamadas, ['aplicar: null', 'mostrar: oscuro']);
    });

    it('el clic cambia al modo contrario, lo guarda y lo aplica; otro clic vuelve', () => {
      const { tema, llamadas, guardados } = preparar({ sistemaOscuro: true });
      tema.iniciar();
      llamadas.length = 0;

      tema.alternar();
      assert.deepEqual(guardados, ['claro']);
      assert.deepEqual(llamadas, ['aplicar: claro', 'mostrar: claro']);

      tema.alternar();
      assert.deepEqual(guardados, ['claro', 'oscuro']);
      assert.deepEqual(llamadas, ['aplicar: claro', 'mostrar: claro', 'aplicar: oscuro', 'mostrar: oscuro']);
    });

    it('si no se puede guardar, el cambio igual se aplica en la página y el botón sigue alternando', () => {
      const { tema, llamadas } = preparar({ sistemaOscuro: false, guardarFalla: true });

      tema.alternar();
      tema.alternar();

      assert.deepEqual(llamadas, ['aplicar: oscuro', 'mostrar: oscuro', 'aplicar: claro', 'mostrar: claro']);
    });

    it('sin elección, si el sistema cambia de modo, el botón se actualiza', () => {
      const { tema, llamadas, sistema } = preparar({ sistemaOscuro: false });
      tema.iniciar();
      llamadas.length = 0;

      sistema.oscuro = true;
      tema.alCambiarSistema();

      assert.deepEqual(llamadas, ['mostrar: oscuro']);
    });

    it('con una elección (guardada o recién hecha), el cambio del sistema no la pisa', () => {
      const guardada = preparar({ guardado: 'claro', sistemaOscuro: false });
      guardada.sistema.oscuro = true;
      guardada.tema.alCambiarSistema();
      assert.deepEqual(guardada.llamadas, []);

      const recien = preparar({ sistemaOscuro: false });
      recien.tema.alternar(); // elige oscuro
      recien.llamadas.length = 0;
      recien.sistema.oscuro = true;
      recien.tema.alCambiarSistema();
      recien.sistema.oscuro = false;
      recien.tema.alCambiarSistema();
      assert.deepEqual(recien.llamadas, []);
    });

    it('un cambio en otra pestaña se aplica aquí; si allí se borró lo guardado, vuelve al sistema', () => {
      const { tema, llamadas, sistema } = preparar({ guardado: 'claro', sistemaOscuro: true });
      tema.iniciar();
      llamadas.length = 0;

      tema.alCambiarGuardado('oscuro');
      assert.deepEqual(llamadas, ['aplicar: oscuro', 'mostrar: oscuro']);

      sistema.oscuro = false;
      tema.alCambiarGuardado(null);
      assert.deepEqual(llamadas, ['aplicar: oscuro', 'mostrar: oscuro', 'aplicar: null', 'mostrar: claro']);

      // Ya sin elección, vuelve a seguir los cambios del sistema.
      sistema.oscuro = true;
      tema.alCambiarSistema();
      assert.equal(llamadas.at(-1), 'mostrar: oscuro');
    });

    it('el texto del botón dice lo que hace, no el modo actual', () => {
      assert.equal(textoDelBoton('oscuro'), 'Cambiar a modo claro');
      assert.equal(textoDelBoton('claro'), 'Cambiar a modo oscuro');
    });

    it('solo "claro" y "oscuro" son modos válidos', () => {
      assert.equal(modoValido('claro'), 'claro');
      assert.equal(modoValido('oscuro'), 'oscuro');
      for (const valor of [null, undefined, '', 'azul', 'dark', 'Claro']) {
        assert.equal(modoValido(valor), null, String(valor));
      }
    });
  });

  describe('páginas', () => {
    let entorno;
    let agente;
    let contactoId;

    before(async () => {
      entorno = await crearEntornoDePrueba();
      agente = request.agent(entorno.app);
      contactoId = crearContacto(
        entorno.db,
        { nombres: 'José', apellidos: 'Álvarez', dni: '01234567', tipo: 'cliente', telefonos: ['987654321'], correos: ['jose@empresa.pe'] },
        entorno.usuario.id,
      );
    });

    after(() => {
      entorno.db.close();
    });

    // Todas las páginas comparten cabecera.ejs y pie.ejs: se revisa una de cada vista.
    async function paginas() {
      const sinSesion = request(entorno.app);
      const resultado = [
        ['login', await sinSesion.get('/login')],
        ['error 403 (formulario vencido)', await sinSesion.post('/login').type('form').send({})],
      ];
      await iniciarSesion(agente);
      for (const ruta of ['/contactos', `/contactos/${contactoId}`, '/contactos/nuevo', `/contactos/${contactoId}/archivar`, '/no-existe']) {
        resultado.push([ruta, await agente.get(ruta)]);
      }
      return resultado;
    }

    it('el script del <head> es clásico (sin defer, async ni module), después del color-scheme y antes de la hoja de estilos', async () => {
      for (const [nombre, respuesta] of await paginas()) {
        const head = respuesta.text.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
        const scripts = head.match(/<script\b[^>]*>/g) ?? [];

        assert.deepEqual(scripts, ['<script src="/js/tema-inicial.js">'], nombre);
        const posicion = (texto) => head.indexOf(texto);
        assert.ok(posicion('<meta name="color-scheme"') !== -1, nombre);
        assert.ok(posicion('<meta name="color-scheme"') < posicion('<script'), `${nombre}: el script ajusta el <meta>, que debe existir antes`);
        assert.ok(posicion('<script') < posicion('<link rel="stylesheet"'), `${nombre}: si va después de la hoja de estilos, la espera`);
      }
    });

    it('el botón del modo viene oculto (sin JavaScript no se muestra) y se carga tema.js', async () => {
      for (const [nombre, respuesta] of await paginas()) {
        const boton = respuesta.text.match(/<button[^>]*data-tema-boton[^>]*>([\s\S]*?)<\/button>/);

        assert.ok(boton, nombre);
        assert.match(boton[0], /^<button type="button"[^>]* hidden>/, nombre);
        assert.match(boton[1], /<span class="visualmente-oculto" data-tema-texto><\/span>/, nombre);
        assert.match(boton[1], /<svg class="tema__icono"[^>]* aria-hidden="true"/, nombre);
        assert.ok(respuesta.text.indexOf('<script type="module" src="/js/tema.js"></script>') > boton.index, nombre);
      }
    });

    it('sirve los dos scripts', async () => {
      for (const ruta of ['/js/tema-inicial.js', '/js/tema.js']) {
        const respuesta = await request(entorno.app).get(ruta);
        assert.equal(respuesta.status, 200, ruta);
        assert.match(respuesta.headers['content-type'], /javascript/, ruta);
      }
    });
  });

  describe('estilos.css', () => {
    const sinComentarios = ESTILOS.replace(/\/\*[\s\S]*?\*\//g, '');
    // Respaldo para navegadores sin light-dark(): el :root dentro de @supports not (...), que
    // también vale con data-tema (siempre claro).
    const RESPALDO = /@supports not \(color: light-dark\(#000, #fff\)\) \{\s*:root,\s*:root\[data-tema\] \{([^{}]*)\}\s*\}/;
    const respaldo = sinComentarios.match(RESPALDO)?.[1] ?? null;
    // Reglas del archivo sin el respaldo: { selector, cuerpo } (las de un @media, con su selector).
    const reglas = [...sinComentarios.replace(RESPALDO, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
      ([, selector, cuerpo]) => ({ selector: selector.trim(), cuerpo }),
    );

    // Declaraciones de una regla como Map { propiedad → valor }, con los espacios normalizados.
    function declaraciones(cuerpo) {
      return new Map(
        cuerpo
          .split(';')
          .map((declaracion) => declaracion.trim())
          .filter(Boolean)
          .map((declaracion) => {
            const dosPuntos = declaracion.indexOf(':');
            return [declaracion.slice(0, dosPuntos).trim(), declaracion.slice(dosPuntos + 1).replace(/\s+/g, ' ').trim()];
          }),
      );
    }

    // El valor con cada light-dark(claro, oscuro) reemplazado por su valor claro (puede tener
    // paréntesis adentro: light-dark(rgb(16 24 40 / 5%), transparent)).
    function valorClaro(valor) {
      const FUNCION = 'light-dark(';
      let resultado = '';
      let desde = 0;
      for (let inicio = valor.indexOf(FUNCION); inicio !== -1; inicio = valor.indexOf(FUNCION, desde)) {
        let profundidad = 0;
        let coma = -1;
        let fin = inicio + FUNCION.length;
        for (; fin < valor.length; fin++) {
          const caracter = valor[fin];
          if (caracter === '(') {
            profundidad++;
          } else if (caracter === ')') {
            if (profundidad === 0) break;
            profundidad--;
          } else if (caracter === ',' && profundidad === 0 && coma === -1) {
            coma = fin;
          }
        }
        resultado += valor.slice(desde, inicio) + valor.slice(inicio + FUNCION.length, coma).trim();
        desde = fin + 1;
      }
      return resultado + valor.slice(desde);
    }

    it('el respaldo para navegadores sin light-dark() repite el valor claro de cada variable que lo usa, sin que falte ni sobre ninguna', () => {
      assert.ok(respaldo, 'falta el bloque @supports not (color: light-dark(#000, #fff)) { :root, :root[data-tema] { … } }');
      const principal = declaraciones(reglas.find((regla) => regla.selector === ':root').cuerpo);
      const esperadas = Object.fromEntries(
        [...principal].filter(([, valor]) => valor.includes('light-dark(')).map(([nombre, valor]) => [nombre, valorClaro(valor)]),
      );
      const enRespaldo = declaraciones(respaldo);

      // Siempre en modo claro: también los controles nativos, aunque el sistema esté en oscuro.
      assert.equal(enRespaldo.get('color-scheme'), 'light');
      enRespaldo.delete('color-scheme');
      assert.ok(Object.keys(esperadas).length >= 30, 'debería haber al menos 30 variables con light-dark()');
      assert.deepEqual(Object.fromEntries(enRespaldo), esperadas);
      assert.equal(esperadas['--sombra-tarjeta'], '0 1px 2px rgb(16 24 40 / 5%), 0 1px 3px rgb(16 24 40 / 8%)');
    });

    it('los colores se definen una sola vez, en :root, con light-dark(): sin una segunda paleta para el modo oscuro', () => {
      const conColores = reglas.filter((regla) => /--color-[\w-]+\s*:/.test(regla.cuerpo));

      assert.deepEqual(conColores.map((regla) => regla.selector), [':root']);
      assert.match(conColores[0].cuerpo, /--color-fondo:\s*light-dark\(#f5f6fa, #0f1117\);/);
      assert.doesNotMatch(ESTILOS, /prefers-color-scheme/);
    });

    it('el modo lo decide color-scheme: el del sistema, salvo que data-tema diga otro', () => {
      const colorScheme = (selector) => reglas.find((regla) => regla.selector === selector)?.cuerpo.match(/color-scheme:\s*([^;]+);/)?.[1];

      assert.equal(colorScheme(':root'), 'light dark');
      assert.equal(colorScheme(':root[data-tema="claro"]'), 'light');
      assert.equal(colorScheme(':root[data-tema="oscuro"]'), 'dark');
    });
  });
});
