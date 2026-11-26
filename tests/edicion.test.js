// Pruebas de editar, archivar y restaurar contactos (C5, C7, A1): el servicio y las páginas.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  ConflictoDeEdicion,
  archivarContacto,
  buscarContacto,
  crearContacto,
  editarContacto,
  restaurarContacto,
} from '../src/services/contactos.js';
import { crearUsuario } from '../src/services/usuarios.js';
import { ErrorDeValidacion } from '../src/validators/validar.js';
import {
  NOMBRE,
  PASSWORD,
  codificarFormulario,
  crearEntornoDePrueba,
  enviarFormulario,
  iniciarSesion,
  tokenCsrf,
} from './helpers/app-de-prueba.js';

// Como los envía el formulario.
const DATOS = {
  nombres: 'José',
  apellidos: 'Álvarez Núñez',
  dni: '01234567',
  tipo: 'ambos',
  telefonos: ['987 654 321', '(01) 234-5678', '', '', ''],
  correos: ['jose@empresa.pe', '', '', '', ''],
};
const EDITADOS = {
  nombres: 'José Luis',
  apellidos: 'Álvarez',
  dni: '01234567',
  tipo: 'proveedor',
  telefonos: ['(044) 123456', '', '', '', ''],
  correos: ['ventas@empresa.pe', 'jose@empresa.pe', '', '', ''],
};
const OTRA_PERSONA = 'Luis Rojas';

const versionDelFormulario = (html) => html.match(/name="version" value="([^"]*)"/)?.[1] ?? null;

describe('contactos: editar, archivar y restaurar', () => {
  let entorno;
  let otraPersona; // segundo usuario, para la auditoría y las ediciones simultáneas

  beforeEach(async () => {
    entorno = await crearEntornoDePrueba();
    otraPersona = await crearUsuario(
      entorno.db,
      { nombre: OTRA_PERSONA, correo: 'luis@empresa.pe', password: PASSWORD },
      { costo: 4 },
    );
  });

  afterEach(() => {
    entorno.db.close();
  });

  const crear = (cambios = {}) => crearContacto(entorno.db, { ...DATOS, ...cambios }, entorno.usuario.id);
  const leer = (id) => buscarContacto(entorno.db, id);

  // Error que lanza `accion`, o falla si no lanza ninguno.
  function errorDe(accion) {
    try {
      accion();
    } catch (error) {
      return error;
    }
    assert.fail('se esperaba un error');
  }

  describe('servicio', () => {
    it('editar reemplaza los datos, los teléfonos y los correos, y registra quién y cuándo (A1)', () => {
      const id = crear();

      editarContacto(entorno.db, id, { ...EDITADOS, version: '1' }, otraPersona.id);

      const contacto = leer(id);
      assert.equal(contacto.nombres, 'José Luis');
      assert.equal(contacto.apellidos, 'Álvarez');
      assert.equal(contacto.tipo, 'proveedor');
      assert.deepEqual(contacto.telefonos, [{ numero: '44123456', tipo: 'fijo' }]);
      assert.deepEqual(contacto.correos, ['ventas@empresa.pe', 'jose@empresa.pe']);
      assert.equal(contacto.version, 2);
      assert.equal(contacto.auditoria.creado.por, NOMBRE);
      assert.equal(contacto.auditoria.actualizado.por, OTRA_PERSONA);
    });

    it('si falla un paso, no cambia nada: ni los datos ni los teléfonos (transacción)', () => {
      const id = crear();
      const antes = leer(id);
      entorno.db.exec(`
        CREATE TEMP TRIGGER falla_al_guardar_correos BEFORE INSERT ON correos
        BEGIN SELECT RAISE(ABORT, 'falla simulada'); END
      `);

      assert.throws(() => editarContacto(entorno.db, id, { ...EDITADOS, version: '1' }, otraPersona.id), /falla simulada/);

      assert.deepEqual(leer(id), antes);
    });

    it('con datos inválidos no cambia nada', () => {
      const id = crear();
      const antes = leer(id);

      const error = errorDe(() => editarContacto(entorno.db, id, { ...EDITADOS, dni: '123', version: '1' }, otraPersona.id));

      assert.ok(error instanceof ErrorDeValidacion);
      assert.deepEqual(leer(id), antes);
    });

    it('con una versión vieja no guarda y dice quién lo modificó (C7)', () => {
      const id = crear();
      editarContacto(entorno.db, id, { ...EDITADOS, version: '1' }, otraPersona.id);
      const guardado = leer(id);

      const error = errorDe(() =>
        editarContacto(entorno.db, id, { ...DATOS, nombres: 'Otro', version: '1' }, entorno.usuario.id),
      );

      assert.ok(error instanceof ConflictoDeEdicion);
      assert.equal(error.motivo, 'version');
      assert.deepEqual(error.actual, { version: 2, por: OTRA_PERSONA, en: guardado.auditoria.actualizado.en });
      assert.deepEqual(leer(id), guardado);
    });

    it('una versión que no es un número válido se trata como conflicto (no guarda)', () => {
      const id = crear();

      for (const version of ['abc', '', '0', '1.5', '-1', undefined, ['1', '1']]) {
        const error = errorDe(() => editarContacto(entorno.db, id, { ...EDITADOS, version }, otraPersona.id));
        assert.ok(error instanceof ConflictoDeEdicion, JSON.stringify(version));
      }
      assert.equal(leer(id).nombres, 'José');
    });

    it('no permite usar el DNI de otro contacto (C2); el propio sí', () => {
      const id = crear();
      crear({ dni: '76543210', nombres: 'Rosa' });

      const error = errorDe(() =>
        editarContacto(entorno.db, id, { ...EDITADOS, dni: '76543210', version: '1' }, otraPersona.id),
      );

      assert.ok(error instanceof ErrorDeValidacion);
      assert.match(error.errores[0].mensaje, /Ya existe un contacto con este DNI: Rosa Álvarez Núñez/);
      editarContacto(entorno.db, id, { ...EDITADOS, version: '1' }, otraPersona.id);
    });

    it('un contacto archivado no se edita (C5)', () => {
      const id = crear();
      archivarContacto(entorno.db, id, otraPersona.id);

      const error = errorDe(() => editarContacto(entorno.db, id, { ...EDITADOS, version: '2' }, entorno.usuario.id));

      assert.ok(error instanceof ConflictoDeEdicion);
      assert.equal(error.motivo, 'archivado');
      assert.equal(leer(id).nombres, 'José');
    });

    it('con un contacto que no existe, editar, archivar y restaurar dan 404', () => {
      for (const accion of [
        () => editarContacto(entorno.db, 999, { ...EDITADOS, version: '1' }, entorno.usuario.id),
        () => archivarContacto(entorno.db, 999, entorno.usuario.id),
        () => restaurarContacto(entorno.db, 999, entorno.usuario.id),
      ]) {
        assert.equal(errorDe(accion).status, 404);
      }
    });

    it('archivar guarda quién y cuándo, sube la versión y no cambia la última modificación (A1, C7)', () => {
      const id = crear();
      const antes = leer(id);

      assert.equal(archivarContacto(entorno.db, id, otraPersona.id), true);

      const contacto = leer(id);
      assert.equal(contacto.archivado, true);
      assert.equal(contacto.auditoria.archivado.por, OTRA_PERSONA);
      assert.equal(contacto.version, 2);
      assert.deepEqual(contacto.auditoria.actualizado, antes.auditoria.actualizado);
    });

    it('archivar un contacto ya archivado no cambia nada', () => {
      const id = crear();
      archivarContacto(entorno.db, id, otraPersona.id);
      const archivado = leer(id);

      assert.equal(archivarContacto(entorno.db, id, entorno.usuario.id), false);
      assert.deepEqual(leer(id), archivado);
    });

    it('restaurar borra quién lo archivó y cuenta como modificación (A1)', () => {
      const id = crear();
      archivarContacto(entorno.db, id, entorno.usuario.id);

      assert.equal(restaurarContacto(entorno.db, id, otraPersona.id), true);

      const contacto = leer(id);
      assert.equal(contacto.archivado, false);
      assert.equal(contacto.auditoria.archivado, null);
      assert.equal(contacto.auditoria.actualizado.por, OTRA_PERSONA);
      assert.equal(contacto.version, 3);
    });

    it('restaurar un contacto activo no cambia nada', () => {
      const id = crear();
      const antes = leer(id);

      assert.equal(restaurarContacto(entorno.db, id, otraPersona.id), false);
      assert.deepEqual(leer(id), antes);
    });
  });

  describe('páginas', () => {
    let agente;

    beforeEach(async () => {
      agente = request.agent(entorno.app);
      await iniciarSesion(agente);
    });

    // Abre el formulario de edición y lo envía como un navegador, con su token y su versión.
    async function editarComoNavegador(id, datos = EDITADOS) {
      const formulario = (await agente.get(`/contactos/${id}/editar`)).text;
      return enviarDesde(formulario, `/contactos/${id}/editar`, datos);
    }

    // Envía `datos` con el token CSRF y la versión de la página `html` (por ejemplo, un formulario
    // que se abrió antes).
    function enviarDesde(html, accion, datos) {
      return agente
        .post(accion)
        .type('form')
        .send(codificarFormulario({ ...datos, version: versionDelFormulario(html), _csrf: tokenCsrf(html) }));
    }

    async function postConToken(accion) {
      const pagina = (await agente.get('/contactos')).text;
      return agente.post(accion).type('form').send({ _csrf: tokenCsrf(pagina) });
    }

    it('el detalle de un contacto activo ofrece editar y archivar', async () => {
      const id = crear();

      const html = (await agente.get(`/contactos/${id}`)).text;

      assert.ok(html.includes(`<a href="/contactos/${id}/editar" class="boton">Editar</a>`));
      assert.ok(html.includes(`<a href="/contactos/${id}/archivar" class="boton boton--secundario">Archivar</a>`));
      assert.ok(!html.includes('/restaurar'));
    });

    it('el formulario de edición muestra lo guardado, con los teléfonos con formato, y la versión', async () => {
      const id = crear();

      const respuesta = await agente.get(`/contactos/${id}/editar`);

      assert.equal(respuesta.status, 200);
      const html = respuesta.text;
      assert.ok(html.includes(`<form method="post" action="/contactos/${id}/editar"`));
      assert.equal(versionDelFormulario(html), '1');
      assert.match(html, /id="nombres" name="nombres" type="text" value="José"/);
      assert.match(html, /id="telefono-1" name="telefonos" type="tel" value="987 654 321"/);
      assert.match(html, /id="telefono-2" name="telefonos" type="tel" value="\(01\) 234 5678"/);
      assert.match(html, /id="correo-1" name="correos" type="email" value="jose@empresa.pe"/);
      assert.match(html, /value="ambos" checked/);
      assert.ok(html.includes('>Guardar cambios</button>'));
      assert.ok(html.includes(`<a href="/contactos/${id}" class="boton boton--secundario">Cancelar</a>`));
    });

    it('guardar cambios redirige al detalle con un aviso y la auditoría actualizada', async () => {
      const id = crear();

      const respuesta = await editarComoNavegador(id);

      assert.equal(respuesta.status, 303);
      assert.equal(respuesta.headers.location, `/contactos/${id}`);
      const html = (await agente.get(`/contactos/${id}`)).text;
      for (const texto of ['Cambios guardados.', 'José Luis Álvarez', 'Proveedor', '(044) 123456', 'ventas@empresa.pe']) {
        assert.ok(html.includes(texto), texto);
      }
      assert.ok(!html.includes('987 654 321'));
    });

    it('con errores vuelve a mostrar lo escrito, con la misma versión, y no cambia nada', async () => {
      const id = crear();

      const respuesta = await editarComoNavegador(id, { ...EDITADOS, nombres: 'José2' });

      assert.equal(respuesta.status, 400);
      assert.match(respuesta.text, /id="nombres" name="nombres" type="text" value="José2"/);
      assert.match(respuesta.text, /id="error-nombres">Los nombres solo pueden tener letras/);
      assert.equal(versionDelFormulario(respuesta.text), '1');
      assert.equal(leer(id).nombres, 'José');
    });

    it('si otra persona guardó antes, no sobrescribe; con el aviso, se puede reemplazar a sabiendas (C7)', async () => {
      const id = crear();
      const formularioAbierto = (await agente.get(`/contactos/${id}/editar`)).text;
      // Mientras tanto, otra persona guarda sus cambios.
      editarContacto(entorno.db, id, { ...EDITADOS, version: '1' }, otraPersona.id);

      const conflicto = await enviarDesde(formularioAbierto, `/contactos/${id}/editar`, { ...DATOS, nombres: 'Pepe' });

      assert.equal(conflicto.status, 409);
      assert.match(conflicto.text, new RegExp(`${OTRA_PERSONA} modificó este contacto el\\s+\\d+ \\w+\\.`));
      assert.ok(conflicto.text.includes(`<a href="/contactos/${id}" target="_blank" rel="noopener">versión guardada</a>`));
      assert.match(conflicto.text, /id="nombres" name="nombres" type="text" value="Pepe"/);
      assert.equal(versionDelFormulario(conflicto.text), '2');
      assert.equal(leer(id).nombres, 'José Luis');

      // Guarda de nuevo desde el formulario del aviso: ahora sí reemplaza.
      const reemplazo = await enviarDesde(conflicto.text, `/contactos/${id}/editar`, { ...DATOS, nombres: 'Pepe' });

      assert.equal(reemplazo.status, 303);
      assert.equal(leer(id).nombres, 'Pepe');
      assert.equal(leer(id).auditoria.actualizado.por, NOMBRE);
    });

    it('si lo archivan mientras se edita, no guarda y lo dice (C5)', async () => {
      const id = crear();
      const formularioAbierto = (await agente.get(`/contactos/${id}/editar`)).text;
      archivarContacto(entorno.db, id, otraPersona.id);

      const respuesta = await enviarDesde(formularioAbierto, `/contactos/${id}/editar`, EDITADOS);

      assert.equal(respuesta.status, 409);
      assert.match(respuesta.text, /este contacto fue archivado mientras lo editabas/);
      assert.match(respuesta.text, /id="nombres" name="nombres" type="text" value="José Luis"/);
      assert.equal(leer(id).nombres, 'José');
    });

    it('archivar pide confirmación y el POST lo archiva y lo saca del listado', async () => {
      const id = crear();

      const confirmacion = (await agente.get(`/contactos/${id}/archivar`)).text;
      assert.match(confirmacion, /¿Archivar a José Álvarez Núñez\?/);
      assert.ok(confirmacion.includes(`<form method="post" action="/contactos/${id}/archivar"`));

      const respuesta = await enviarFormulario(agente, {
        pagina: `/contactos/${id}/archivar`,
        accion: `/contactos/${id}/archivar`,
        datos: {},
      });
      assert.equal(respuesta.status, 303);
      assert.equal(respuesta.headers.location, `/contactos/${id}`);

      const detalle = (await agente.get(`/contactos/${id}`)).text;
      assert.ok(detalle.includes('Contacto archivado.'));
      assert.ok(detalle.includes('Este contacto está archivado'));
      assert.ok(detalle.includes(`<form method="post" action="/contactos/${id}/restaurar">`));
      assert.ok(!detalle.includes(`/contactos/${id}/editar`));
      assert.ok(!(await agente.get('/contactos')).text.includes('Álvarez Núñez, José'));
      assert.ok((await agente.get('/contactos?estado=archivados')).text.includes('Álvarez Núñez, José'));
    });

    it('un contacto archivado no se edita: /editar vuelve al detalle con un aviso, y /archivar también', async () => {
      const id = crear();
      archivarContacto(entorno.db, id, entorno.usuario.id);

      for (const ruta of [`/contactos/${id}/editar`, `/contactos/${id}/archivar`]) {
        const respuesta = await agente.get(ruta);
        assert.equal(respuesta.status, 302, ruta);
        assert.equal(respuesta.headers.location, `/contactos/${id}`, ruta);
      }
      assert.ok((await agente.get(`/contactos/${id}`)).text.includes('restáuralo para poder editarlo'));
    });

    it('restaurar desde el detalle lo devuelve al listado y registra quién (A1)', async () => {
      const id = crear();
      archivarContacto(entorno.db, id, otraPersona.id);

      const respuesta = await enviarFormulario(agente, {
        pagina: `/contactos/${id}`,
        accion: `/contactos/${id}/restaurar`,
        datos: {},
      });

      assert.equal(respuesta.status, 303);
      const detalle = (await agente.get(`/contactos/${id}`)).text;
      assert.ok(detalle.includes('Contacto restaurado.'));
      assert.ok(detalle.includes(`/contactos/${id}/editar`));
      assert.match(detalle, new RegExp(`<dt>Última modificación</dt>\\s*<dd>${NOMBRE} ·`));
      assert.doesNotMatch(detalle, /<dt>Archivado<\/dt>/);
      assert.ok((await agente.get('/contactos')).text.includes('Álvarez Núñez, José'));
    });

    it('editar, archivar y restaurar sin token CSRF responden 403 y no cambian nada', async () => {
      const id = crear();
      const antes = leer(id);

      for (const accion of ['editar', 'archivar', 'restaurar']) {
        const respuesta = await agente
          .post(`/contactos/${id}/${accion}`)
          .type('form')
          .send(codificarFormulario({ ...EDITADOS, version: '1' }));
        assert.equal(respuesta.status, 403, accion);
      }
      assert.deepEqual(leer(id), antes);
    });

    it('con un contacto que no existe o un id inválido responden 404', async () => {
      for (const id of ['999', 'abc', '0']) {
        assert.equal((await agente.get(`/contactos/${id}/editar`)).status, 404, `GET editar ${id}`);
        assert.equal((await agente.get(`/contactos/${id}/archivar`)).status, 404, `GET archivar ${id}`);
        for (const accion of ['editar', 'archivar', 'restaurar']) {
          assert.equal((await postConToken(`/contactos/${id}/${accion}`)).status, 404, `POST ${accion} ${id}`);
        }
      }
    });

    it('al crear con el DNI de un contacto archivado, "Restaurar ese contacto" lo restaura (C2)', async () => {
      const archivado = crear();
      archivarContacto(entorno.db, archivado, entorno.usuario.id);

      const respuesta = await enviarFormulario(agente, {
        pagina: '/contactos/nuevo',
        accion: '/contactos',
        datos: { ...DATOS, nombres: 'Luis' },
      });

      assert.equal(respuesta.status, 400);
      assert.ok(respuesta.text.includes('<button type="submit" form="restaurar-dni"'));
      assert.ok(respuesta.text.includes(`<form id="restaurar-dni" method="post" action="/contactos/${archivado}/restaurar" hidden>`));

      // El botón envía el formulario "restaurar-dni", con su token.
      const restaurar = await agente
        .post(`/contactos/${archivado}/restaurar`)
        .type('form')
        .send({ _csrf: tokenCsrf(respuesta.text.slice(respuesta.text.indexOf('id="restaurar-dni"'))) });

      assert.equal(restaurar.status, 303);
      assert.equal(restaurar.headers.location, `/contactos/${archivado}`);
      assert.equal(leer(archivado).archivado, false);
    });

    it('al editar, el DNI de otro contacto archivado se enlaza pero no ofrece restaurarlo', async () => {
      const id = crear();
      const otro = crear({ dni: '76543210', nombres: 'Rosa' });
      archivarContacto(entorno.db, otro, entorno.usuario.id);

      const respuesta = await editarComoNavegador(id, { ...EDITADOS, dni: '76543210' });

      assert.equal(respuesta.status, 400);
      assert.match(respuesta.text, /Este DNI pertenece a un contacto archivado: Rosa Álvarez Núñez\./);
      assert.ok(respuesta.text.includes(`<a href="/contactos/${otro}">`));
      assert.ok(!respuesta.text.includes('restaurar-dni'));
    });
  });
});
