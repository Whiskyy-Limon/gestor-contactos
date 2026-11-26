// Pruebas del listado con búsqueda, filtros y paginación (B1–B3), llamando directo al servicio.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { listarContactos } from '../src/services/busqueda.js';
import { crearContacto } from '../src/services/contactos.js';
import { CONTACTOS_POR_PAGINA } from '../src/validators/reglas.js';
import { crearEntornoDePrueba } from './helpers/app-de-prueba.js';

describe('listado y búsqueda de contactos (B1–B3)', () => {
  let entorno;
  let numero;

  beforeEach(async () => {
    entorno = await crearEntornoDePrueba();
    numero = 0;
  });

  afterEach(() => {
    entorno.db.close();
  });

  // Crea un contacto válido; DNI, teléfono y correo son distintos en cada llamada salvo que se indiquen.
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

  function archivar(id) {
    entorno.db
      .prepare("UPDATE contactos SET archivado_en = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), archivado_por = ? WHERE id = ?")
      .run(entorno.usuario.id, id);
  }

  const listar = (filtros = {}) => listarContactos(entorno.db, { q: '', tipo: '', estado: 'activos', pagina: 1, ...filtros });
  const ids = (filtros) => listar(filtros).contactos.map((contacto) => contacto.id);
  const apellidos = (filtros) => listar(filtros).contactos.map((contacto) => contacto.apellidos);

  describe('orden y estado', () => {
    it('lista solo los activos, ordenados por apellidos sin tildes (B2)', () => {
      for (const apellido of ['Zúñiga', 'Benítez', 'Álvarez', 'alvarado', 'Ñique']) {
        nuevo({ apellidos: apellido });
      }
      archivar(nuevo({ apellidos: 'Archivado' }));

      assert.deepEqual(apellidos(), ['alvarado', 'Álvarez', 'Benítez', 'Ñique', 'Zúñiga']);
    });

    it('con el mismo apellido, ordena por nombres', () => {
      nuevo({ nombres: 'Óscar', apellidos: 'Pérez' });
      nuevo({ nombres: 'Ana', apellidos: 'Perez' });

      assert.deepEqual(listar().contactos.map((c) => c.nombres), ['Ana', 'Óscar']);
    });

    it('el filtro "archivados" muestra solo los archivados (C5)', () => {
      nuevo({ apellidos: 'Activo' });
      const archivado = nuevo({ apellidos: 'Archivado' });
      archivar(archivado);

      assert.deepEqual(ids({ estado: 'archivados' }), [archivado]);
    });

    it('cada fila trae su primer teléfono y su primer correo', () => {
      nuevo({ telefonos: ['(044) 123456', '987654321'], correos: ['primero@empresa.pe', 'segundo@empresa.pe'] });

      const [contacto] = listar().contactos;

      assert.deepEqual(contacto.telefono, { numero: '44123456', tipo: 'fijo' });
      assert.equal(contacto.correo, 'primero@empresa.pe');
    });
  });

  describe('búsqueda por nombre (B2)', () => {
    beforeEach(() => {
      nuevo({ nombres: 'José', apellidos: 'Álvarez Muñoz' });
      nuevo({ nombres: 'Jose', apellidos: 'Pérez' });
      nuevo({ nombres: 'María', apellidos: 'López' });
    });

    const buscar = (q) => apellidos({ q });

    it('no distingue tildes ni mayúsculas, en ninguno de los dos lados', () => {
      assert.deepEqual(buscar('jose'), ['Álvarez Muñoz', 'Pérez']);
      assert.deepEqual(buscar('JOSÉ'), ['Álvarez Muñoz', 'Pérez']);
      assert.deepEqual(buscar('ALVAREZ'), ['Álvarez Muñoz']);
    });

    it('la ñ cuenta como n', () => {
      assert.deepEqual(buscar('munoz'), ['Álvarez Muñoz']);
      assert.deepEqual(buscar('muñoz'), ['Álvarez Muñoz']);
    });

    it('encuentra el comienzo de un nombre o apellido, pero no una parte del medio', () => {
      assert.deepEqual(buscar('lop'), ['López']);
      assert.deepEqual(buscar('l'), ['López']);
      assert.deepEqual(buscar('pez'), []);
      assert.deepEqual(buscar('aria'), []);
    });

    it('con varias palabras, cada una debe ser el comienzo de una palabra, en cualquier orden', () => {
      assert.deepEqual(buscar('perez jose'), ['Pérez']);
      assert.deepEqual(buscar('jose   pe'), ['Pérez']);
      assert.deepEqual(buscar('jo pe'), ['Pérez']);
      assert.deepEqual(buscar('jose lopez'), []);
    });
  });

  describe('"empieza con" en nombres y apellidos (B2)', () => {
    it('"ho" encuentra a Hortensia y a "de la Hoz", pero no a Ochoa ni a Rocha', () => {
      nuevo({ nombres: 'Hortensia', apellidos: 'Quispe' });
      nuevo({ nombres: 'Luis', apellidos: 'de la Hoz' });
      nuevo({ nombres: 'Ana', apellidos: 'Ochoa' });
      nuevo({ nombres: 'Rosa', apellidos: 'Rocha' });

      assert.deepEqual(apellidos({ q: 'ho' }), ['de la Hoz', 'Quispe']);
      assert.deepEqual(apellidos({ q: 'H' }), ['de la Hoz', 'Quispe']);
    });

    it('el guion y el apóstrofo separan palabras', () => {
      const rivasPlata = nuevo({ apellidos: 'Rivas-Plata' });
      const obrien = nuevo({ apellidos: "O'Brien" });

      for (const q of ['plata', 'rivas-plata', 'Rivas Plata', 'pla']) {
        assert.deepEqual(ids({ q }), [rivasPlata], q);
      }
      for (const q of ['brien', "o'brien", 'O’Brien']) {
        assert.deepEqual(ids({ q }), [obrien], q);
      }
      assert.deepEqual(ids({ q: 'ivas' }), []);
    });

    it('lo que no sirve para buscar ningún dato (solo un guion) no encuentra a nadie', () => {
      nuevo();

      assert.deepEqual(ids({ q: '-' }), []);
      assert.deepEqual(ids({ q: "'" }), []);
    });
  });

  describe('búsqueda por DNI, teléfono y correo (B1)', () => {
    it('encuentra el comienzo del DNI, con los ceros a la izquierda, pero no una parte del medio', () => {
      const conCero = nuevo({ dni: '01234567' });
      nuevo({ dni: '76543210' });

      assert.deepEqual(ids({ q: '0123' }), [conCero]);
      assert.deepEqual(ids({ q: '01234567' }), [conCero]);
      assert.deepEqual(ids({ q: '4567' }), []);
    });

    it('encuentra el comienzo de un teléfono escrito de cualquier forma', () => {
      const celular = nuevo({ telefonos: ['987654321'] });
      const provincia = nuevo({ telefonos: ['44123456'] });
      const lima = nuevo({ telefonos: ['012345678'] });

      for (const q of ['987654321', '987 654 321', '+51 987 654 321', '(+51) 987-654-321', '987 65', '+51 98']) {
        assert.deepEqual(ids({ q }), [celular], q);
      }
      for (const q of ['(044) 123456', '044 123', '44 1234', '(044']) {
        assert.deepEqual(ids({ q }), [provincia], q);
      }
      for (const q of ['(01) 234 5678', '01 234']) {
        assert.deepEqual(ids({ q }), [lima], q);
      }
    });

    it('no encuentra una parte del medio del teléfono: hay que escribirlo desde el comienzo', () => {
      nuevo({ telefonos: ['987654321'] });
      nuevo({ telefonos: ['44123456'] });
      nuevo({ telefonos: ['012345678'] });

      for (const q of ['654 32', '123456', '234 5678']) {
        assert.deepEqual(ids({ q }), [], q);
      }
    });

    it('encuentra cualquier parte del correo, sin distinguir mayúsculas', () => {
      const ventas = nuevo({ correos: ['ventas@proveedor.com.pe'] });
      nuevo({ correos: ['ana@empresa.pe'] });

      assert.deepEqual(ids({ q: 'ventas@' }), [ventas]);
      assert.deepEqual(ids({ q: 'PROVEEDOR.COM' }), [ventas]);
      assert.deepEqual(ids({ q: 'oveedor' }), [ventas]);
    });

    it('el correo se busca recién desde 3 caracteres', () => {
      const hotmail = nuevo({ nombres: 'Ana', apellidos: 'Pérez', correos: ['ventas@hotmail.com'] });
      const hugo = nuevo({ nombres: 'Hugo', apellidos: 'Díaz', correos: ['hugo@empresa.pe'] });

      // "h" y "ho": solo los nombres que empiezan así, aunque el otro correo tenga "h" y "ho".
      assert.deepEqual(ids({ q: 'h' }), [hugo]);
      assert.deepEqual(ids({ q: 'ho' }), []);
      // "hot": ya busca en los correos.
      assert.deepEqual(ids({ q: 'hot' }), [hotmail]);
    });

    it('% y _ se buscan como texto, no como comodines', () => {
      const conGuion = nuevo({ nombres: 'Ana', correos: ['ana_maria@empresa.pe'] });
      nuevo({ nombres: 'Ana', correos: ['anaxmaria@empresa.pe'] });

      assert.deepEqual(ids({ q: 'ana_maria' }), [conGuion]);
      assert.deepEqual(ids({ q: 'a_m' }), [conGuion]);
      // Como comodín, "_na" encontraría a "Ana" por el nombre.
      assert.deepEqual(ids({ q: '_na' }), []);
      assert.deepEqual(ids({ q: '%' }), []);
      assert.deepEqual(ids({ q: '%na' }), []);
      assert.deepEqual(ids({ q: '\\' }), []);
    });

    it('sin resultados devuelve una lista vacía', () => {
      nuevo();

      assert.deepEqual(listar({ q: 'nadie' }), { contactos: [], total: 0, pagina: 1, paginas: 1, desde: 0, hasta: 0 });
    });
  });

  describe('filtro por tipo (C6)', () => {
    let cliente;
    let proveedor;
    let ambos;

    beforeEach(() => {
      cliente = nuevo({ apellidos: 'Cliente', tipo: 'cliente' });
      proveedor = nuevo({ apellidos: 'Proveedor', tipo: 'proveedor' });
      ambos = nuevo({ apellidos: 'Ambos', tipo: 'ambos' });
    });

    it('"Clientes" incluye a los de tipo "ambos"', () => {
      assert.deepEqual(ids({ tipo: 'cliente' }), [ambos, cliente]);
    });

    it('"Proveedores" incluye a los de tipo "ambos"', () => {
      assert.deepEqual(ids({ tipo: 'proveedor' }), [ambos, proveedor]);
    });

    it('sin filtro aparecen todos', () => {
      assert.deepEqual(ids(), [ambos, cliente, proveedor]);
    });

    it('se combina con la búsqueda', () => {
      assert.deepEqual(ids({ tipo: 'proveedor', q: 'cliente' }), []);
      assert.deepEqual(ids({ tipo: 'cliente', q: 'cliente' }), [cliente]);
    });
  });

  describe(`paginación de ${CONTACTOS_POR_PAGINA} (B3)`, () => {
    let todos;

    beforeEach(() => {
      // 3 de los 45 (i = 0, 15 y 30) se apellidan Quispe.
      for (let i = 0; i < 45; i++) {
        nuevo({ apellidos: i % 15 === 0 ? 'Quispe' : `Pérez ${String.fromCharCode(97 + (i % 26))}` });
      }
      todos = ids({ pagina: 1 }).concat(ids({ pagina: 2 }), ids({ pagina: 3 }));
    });

    it('45 contactos se reparten en 3 páginas de 20, 20 y 5', () => {
      const paginas = [1, 2, 3].map((pagina) => listar({ pagina }));

      assert.deepEqual(
        paginas.map(({ contactos, pagina, paginas: totalPaginas, total, desde, hasta }) => [
          contactos.length,
          pagina,
          totalPaginas,
          total,
          desde,
          hasta,
        ]),
        [
          [20, 1, 3, 45, 1, 20],
          [20, 2, 3, 45, 21, 40],
          [5, 3, 3, 45, 41, 45],
        ],
      );
    });

    it('las páginas no se repiten ni se saltan contactos, y siguen el orden del listado', () => {
      assert.equal(new Set(todos).size, 45);
      const ordenEsperado = entorno.db
        .prepare('SELECT id FROM contactos ORDER BY apellidos_busqueda, nombres_busqueda, id')
        .pluck()
        .all();
      assert.deepEqual(todos, ordenEsperado);
    });

    it('una página que pasa de la última muestra la última', () => {
      const resultado = listar({ pagina: 99 });

      assert.equal(resultado.pagina, 3);
      assert.equal(resultado.contactos.length, 5);
    });

    it('la paginación respeta la búsqueda', () => {
      const resultado = listar({ q: 'quispe' });

      assert.equal(resultado.total, 3);
      assert.equal(resultado.paginas, 1);
      assert.equal(resultado.contactos.length, 3);
    });
  });
});
