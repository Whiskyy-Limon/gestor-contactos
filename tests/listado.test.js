// Pruebas de la página del listado (B1–B3): filtros en el formulario, enlaces de paginación,
// parámetros inválidos y escape de lo buscado. La lógica de búsqueda se prueba en busqueda.test.js.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { crearContacto } from '../src/services/contactos.js';
import { crearEntornoDePrueba, iniciarSesion } from './helpers/app-de-prueba.js';

describe('página del listado de contactos', () => {
  let entorno;
  let agente;
  let numero;

  beforeEach(async () => {
    entorno = await crearEntornoDePrueba();
    agente = request.agent(entorno.app);
    await iniciarSesion(agente);
    numero = 0;
  });

  afterEach(() => {
    entorno.db.close();
  });

  function nuevo(datos = {}) {
    numero++;
    return crearContacto(
      entorno.db,
      {
        nombres: 'Ana',
        apellidos: 'Pérez',
        dni: String(10000000 + numero),
        tipo: 'cliente',
        telefonos: [`9${String(numero).padStart(8, '0')}`],
        correos: [`persona${numero}@empresa.pe`],
        ...datos,
      },
      entorno.usuario.id,
    );
  }

  // href de los enlaces de paginación, con &amp; ya convertido en &.
  function enlace(html, rel) {
    return html.match(new RegExp(`<a href="([^"]+)" rel="${rel}">`))?.[1].replaceAll('&amp;', '&') ?? null;
  }

  it('/ lleva al listado, y sin sesión el listado lleva al login', async () => {
    const inicio = await agente.get('/');
    assert.equal(inicio.status, 302);
    assert.equal(inicio.headers.location, '/contactos');

    const sinSesion = await request(entorno.app).get('/contactos');
    assert.equal(sinSesion.status, 302);
    assert.equal(sinSesion.headers.location, '/login');
  });

  it('sin contactos, invita a crear el primero', async () => {
    const html = (await agente.get('/contactos')).text;

    assert.match(html, /Todavía no hay contactos\. <a href="\/contactos\/nuevo">Crea el primero<\/a>/);
  });

  it('cada fila muestra el avatar, el nombre con enlace al detalle, el tipo, el DNI, el teléfono y el correo', async () => {
    const id = nuevo({
      nombres: 'José',
      apellidos: 'Álvarez',
      dni: '01234567',
      tipo: 'ambos',
      telefonos: ['(044) 123456'],
      correos: ['jose@empresa.pe'],
    });

    const html = (await agente.get('/contactos')).text;

    assert.match(html, /<span class="avatar avatar--\d avatar--chico" aria-hidden="true">JÁ<\/span>/);
    assert.ok(html.includes(`<a href="/contactos/${id}">Álvarez, José</a>`));
    for (const texto of ['Cliente y proveedor', '01234567', '(044) 123456', 'jose@empresa.pe', 'Mostrando 1–1 de 1']) {
      assert.ok(html.includes(texto), `debía mostrar ${texto}`);
    }
  });

  it('el tipo va en su columna, con la etiqueta de su color (C6)', async () => {
    nuevo({ apellidos: 'Aguilar', tipo: 'cliente' });
    nuevo({ apellidos: 'Benites', tipo: 'proveedor' });
    nuevo({ apellidos: 'Cáceres', tipo: 'ambos' });

    const html = (await agente.get('/contactos')).text;

    assert.match(html, /<th scope="col" role="columnheader">Tipo<\/th>/);
    assert.ok(html.includes('<span class="etiqueta etiqueta--cliente">Cliente</span>'));
    assert.ok(html.includes('<span class="etiqueta etiqueta--proveedor">Proveedor</span>'));
    assert.ok(html.includes('<span class="etiqueta etiqueta--ambos">Cliente y proveedor</span>'));
  });

  it('la tabla repite sus roles ARIA y cada dato lleva su rótulo para la vista de celular', async () => {
    nuevo({ dni: '01234567', telefonos: ['987 654 321'], correos: ['ana@empresa.pe'] });

    const html = (await agente.get('/contactos')).text;

    assert.match(html, /<table class="tabla" role="table">/);
    assert.match(html, /<thead role="rowgroup">\s*<tr role="row">/);
    assert.match(html, /<tbody role="rowgroup">\s*<tr role="row">/);
    assert.equal(html.match(/role="columnheader"/g).length, 5);
    assert.equal(html.match(/<td role="cell"/g).length, 5);
    assert.ok(html.includes('data-etiqueta="DNI">01234567</td>'));
    assert.ok(html.includes('data-etiqueta="Teléfono">987 654 321</td>'));
    assert.ok(html.includes('data-etiqueta="Correo">ana@empresa.pe</td>'));
  });

  it('muestra lo buscado y los filtros elegidos en el formulario', async () => {
    const html = (await agente.get('/contactos?q=perez&tipo=proveedor&estado=archivados')).text;

    assert.match(html, /<h1 data-titulo-listado>Contactos archivados<\/h1>/);
    assert.match(html, /id="q" name="q" type="search" value="perez"/);
    assert.match(html, /<option value="proveedor" selected>Proveedores<\/option>/);
    assert.match(html, /<option value="archivados" selected>Archivados<\/option>/);
  });

  it('sin JavaScript se busca con el botón "Buscar"; ya no hay "Limpiar"', async () => {
    const html = (await agente.get('/contactos?q=perez')).text;

    assert.match(html, /<form method="get" action="\/contactos"[^>]*data-busqueda-en-vivo="resultados">/);
    assert.match(html, /<button type="submit" class="boton" data-boton-buscar>Buscar<\/button>/);
    assert.doesNotMatch(html, /Limpiar/);
  });

  it('sin resultados, lo dice', async () => {
    nuevo();

    const html = (await agente.get('/contactos?q=nadie')).text;

    assert.match(html, /No se encontraron contactos con esa búsqueda\./);
  });

  it('escapa lo buscado al mostrarlo', async () => {
    const respuesta = await agente.get(`/contactos?q=${encodeURIComponent('"><script>alert(1)</script>')}`);

    assert.equal(respuesta.status, 200);
    assert.ok(respuesta.text.includes('value="&#34;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"'));
    assert.doesNotMatch(respuesta.text, /<script>alert/);
  });

  it('con parámetros inválidos usa los valores por defecto en vez de fallar', async () => {
    nuevo({ apellidos: 'Activo' });

    for (const consulta of ['tipo=otro&estado=raro&pagina=abc', 'pagina=-3', 'pagina=0', 'q=a&q=b', 'tipo[]=cliente']) {
      const respuesta = await agente.get(`/contactos?${consulta}`);
      assert.equal(respuesta.status, 200, consulta);
      assert.match(respuesta.text, /<h1 data-titulo-listado>Contactos<\/h1>/, consulta);
      assert.ok(respuesta.text.includes('Pérez') || respuesta.text.includes('Activo'), consulta);
    }
  });

  it('un texto de búsqueda larguísimo se recorta a 100 caracteres', async () => {
    const html = (await agente.get(`/contactos?q=${'a'.repeat(500)}`)).text;

    assert.ok(html.includes(`value="${'a'.repeat(100)}"`));
    assert.ok(!html.includes('a'.repeat(101)));
  });

  describe('búsqueda en vivo: fragmento de resultados', () => {
    // Atributos data-* del elemento raíz del fragmento.
    function datosDelFragmento(html) {
      const raiz = html.match(/<div class="resultados__contenido" ([^>]*)>/)[1];
      return Object.fromEntries([...raiz.matchAll(/data-(\w+)="([^"]*)"/g)].map(([, nombre, valor]) => [nombre, valor]));
    }

    it('devuelve solo los resultados, sin la página alrededor', async () => {
      const id = nuevo({ nombres: 'Hortensia', apellidos: 'Quispe' });
      nuevo({ nombres: 'Ana', apellidos: 'Ochoa' });

      const respuesta = await agente.get('/contactos/resultados?q=ho');

      assert.equal(respuesta.status, 200);
      assert.match(respuesta.headers['content-type'], /^text\/html/);
      assert.match(respuesta.text, /^<div class="resultados__contenido"/);
      assert.doesNotMatch(respuesta.text, /<html|<header|<form|<script/);
      assert.ok(respuesta.text.includes(`<a href="/contactos/${id}">Quispe, Hortensia</a>`));
      assert.ok(!respuesta.text.includes('Ochoa'));
    });

    it('es el mismo HTML que la página completa muestra en #resultados', async () => {
      nuevo({ nombres: 'Hortensia', apellidos: 'Quispe' });

      const fragmento = (await agente.get('/contactos/resultados?q=ho&tipo=cliente')).text;
      const pagina = (await agente.get('/contactos?q=ho&tipo=cliente')).text;

      assert.ok(pagina.includes(fragmento.trim()));
    });

    it('trae la dirección canónica, el título y el anuncio para lectores de pantalla', async () => {
      nuevo({ nombres: 'Hortensia', apellidos: 'Quispe' });
      nuevo({ nombres: 'Hugo', apellidos: 'Díaz' });

      assert.deepEqual(datosDelFragmento((await agente.get('/contactos/resultados?q=h&tipo=&estado=activos')).text), {
        url: '/contactos?q=h',
        titulo: 'Contactos',
        anuncio: '2 contactos encontrados.',
      });
      assert.deepEqual(datosDelFragmento((await agente.get('/contactos/resultados?q=hor')).text).anuncio, '1 contacto encontrado.');
      assert.deepEqual(datosDelFragmento((await agente.get('/contactos/resultados?q=xyz&estado=archivados')).text), {
        url: '/contactos?q=xyz&amp;estado=archivados',
        titulo: 'Contactos archivados',
        anuncio: 'No se encontraron contactos.',
      });
    });

    it('escapa lo buscado y los datos de los contactos', async () => {
      const id = nuevo({ nombres: 'Ana', apellidos: 'Pérez' });
      entorno.db.prepare('UPDATE contactos SET nombres = ? WHERE id = ?').run('<b>Ana</b>', id);

      const html = (await agente.get(`/contactos/resultados?q=${encodeURIComponent('"><script>x</script>')}`)).text;
      const conDatos = (await agente.get('/contactos/resultados')).text;

      assert.doesNotMatch(html, /<script|"><|<\/script>/);
      assert.ok(conDatos.includes('Pérez, &lt;b&gt;Ana&lt;/b&gt;'));
      assert.doesNotMatch(conDatos, /<b>Ana/);
    });

    it('sin sesión redirige al login, y con sesión no se guarda en caché', async () => {
      const sinSesion = await request(entorno.app).get('/contactos/resultados?q=a');
      assert.equal(sinSesion.status, 302);
      assert.equal(sinSesion.headers.location, '/login');

      const conSesion = await agente.get('/contactos/resultados?q=a');
      assert.equal(conSesion.headers['cache-control'], 'no-store');
    });

    it('la página completa tiene la región que anuncia los resultados, vacía, y el script', async () => {
      const html = (await agente.get('/contactos')).text;

      assert.match(html, /<p class="visualmente-oculto" role="status" aria-live="polite" data-anuncio-busqueda><\/p>/);
      assert.match(html, /<div id="resultados" class="resultados">\s*<div class="resultados__contenido"/);
      assert.match(html, /<script type="module" src="\/js\/busqueda\.js"><\/script>/);
    });
  });

  describe('enlaces de paginación (B3)', () => {
    beforeEach(() => {
      for (let i = 0; i < 25; i++) {
        nuevo({ nombres: 'Rosa', apellidos: `Quispe ${String.fromCharCode(97 + i)}` });
      }
      nuevo({ nombres: 'Rosa', apellidos: 'Proveedora', tipo: 'proveedor' });
    });

    it('conservan la búsqueda y los filtros, y la página 1 no lleva el parámetro', async () => {
      const primera = (await agente.get('/contactos?q=quispe&tipo=cliente')).text;

      assert.match(primera, /Mostrando 1–20 de 25/);
      assert.match(primera, /Página 1 de 2/);
      assert.equal(enlace(primera, 'prev'), null);
      assert.equal(enlace(primera, 'next'), '/contactos?q=quispe&tipo=cliente&pagina=2');

      const segunda = (await agente.get(enlace(primera, 'next'))).text;

      assert.match(segunda, /Mostrando 21–25 de 25/);
      assert.equal(enlace(segunda, 'prev'), '/contactos?q=quispe&tipo=cliente');
      assert.equal(enlace(segunda, 'next'), null);
    });

    it('con una sola página no muestra la paginación', async () => {
      const html = (await agente.get('/contactos?tipo=proveedor')).text;

      assert.match(html, /Mostrando 1–1 de 1/);
      assert.doesNotMatch(html, /class="paginacion"/);
    });
  });
});
