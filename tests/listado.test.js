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

  it('muestra lo buscado y los filtros elegidos en el formulario', async () => {
    const html = (await agente.get('/contactos?q=perez&tipo=proveedor&estado=archivados')).text;

    assert.match(html, /<h1>Contactos archivados<\/h1>/);
    assert.match(html, /id="q" name="q" type="search" value="perez"/);
    assert.match(html, /<option value="proveedor" selected>Proveedores<\/option>/);
    assert.match(html, /<option value="archivados" selected>Archivados<\/option>/);
    assert.match(html, /<a href="\/contactos" class="boton boton--secundario">Limpiar<\/a>/);
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
      assert.match(respuesta.text, /<h1>Contactos<\/h1>/, consulta);
      assert.ok(respuesta.text.includes('Pérez') || respuesta.text.includes('Activo'), consulta);
    }
  });

  it('un texto de búsqueda larguísimo se recorta a 100 caracteres', async () => {
    const html = (await agente.get(`/contactos?q=${'a'.repeat(500)}`)).text;

    assert.ok(html.includes(`value="${'a'.repeat(100)}"`));
    assert.ok(!html.includes('a'.repeat(101)));
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
