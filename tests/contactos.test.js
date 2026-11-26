// Pruebas de crear y ver contactos: el servicio (transacción, DNI repetido, auditoría) y las
// páginas (formulario, errores junto a cada campo, detalle, escape del HTML).
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buscarContacto, crearContacto } from '../src/services/contactos.js';
import { ErrorDeValidacion } from '../src/validators/validar.js';
import { NOMBRE, crearEntornoDePrueba, enviarFormulario, iniciarSesion } from './helpers/app-de-prueba.js';

// Como los envía el formulario: 5 filas de teléfonos y 5 de correos.
const DATOS = {
  nombres: 'José',
  apellidos: 'Álvarez Núñez',
  dni: '01234567',
  tipo: 'ambos',
  telefonos: ['987 654 321', '(01) 234-5678', '(044) 123456', '', ''],
  correos: ['Jose@Empresa.PE', 'ventas@empresa.pe', '', '', ''],
};

describe('contactos: crear y ver', () => {
  let entorno;

  beforeEach(async () => {
    entorno = await crearEntornoDePrueba();
  });

  afterEach(() => {
    entorno.db.close();
  });

  const contar = (tabla) => entorno.db.prepare(`SELECT count(*) FROM ${tabla}`).pluck().get();
  const crear = (cambios = {}) => crearContacto(entorno.db, { ...DATOS, ...cambios }, entorno.usuario.id);
  const archivar = (id) =>
    entorno.db
      .prepare("UPDATE contactos SET archivado_en = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), archivado_por = ? WHERE id = ?")
      .run(entorno.usuario.id, id);

  // Error de validación que lanza `accion`, o falla si no lanza ninguno.
  function errorDe(accion) {
    try {
      accion();
    } catch (error) {
      assert.ok(error instanceof ErrorDeValidacion, `se esperaba ErrorDeValidacion y llegó ${error}`);
      return error;
    }
    assert.fail('se esperaba un error de validación');
  }

  describe('servicio crearContacto', () => {
    it('guarda el contacto normalizado, con sus teléfonos y correos y la auditoría (A1)', () => {
      const id = crear();
      const contacto = buscarContacto(entorno.db, id);

      assert.equal(contacto.nombres, 'José');
      assert.equal(contacto.apellidos, 'Álvarez Núñez');
      assert.equal(contacto.dni, '01234567');
      assert.equal(contacto.tipo, 'ambos');
      assert.equal(contacto.version, 1);
      assert.equal(contacto.archivado, false);
      assert.deepEqual(contacto.telefonos, [
        { numero: '987654321', tipo: 'celular' },
        { numero: '012345678', tipo: 'fijo' },
        { numero: '44123456', tipo: 'fijo' },
      ]);
      assert.deepEqual(contacto.correos, ['jose@empresa.pe', 'ventas@empresa.pe']);
      // Al crear, la última modificación es la creación.
      assert.equal(contacto.auditoria.creado.por, NOMBRE);
      assert.equal(contacto.auditoria.actualizado.por, NOMBRE);
      assert.equal(contacto.auditoria.actualizado.en, contacto.auditoria.creado.en);
      assert.equal(contacto.auditoria.archivado, null);
    });

    it('si falla un paso, no guarda nada: ni el contacto ni sus teléfonos (transacción)', () => {
      // Simula una falla al guardar los correos, el último paso.
      entorno.db.exec(`
        CREATE TEMP TRIGGER falla_al_guardar_correos BEFORE INSERT ON correos
        BEGIN SELECT RAISE(ABORT, 'falla simulada'); END
      `);

      assert.throws(() => crear(), /falla simulada/);

      assert.equal(contar('contactos'), 0);
      assert.equal(contar('telefonos'), 0);
    });

    it('con datos inválidos no toca la base de datos', () => {
      errorDe(() => crear({ dni: '123' }));

      assert.equal(contar('contactos'), 0);
    });

    it('rechaza un DNI de un contacto activo e indica cuál es (C2)', () => {
      const existente = crear();

      const error = errorDe(() => crear({ nombres: 'Luis' }));

      assert.deepEqual(error.errores, [
        {
          campo: 'dni',
          mensaje: 'Ya existe un contacto con este DNI: José Álvarez Núñez.',
          contacto: { id: existente, nombre: 'José Álvarez Núñez', archivado: false },
        },
      ]);
      assert.equal(contar('contactos'), 1);
    });

    it('rechaza un DNI de un contacto archivado y lo dice (C2)', () => {
      const archivado = crear();
      archivar(archivado);

      const [error] = errorDe(() => crear({ nombres: 'Luis' })).errores;

      assert.equal(error.mensaje, 'Este DNI pertenece a un contacto archivado: José Álvarez Núñez.');
      assert.deepEqual(error.contacto, { id: archivado, nombre: 'José Álvarez Núñez', archivado: true });
    });

    it('si no encuentra quién tiene el DNI repetido, da un mensaje genérico (sin enlace)', () => {
      // El trigger inserta otro contacto con el mismo DNI justo antes del INSERT de la app. Como está
      // dentro de la misma transacción, desaparece al deshacerse, y al armar el mensaje ya no está.
      entorno.db.exec(`
        CREATE TEMP TRIGGER otro_proceso BEFORE INSERT ON contactos WHEN NEW.dni = '55555555'
        BEGIN
          INSERT INTO contactos (nombres, apellidos, dni, tipo, creado_por, actualizado_por)
          VALUES ('Otra', 'Persona', NEW.dni, 'cliente', NEW.creado_por, NEW.creado_por);
        END
      `);

      const errores = errorDe(() => crear({ dni: '55555555' })).errores;

      assert.deepEqual(errores, [{ campo: 'dni', mensaje: 'Ya existe un contacto con este DNI.' }]);
      assert.equal(contar('contactos'), 0);
    });
  });

  describe('páginas', () => {
    let agente;

    beforeEach(async () => {
      agente = request.agent(entorno.app);
      await iniciarSesion(agente);
    });

    const enviarNuevo = (datos) => enviarFormulario(agente, { pagina: '/contactos/nuevo', accion: '/contactos', datos });

    it('sin sesión, el formulario y el detalle redirigen al login', async () => {
      const id = crear();
      for (const ruta of ['/contactos/nuevo', `/contactos/${id}`]) {
        const respuesta = await request(entorno.app).get(ruta);
        assert.equal(respuesta.status, 302, ruta);
        assert.equal(respuesta.headers.location, '/login');
      }
    });

    it('el formulario tiene 5 filas de teléfonos y 5 de correos, el token CSRF y el script de filas', async () => {
      const respuesta = await agente.get('/contactos/nuevo');

      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.text.match(/name="telefonos"/g).length, 5);
      assert.equal(respuesta.text.match(/name="correos"/g).length, 5);
      assert.equal(respuesta.text.match(/type="radio" name="tipo"/g).length, 3);
      assert.match(respuesta.text, /name="_csrf" value="[0-9a-f]{64}"/);
      assert.match(respuesta.text, /<script src="\/js\/filas\.js" defer><\/script>/);
    });

    it('crea el contacto, redirige a su detalle y muestra el aviso una sola vez', async () => {
      const respuesta = await enviarNuevo(DATOS);

      assert.equal(respuesta.status, 303);
      assert.match(respuesta.headers.location, /^\/contactos\/\d+$/);

      const detalle = await agente.get(respuesta.headers.location);
      assert.equal(detalle.status, 200);
      for (const texto of [
        'José Álvarez Núñez',
        'Cliente y proveedor',
        '01234567',
        '987 654 321',
        '(01) 234 5678',
        '(044) 123456',
        'href="mailto:jose@empresa.pe"',
        'Contacto creado.',
      ]) {
        assert.ok(detalle.text.includes(texto), `el detalle debía mostrar ${texto}`);
      }

      const otraVez = await agente.get(respuesta.headers.location);
      assert.ok(!otraVez.text.includes('Contacto creado.'));
    });

    it('el aviso no se pierde si antes llegan una redirección o un fragmento de la búsqueda en vivo', async () => {
      const respuesta = await enviarNuevo(DATOS);

      // Peticiones que no dibujan la cabecera: no deben consumir el aviso.
      assert.equal((await agente.get('/')).status, 302);
      assert.ok(!(await agente.get('/contactos/resultados')).text.includes('Contacto creado.'));

      const detalle = await agente.get(respuesta.headers.location);
      assert.ok(detalle.text.includes('Contacto creado.'));
    });

    it('con errores vuelve a mostrar el formulario con lo escrito y cada mensaje junto a su campo', async () => {
      const respuesta = await enviarNuevo({
        nombres: 'Ana2',
        apellidos: 'Pérez',
        dni: '123',
        tipo: '',
        telefonos: ['987654321', '', '12345', '', ''],
        correos: ['', '', '', '', ''],
      });

      assert.equal(respuesta.status, 400);
      assert.equal(contar('contactos'), 0);
      const html = respuesta.text;
      // Lo escrito, tal cual.
      assert.match(html, /id="nombres" name="nombres" type="text" value="Ana2"/);
      assert.match(html, /id="dni" name="dni" type="text" value="123"/);
      assert.match(html, /id="telefono-3" name="telefonos" type="tel" value="12345"/);
      // Cada mensaje, enlazado a su campo.
      assert.match(html, /aria-invalid="true" aria-describedby="error-nombres"/);
      assert.match(html, /id="error-nombres">Los nombres solo pueden tener letras/);
      assert.match(html, /id="error-dni">El DNI debe tener exactamente 8 dígitos\./);
      assert.match(html, /id="error-tipo">Elige si es cliente, proveedor o ambos\./);
      assert.match(html, /id="error-telefono-3">El teléfono no es válido/);
      assert.match(html, /id="error-correos">Escribe al menos un correo\./);
      assert.doesNotMatch(html, /error-telefono-1/);
    });

    it('escapa lo escrito al volver a mostrarlo', async () => {
      const respuesta = await enviarNuevo({ ...DATOS, nombres: '<script>alert(1)</script>', dni: '"><b>x' });

      assert.equal(respuesta.status, 400);
      assert.ok(respuesta.text.includes('value="&lt;script&gt;alert(1)&lt;/script&gt;"'));
      assert.ok(respuesta.text.includes('value="&#34;&gt;&lt;b&gt;x"'));
      assert.doesNotMatch(respuesta.text, /<script>alert|"><b>x/);
    });

    it('con un DNI ya registrado, enlaza al contacto que lo tiene', async () => {
      const existente = crear();

      const respuesta = await enviarNuevo({ ...DATOS, nombres: 'Luis' });

      assert.equal(respuesta.status, 400);
      assert.match(respuesta.text, /Ya existe un contacto con este DNI: José Álvarez Núñez\./);
      assert.match(respuesta.text, new RegExp(`<a href="/contactos/${existente}">\\s*Ver el contacto\\s*</a>`));
    });

    it('con el DNI de un contacto archivado, lo dice y enlaza a ese contacto', async () => {
      const archivado = crear();
      archivar(archivado);

      const respuesta = await enviarNuevo({ ...DATOS, nombres: 'Luis' });

      assert.match(respuesta.text, /Este DNI pertenece a un contacto archivado: José Álvarez Núñez\./);
      assert.match(respuesta.text, new RegExp(`<a href="/contactos/${archivado}">\\s*Ver el contacto archivado\\s*</a>`));
    });

    it('sin token CSRF responde 403 y no crea nada', async () => {
      const respuesta = await agente.post('/contactos').type('form').send({ nombres: 'Ana' });

      assert.equal(respuesta.status, 403);
      assert.equal(contar('contactos'), 0);
    });

    for (const id of ['999', 'abc', '0', '01', '1.5', '-1', '99999999999999999999']) {
      it(`el detalle de /contactos/${id} responde 404`, async () => {
        crear();
        assert.equal((await agente.get(`/contactos/${id}`)).status, 404);
      });
    }

    it('el detalle escapa los datos guardados', async () => {
      // Datos cargados directamente en la base, sin pasar por la validación.
      const id = crear({ correos: ['jose@empresa.pe'] });
      entorno.db.prepare('UPDATE contactos SET nombres = ? WHERE id = ?').run('<b>Ana</b>', id);
      entorno.db.prepare('UPDATE correos SET correo = ? WHERE contacto_id = ?').run('x"onmouseover="alert(1)@y.pe', id);

      const detalle = await agente.get(`/contactos/${id}`);

      assert.ok(detalle.text.includes('&lt;b&gt;Ana&lt;/b&gt;'));
      assert.ok(detalle.text.includes('mailto:x&#34;onmouseover=&#34;alert(1)@y.pe'));
      assert.doesNotMatch(detalle.text, /<b>Ana|x"onmouseover/);
    });

    it('el detalle muestra la auditoría con las fechas en hora de Perú (A1)', async () => {
      const id = crear();
      entorno.db
        .prepare('UPDATE contactos SET creado_en = ?, actualizado_en = ? WHERE id = ?')
        .run('2026-11-26T15:30:00Z', '2026-11-27T02:05:00Z', id);
      archivar(id);
      entorno.db.prepare('UPDATE contactos SET archivado_en = ? WHERE id = ?').run('2026-12-01T13:00:00Z', id);

      const html = (await agente.get(`/contactos/${id}`)).text;

      // UTC-5: 15:30 → 10:30; 02:05 del 27 → 21:05 del 26; 13:00 → 08:00.
      assert.match(html, new RegExp(`<dt>Creado</dt>\\s*<dd>${NOMBRE} · 26 nov\\.\\s2026,\\s10:30</dd>`));
      assert.match(html, new RegExp(`<dt>Última modificación</dt>\\s*<dd>${NOMBRE} · 26 nov\\.\\s2026,\\s21:05</dd>`));
      assert.match(html, new RegExp(`<dt>Archivado</dt>\\s*<dd>${NOMBRE} · 1 dic\\.\\s2026,\\s08:00</dd>`));
      assert.match(html, /etiqueta--archivado">Archivado/);
    });

    it('el detalle muestra un avatar con las iniciales (C4)', async () => {
      const id = crear();

      const html = (await agente.get(`/contactos/${id}`)).text;

      assert.match(html, /<span class="avatar avatar--\d" aria-hidden="true">JÁ<\/span>/);
    });
  });
});
