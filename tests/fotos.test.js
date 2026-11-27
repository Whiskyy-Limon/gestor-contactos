// Pruebas de las fotos de los contactos (C4, F1–F4): validación por contenido, reprocesamiento,
// subida con CSRF en multipart, archivos en disco y la ruta que las sirve. Las imágenes se generan
// con sharp en cada prueba: no hay archivos de ejemplo.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import { archivarContacto, buscarContacto, crearContacto } from '../src/services/contactos.js';
import { ErrorDeFoto, procesarFoto } from '../src/services/fotos.js';
import { MAXIMO_BYTES_FOTO, MAXIMO_PIXELES_FOTO } from '../src/validators/reglas.js';
import { NOMBRE, crearEntornoDePrueba, iniciarSesion, tokenCsrf } from './helpers/app-de-prueba.js';

const NOMBRE_DE_FOTO = /^[0-9a-f]{32}\.webp$/;

// Imagen de un solo color generada por sharp. `formato`: 'jpeg', 'png', 'webp' o 'gif'.
function imagen(formato, { ancho = 1000, alto = 800, exif = null, orientacion = null } = {}) {
  let generada = sharp({ create: { width: ancho, height: alto, channels: 3, background: '#3366cc' } });
  if (exif) generada = generada.withExif(exif);
  if (orientacion) generada = generada.withMetadata({ orientation: orientacion });
  return generada.toFormat(formato).toBuffer();
}

async function errorDeFoto(promesa) {
  try {
    await promesa;
  } catch (error) {
    assert.ok(error instanceof ErrorDeFoto, `se esperaba ErrorDeFoto y llegó ${error}`);
    return error;
  }
  assert.fail('se esperaba un ErrorDeFoto');
}

describe('fotos de los contactos (C4, F1–F4)', () => {
  describe('procesarFoto: validación por contenido y reprocesamiento', () => {
    it('acepta JPG, PNG y WebP y los convierte a WebP', async () => {
      for (const formato of ['jpeg', 'png', 'webp']) {
        const salida = await procesarFoto(await imagen(formato));
        assert.equal((await sharp(salida).metadata()).format, 'webp', formato);
      }
    });

    it('lleva el lado mayor a 512 px sin deformarla (F3)', async () => {
      const { width, height } = await sharp(await procesarFoto(await imagen('jpeg', { ancho: 1000, alto: 800 }))).metadata();

      assert.deepEqual([width, height], [512, 410]);
    });

    it('no agranda una imagen chica', async () => {
      const { width, height } = await sharp(await procesarFoto(await imagen('png', { ancho: 300, alto: 200 }))).metadata();

      assert.deepEqual([width, height], [300, 200]);
    });

    it('quita los metadatos (EXIF) de la foto (F3)', async () => {
      const conExif = await imagen('jpeg', { exif: { IFD0: { Artist: 'Ana', ImageDescription: 'Casa de Ana, Lima' } } });
      assert.ok((await sharp(conExif).metadata()).exif.includes('Casa de Ana'), 'la foto de prueba debe traer EXIF');

      const metadatos = await sharp(await procesarFoto(conExif)).metadata();

      assert.equal(metadatos.exif, undefined);
      assert.equal(metadatos.orientation, undefined);
    });

    it('endereza la foto según la orientación de la cámara antes de quitar los metadatos', async () => {
      // Orientación 6: la cámara la guardó acostada; se ve parada (800 × 1000).
      const acostada = await imagen('jpeg', { ancho: 1000, alto: 800, orientacion: 6 });

      const { width, height } = await sharp(await procesarFoto(acostada)).metadata();

      assert.deepEqual([width, height], [410, 512]);
    });

    it('rechaza lo que no es JPG, PNG ni WebP por su contenido, se llame como se llame (F2)', async () => {
      const noAceptados = {
        texto: Buffer.from('esto no es una imagen'),
        gif: await imagen('gif', { ancho: 50, alto: 50 }),
        svg: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'),
        'JPG dañado': Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), crypto.randomBytes(2000)]),
        vacío: Buffer.alloc(0),
      };
      for (const [descripcion, contenido] of Object.entries(noAceptados)) {
        const error = await errorDeFoto(procesarFoto(contenido));
        assert.equal(error.message, 'El archivo no es una imagen JPG, PNG o WebP válida.', descripcion);
      }
    });

    it(`rechaza una imagen de más de ${MAXIMO_PIXELES_FOTO / 1e6} megapíxeles aunque pese poco (F4)`, async () => {
      const bomba = await imagen('png', { ancho: 5001, alto: 5000 });
      assert.ok(bomba.length < MAXIMO_BYTES_FOTO, 'la imagen "bomba" debe pesar menos de 2 MB');

      const error = await errorDeFoto(procesarFoto(bomba));

      assert.match(error.message, /como máximo 25 megapíxeles/);
    });

    it('acepta una imagen de exactamente 25 megapíxeles', async () => {
      const { width } = await sharp(await procesarFoto(await imagen('png', { ancho: 5000, alto: 5000 }))).metadata();

      assert.equal(width, 512);
    });
  });

  describe('páginas', () => {
    let entorno;
    let agente;
    let contactoId;

    beforeEach(async () => {
      entorno = await crearEntornoDePrueba();
      agente = request.agent(entorno.app);
      await iniciarSesion(agente);
      contactoId = crearContacto(
        entorno.db,
        {
          nombres: 'José',
          apellidos: 'Álvarez',
          dni: '01234567',
          tipo: 'cliente',
          telefonos: ['987654321'],
          correos: ['jose@empresa.pe'],
        },
        entorno.usuario.id,
      );
    });

    afterEach(() => {
      entorno.db.close();
    });

    const archivos = () => fs.readdirSync(entorno.carpetaFotos);
    const fotoGuardada = () => buscarContacto(entorno.db, contactoId).foto;
    const detalle = async () => (await agente.get(`/contactos/${contactoId}`)).text;

    // Sube una foto como el formulario del detalle: primero el campo _csrf, después el archivo.
    async function subir(contenido, { nombre = 'foto.jpg', tipo = 'image/jpeg', token, a = `/contactos/${contactoId}/foto`, con = agente } = {}) {
      const tokenDelFormulario = token === undefined ? tokenCsrf((await con.get(`/contactos/${contactoId}`)).text) : token;
      const envio = con.post(a);
      if (tokenDelFormulario !== null) envio.field('_csrf', tokenDelFormulario);
      return envio.attach('foto', contenido, { filename: nombre, contentType: tipo });
    }

    it('el detalle tiene el formulario de la foto (multipart, con token)', async () => {
      const html = await detalle();

      assert.ok(html.includes(`<form method="post" action="/contactos/${contactoId}/foto" enctype="multipart/form-data"`));
      assert.match(html, /enctype="multipart\/form-data"[^>]*>\s*<input type="hidden" name="_csrf" value="[0-9a-f]{64}">/);
      assert.match(html, /<input id="foto" name="foto" type="file" accept="image\/jpeg,image\/png,image\/webp"/);
      assert.ok(html.includes('>Subir foto</button>'));
    });

    describe('menú de la foto en la ficha (C4)', () => {
      it('en un contacto activo el avatar abre el menú, que viene cerrado y sin error', async () => {
        const html = await detalle();

        assert.match(html, /<details class="foto-menu" data-foto-menu data-maximo-bytes="\d+" data-mensaje-peso="[^"]+">\s*<summary class="foto-menu__boton">/);
        assert.match(html, /<summary class="foto-menu__boton">\s*<span class="avatar avatar--\d avatar--grande" aria-hidden="true">JÁ<\/span>/);
        assert.ok(html.includes('<span class="visualmente-oculto">Subir una foto</span>'));
        assert.match(html, /<p class="alerta" role="alert" data-foto-error id="error-foto" hidden><\/p>/);
        assert.ok(html.includes('<p class="visualmente-oculto" role="status" data-foto-estado></p>'));
        assert.ok(html.includes('<script type="module" src="/js/foto.js"></script>'));
      });

      it('F1: el navegador recibe el mismo peso máximo y el mismo mensaje que usa el servidor', async () => {
        const [, maximo, mensaje] = (await detalle()).match(/data-maximo-bytes="(\d+)" data-mensaje-peso="([^"]+)"/);

        assert.equal(Number(maximo), MAXIMO_BYTES_FOTO);
        assert.equal(mensaje, 'La foto pesa más de 2 MB.');
      });

      it('sin JavaScript trae el campo del archivo y su botón; lo que usa el script viene oculto', async () => {
        const html = await detalle();

        assert.ok(html.includes('<label for="foto" data-foto-sin-js>Imagen JPG, PNG o WebP de hasta 2&nbsp;MB</label>'));
        assert.match(html, /<input id="foto" name="foto" type="file"[^>]* required data-foto-sin-js data-foto-archivo\s*>/);
        assert.ok(html.includes('<button type="submit" class="boton boton--secundario boton--ancho" data-foto-sin-js>Subir foto</button>'));
        assert.match(html, /<button type="button" class="foto-menu__opcion" aria-describedby="error-foto" data-foto-con-js data-foto-elegir hidden>[\s\S]*?<span>Subir foto<\/span>/);
        assert.ok(html.includes('<p class="foto-menu__nota" data-foto-con-js hidden>JPG, PNG o WebP de hasta 2&nbsp;MB.</p>'));
      });

      it('sin foto ofrece solo subirla; con foto, cambiarla o quitarla (en rojo)', async () => {
        assert.ok(!(await detalle()).includes('/foto/quitar'));

        await subir(await imagen('jpeg'));
        const html = await detalle();

        assert.ok(html.includes('<span class="visualmente-oculto">Cambiar o quitar la foto</span>'));
        assert.match(html, /data-foto-elegir hidden>[\s\S]*?<span>Cambiar foto<\/span>/);
        assert.match(
          html,
          new RegExp(`<a href="/contactos/${contactoId}/foto/quitar" class="foto-menu__opcion foto-menu__opcion--peligro">[\\s\\S]*?<span>Quitar foto</span>`),
        );
      });

      it('F5: "Quitar foto" lleva a la confirmación; el detalle no la quita directamente', async () => {
        await subir(await imagen('jpeg'));

        const html = await detalle();

        assert.ok(!html.includes(`action="/contactos/${contactoId}/foto/quitar"`));
        assert.ok(html.includes(`<a href="/contactos/${contactoId}/foto/quitar" class="foto-menu__opcion foto-menu__opcion--peligro">`));
      });

      it('si la foto no se pudo subir, el menú viene abierto con el error junto al campo', async () => {
        const respuesta = await subir(Buffer.from('no es una imagen'));

        assert.equal(respuesta.status, 400);
        assert.match(respuesta.text, /<details class="foto-menu" data-foto-menu [^>]* open>/);
        assert.match(respuesta.text, /<p class="alerta" role="alert" data-foto-error id="error-foto">El archivo no es una imagen/);
        assert.match(respuesta.text, /<input id="foto"[^>]* aria-invalid="true" aria-describedby="error-foto">/);
      });

      it('un contacto archivado muestra su avatar, sin el menú ni el script (C5)', async () => {
        archivarContacto(entorno.db, contactoId, entorno.usuario.id);

        const html = await detalle();

        assert.match(html, /<span class="avatar avatar--\d avatar--grande" aria-hidden="true">JÁ<\/span>/);
        assert.ok(!html.includes('data-foto-menu'));
        assert.ok(!html.includes('foto-menu__boton'));
        assert.ok(!html.includes('/js/foto.js'));
      });
    });

    it('sube la foto: la guarda reprocesada con un nombre aleatorio y la muestra en el detalle y el listado', async () => {
      const respuesta = await subir(await imagen('jpeg'));

      assert.equal(respuesta.status, 303);
      assert.equal(respuesta.headers.location, `/contactos/${contactoId}`);
      const foto = fotoGuardada();
      assert.match(foto, NOMBRE_DE_FOTO);
      assert.deepEqual(archivos(), [foto]);
      const metadatos = await sharp(path.join(entorno.carpetaFotos, foto)).metadata();
      assert.equal(metadatos.format, 'webp');
      assert.equal(metadatos.width, 512);

      const html = await detalle();
      assert.ok(html.includes('Foto actualizada.'));
      assert.ok(html.includes(`<img class="avatar avatar--foto avatar--grande" src="/fotos/${foto}" alt="">`));
      assert.ok(html.includes('>Cambiar foto</button>'));
      assert.ok((await agente.get('/contactos')).text.includes(`<img class="avatar avatar--foto avatar--chico" src="/fotos/${foto}" alt="">`));
    });

    it('cambiar la foto cuenta como modificación (A1) y sube la versión (C7)', async () => {
      await subir(await imagen('jpeg'));

      const contacto = buscarContacto(entorno.db, contactoId);
      assert.equal(contacto.version, 2);
      assert.equal(contacto.auditoria.actualizado.por, NOMBRE);
    });

    it('cambiar la foto borra el archivo de la anterior', async () => {
      await subir(await imagen('jpeg'));
      const primera = fotoGuardada();

      await subir(await imagen('png'));

      assert.notEqual(fotoGuardada(), primera);
      assert.deepEqual(archivos(), [fotoGuardada()]);
    });

    describe('quitar la foto (C4, F5)', () => {
      const confirmacion = () => agente.get(`/contactos/${contactoId}/foto/quitar`);

      it('F5: la confirmación muestra la foto, avisa que se borra para siempre y ofrece cancelar', async () => {
        await subir(await imagen('jpeg'));
        const foto = fotoGuardada();

        const respuesta = await confirmacion();

        assert.equal(respuesta.status, 200);
        const html = respuesta.text;
        assert.match(html, /<h1>¿Quitar la foto de José Álvarez\?<\/h1>/);
        assert.ok(html.includes(`<img class="avatar avatar--foto avatar--grande" src="/fotos/${foto}" alt="">`));
        assert.match(html, /La foto se borra para siempre: no se puede recuperar\./);
        assert.match(
          html,
          new RegExp(`<form method="post" action="/contactos/${contactoId}/foto/quitar" class="acciones">\\s*<input type="hidden" name="_csrf" value="[0-9a-f]{64}">`),
        );
        assert.ok(html.includes('<button type="submit" class="boton boton--peligro">Quitar foto</button>'));
        assert.ok(html.includes(`<a href="/contactos/${contactoId}" class="boton boton--secundario">Cancelar</a>`));
      });

      it('F5: abrir la confirmación (o cancelar) no quita nada', async () => {
        await subir(await imagen('jpeg'));
        const foto = fotoGuardada();
        const version = buscarContacto(entorno.db, contactoId).version;

        await confirmacion();
        await detalle(); // "Cancelar" es un enlace al detalle

        assert.equal(fotoGuardada(), foto);
        assert.deepEqual(archivos(), [foto]);
        assert.equal(buscarContacto(entorno.db, contactoId).version, version);
      });

      it('al confirmar, borra su archivo y vuelve a las iniciales', async () => {
        await subir(await imagen('jpeg'));

        const respuesta = await agente
          .post(`/contactos/${contactoId}/foto/quitar`)
          .type('form')
          .send({ _csrf: tokenCsrf((await confirmacion()).text) });

        assert.equal(respuesta.status, 303);
        assert.equal(respuesta.headers.location, `/contactos/${contactoId}`);
        assert.equal(fotoGuardada(), null);
        assert.deepEqual(archivos(), []);
        const html = await detalle();
        assert.ok(html.includes('Foto quitada.'));
        assert.match(html, /<span class="avatar avatar--\d avatar--grande" aria-hidden="true">JÁ<\/span>/);
      });

      it('sin foto, la confirmación vuelve al detalle con un aviso', async () => {
        const respuesta = await confirmacion();

        assert.equal(respuesta.status, 302);
        assert.equal(respuesta.headers.location, `/contactos/${contactoId}`);
        assert.ok((await detalle()).includes('Este contacto no tiene foto.'));
      });

      it('con un contacto archivado vuelve al detalle con un aviso y no quita la foto (C5)', async () => {
        await subir(await imagen('jpeg'));
        const foto = fotoGuardada();
        archivarContacto(entorno.db, contactoId, entorno.usuario.id);

        const respuesta = await confirmacion();

        assert.equal(respuesta.status, 302);
        assert.equal(respuesta.headers.location, `/contactos/${contactoId}`);
        assert.ok((await detalle()).includes('restáuralo para cambiar la foto'));
        assert.equal(fotoGuardada(), foto);
      });

      it('con un contacto que no existe o un id inválido responde 404', async () => {
        for (const id of ['999', 'abc', '0']) {
          assert.equal((await agente.get(`/contactos/${id}/foto/quitar`)).status, 404, id);
        }
      });

      it('sin sesión, la confirmación redirige al login', async () => {
        const respuesta = await request(entorno.app).get(`/contactos/${contactoId}/foto/quitar`);

        assert.equal(respuesta.status, 302);
        assert.equal(respuesta.headers.location, '/login');
      });
    });

    it('un PNG llamado .jpg y enviado como image/jpeg se acepta: cuenta el contenido (F2)', async () => {
      const respuesta = await subir(await imagen('png'), { nombre: 'foto.jpg', tipo: 'image/jpeg' });

      assert.equal(respuesta.status, 303);
      assert.match(fotoGuardada(), NOMBRE_DE_FOTO);
    });

    it('un archivo que no es una imagen se rechaza junto al formulario, aunque se llame .jpg (F2)', async () => {
      const respuesta = await subir(Buffer.from('MZ ejecutable disfrazado'), { nombre: 'foto.jpg', tipo: 'image/jpeg' });

      assert.equal(respuesta.status, 400);
      assert.match(respuesta.text, /id="error-foto">El archivo no es una imagen JPG, PNG o WebP válida\./);
      assert.deepEqual(archivos(), []);
      assert.equal(fotoGuardada(), null);
    });

    it('una foto de más de 2 MB se rechaza con 413 (F1)', async () => {
      const grande = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(MAXIMO_BYTES_FOTO - 2)]);

      const respuesta = await subir(grande);

      assert.equal(respuesta.status, 413);
      assert.match(respuesta.text, /id="error-foto">La foto pesa más de 2 MB\./);
      assert.deepEqual(archivos(), []);
    });

    it('una imagen de más de 25 megapíxeles se rechaza junto al formulario (F4)', async () => {
      const respuesta = await subir(await imagen('png', { ancho: 5001, alto: 5000 }), { nombre: 'bomba.png', tipo: 'image/png' });

      assert.equal(respuesta.status, 400);
      assert.match(respuesta.text, /como máximo 25 megapíxeles/);
      assert.deepEqual(archivos(), []);
    });

    it('sin elegir un archivo, lo pide', async () => {
      const respuesta = await agente.post(`/contactos/${contactoId}/foto`).field('_csrf', tokenCsrf(await detalle()));

      assert.equal(respuesta.status, 400);
      assert.match(respuesta.text, /id="error-foto">Elige una foto\./);
    });

    describe('multipart mal formado', () => {
      // Responde 400 (es un problema del envío, no del servidor) y no lo registra como error inesperado.
      const MENSAJE_ENVIO_INVALIDO = /El envío de la foto no es válido\. Vuelve a intentarlo\./;

      it('sin boundary responde 400, no 500', async () => {
        const respuesta = await agente
          .post(`/contactos/${contactoId}/foto`)
          .set('Content-Type', 'multipart/form-data')
          .send('cualquier cosa');

        assert.equal(respuesta.status, 400);
        assert.match(respuesta.text, MENSAJE_ENVIO_INVALIDO);
        assert.deepEqual(entorno.erroresRegistrados, []);
        assert.deepEqual(archivos(), []);
      });

      it('con el cuerpo cortado (sin el boundary final) responde 400, no 500', async () => {
        const token = tokenCsrf(await detalle());
        const cuerpo = [
          '--LIMITE',
          'Content-Disposition: form-data; name="_csrf"',
          '',
          token,
          '--LIMITE',
          'Content-Disposition: form-data; name="foto"; filename="foto.jpg"',
          'Content-Type: image/jpeg',
          '',
          'contenido cortado',
        ].join('\r\n');

        const respuesta = await agente
          .post(`/contactos/${contactoId}/foto`)
          .set('Content-Type', 'multipart/form-data; boundary=LIMITE')
          .send(cuerpo);

        assert.equal(respuesta.status, 400);
        assert.match(respuesta.text, MENSAJE_ENVIO_INVALIDO);
        assert.deepEqual(entorno.erroresRegistrados, []);
        assert.deepEqual(archivos(), []);
        assert.equal(fotoGuardada(), null);
      });
    });

    describe('CSRF en el formulario multipart', () => {
      it('sin token responde 403 y no se escribe ningún archivo', async () => {
        const respuesta = await subir(await imagen('jpeg'), { token: null });

        assert.equal(respuesta.status, 403);
        assert.deepEqual(archivos(), []);
        assert.equal(fotoGuardada(), null);
      });

      it('con el token de otra sesión responde 403', async () => {
        const otraSesion = request.agent(entorno.app);
        await iniciarSesion(otraSesion);
        const tokenAjeno = tokenCsrf((await otraSesion.get(`/contactos/${contactoId}`)).text);

        const respuesta = await subir(await imagen('jpeg'), { token: tokenAjeno });

        assert.equal(respuesta.status, 403);
        assert.deepEqual(archivos(), []);
      });

      it('sin token, tampoco pasa enviada como formulario normal', async () => {
        const respuesta = await agente.post(`/contactos/${contactoId}/foto`).type('form').send({ foto: 'x' });

        assert.equal(respuesta.status, 403);
      });

      it('la excepción es solo para esta ruta: un multipart sin token a otra ruta sigue dando 403', async () => {
        for (const ruta of [`/contactos/${contactoId}/archivar`, `/contactos/${contactoId}/foto/quitar`, '/contactos', '/logout']) {
          const respuesta = await subir(await imagen('jpeg', { ancho: 10, alto: 10 }), { token: null, a: ruta });
          assert.equal(respuesta.status, 403, ruta);
        }
        assert.equal(buscarContacto(entorno.db, contactoId).archivado, false);
      });
    });

    it('si falla la base de datos, se borra el archivo nuevo y queda la foto anterior (F3)', async () => {
      await subir(await imagen('jpeg'));
      const anterior = fotoGuardada();
      entorno.db.exec(`
        CREATE TEMP TRIGGER falla_al_cambiar_foto BEFORE UPDATE OF foto ON contactos
        BEGIN SELECT RAISE(ABORT, 'falla simulada'); END
      `);

      const respuesta = await subir(await imagen('png'));

      assert.equal(respuesta.status, 500);
      assert.equal(fotoGuardada(), anterior);
      assert.deepEqual(archivos(), [anterior]);
    });

    it('un contacto archivado no cambia de foto (C5), y su detalle no ofrece el formulario', async () => {
      const token = tokenCsrf(await detalle());
      archivarContacto(entorno.db, contactoId, entorno.usuario.id);

      const respuesta = await subir(await imagen('jpeg'), { token });

      assert.equal(respuesta.status, 303);
      assert.deepEqual(archivos(), []);
      const html = await detalle();
      assert.ok(html.includes('restáuralo para cambiar la foto'));
      assert.ok(!html.includes('enctype="multipart/form-data"'));
    });

    it('sin sesión no se recibe la foto: redirige al login', async () => {
      const respuesta = await request(entorno.app)
        .post(`/contactos/${contactoId}/foto`)
        .attach('foto', await imagen('jpeg'), { filename: 'foto.jpg', contentType: 'image/jpeg' });

      assert.equal(respuesta.status, 303);
      assert.equal(respuesta.headers.location, '/login');
      assert.deepEqual(archivos(), []);
    });

    it('con un contacto que no existe responde 404', async () => {
      const respuesta = await subir(await imagen('jpeg'), { a: '/contactos/999/foto' });

      assert.equal(respuesta.status, 404);
      assert.deepEqual(archivos(), []);
    });

    describe('ruta que sirve las fotos (F3)', () => {
      let foto;

      beforeEach(async () => {
        await subir(await imagen('jpeg'));
        foto = fotoGuardada();
      });

      it('con sesión la sirve como image/webp, sin caché y con nosniff', async () => {
        const respuesta = await agente.get(`/fotos/${foto}`).buffer(true);

        assert.equal(respuesta.status, 200);
        assert.equal(respuesta.headers['content-type'], 'image/webp');
        assert.equal(respuesta.headers['cache-control'], 'no-store');
        assert.equal(respuesta.headers['x-content-type-options'], 'nosniff');
        assert.equal((await sharp(respuesta.body).metadata()).format, 'webp');
      });

      it('sin sesión redirige al login', async () => {
        const respuesta = await request(entorno.app).get(`/fotos/${foto}`);

        assert.equal(respuesta.status, 302);
        assert.equal(respuesta.headers.location, '/login');
      });

      it('un nombre que no tiene el formato de una foto responde 404 (también "../")', async () => {
        for (const nombre of [
          '..%2F..%2Fpackage.json',
          '..%2Fcontactos.db',
          '%2e%2e%2f%2e%2e%2f.env',
          foto.toUpperCase(),
          foto.replace('.webp', '.png'),
          `${foto}.webp`,
          'abc.webp',
        ]) {
          assert.equal((await agente.get(`/fotos/${nombre}`)).status, 404, nombre);
        }
      });

      it('un nombre válido que no pertenece a ningún contacto responde 404, aunque el archivo exista', async () => {
        const suelta = `${'a'.repeat(32)}.webp`;
        fs.copyFileSync(path.join(entorno.carpetaFotos, foto), path.join(entorno.carpetaFotos, suelta));

        assert.equal((await agente.get(`/fotos/${suelta}`)).status, 404);
      });
    });
  });
});
