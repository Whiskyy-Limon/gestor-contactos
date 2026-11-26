// Listado de contactos con búsqueda, filtros y paginación (B1–B3).
import { CONTACTOS_POR_PAGINA, MAXIMO_PALABRAS_BUSQUEDA } from '../validators/reglas.js';
import { normalizarTelefono } from '../validators/telefonos.js';

// B2: texto sin tildes ni diéresis, en minúsculas y con la ñ como n ("Núñez" → "nunez").
//
// Se aplica a lo que se escribe en el buscador. Las columnas nombres_busqueda y apellidos_busqueda
// (migración 003) hacen lo mismo con los nombres guardados; tests/db.test.js verifica que ambas
// den el mismo resultado para cada letra que admite C1.
//
// NFD separa cada letra de su tilde ("á" → "a" + tilde combinable) y luego se quitan las marcas.
export function normalizarParaBusqueda(texto) {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

// Patrón de LIKE que encuentra `texto` en cualquier parte. %, _ y \ se escapan (con ESCAPE '\'):
// así "ana_maria" busca un guion bajo de verdad y no "cualquier carácter", y "%" no lo encuentra todo.
function contiene(texto) {
  return `%${texto.replace(/[\\%_]/g, '\\$&')}%`;
}

// Lo escrito parece un DNI o un teléfono: dígitos con espacios, guiones, paréntesis o "+".
const PARECE_NUMERO = /^[\d\s()+-]*\d[\d\s()+-]*$/;

// Dígitos para buscar entre los teléfonos guardados (B1: cualquier formato de T1–T4).
// Un teléfono completo se normaliza como al guardarlo; uno incompleto se busca como parte del
// número, sin el +51 (T2) ni el 0 de provincia (T4), que no se guardan.
function digitosDeTelefono(texto) {
  const telefono = normalizarTelefono(texto);
  if (telefono.valido) {
    return telefono.numero;
  }
  let digitos = texto.replace(/[\s()-]/g, '');
  if (digitos.startsWith('+51')) {
    digitos = digitos.slice(3);
  }
  digitos = digitos.replace(/\D/g, '');
  if (digitos.startsWith('0') && !digitos.startsWith('01')) {
    digitos = digitos.slice(1);
  }
  return digitos;
}

// Condición SQL de la búsqueda (B1, B2) y sus parámetros, o null si no se escribió nada.
// Un contacto aparece si coincide por nombre, por correo, por DNI o por teléfono.
// El SQL se arma solo con fragmentos fijos de este archivo; lo escrito siempre va como parámetro.
function condicionDeBusqueda(texto) {
  if (texto === '') {
    return null;
  }
  const alternativas = [];
  const parametros = [];

  // B2: cada palabra debe aparecer en los nombres o en los apellidos, en cualquier orden.
  const palabras = normalizarParaBusqueda(texto).split(/\s+/).filter(Boolean).slice(0, MAXIMO_PALABRAS_BUSQUEDA);
  if (palabras.length > 0) {
    alternativas.push(
      palabras.map(() => `(c.nombres_busqueda || ' ' || c.apellidos_busqueda) LIKE ? ESCAPE '\\'`).join(' AND '),
    );
    parametros.push(...palabras.map(contiene));
  }

  // Correo: cualquier parte (se guardan en minúsculas).
  alternativas.push(
    `EXISTS (SELECT 1 FROM correos e WHERE e.contacto_id = c.id AND e.correo LIKE ? ESCAPE '\\')`,
  );
  parametros.push(contiene(texto.toLowerCase()));

  // DNI y teléfono: solo si lo escrito parece un número.
  if (PARECE_NUMERO.test(texto)) {
    alternativas.push(`c.dni LIKE ? ESCAPE '\\'`);
    parametros.push(contiene(texto.replace(/\D/g, '')));

    const digitos = digitosDeTelefono(texto);
    if (digitos !== '') {
      alternativas.push(
        `EXISTS (SELECT 1 FROM telefonos t WHERE t.contacto_id = c.id AND t.numero LIKE ? ESCAPE '\\')`,
      );
      parametros.push(contiene(digitos));
    }
  }

  return { sql: alternativas.map((alternativa) => `(${alternativa})`).join(' OR '), parametros };
}

// Una página del listado (B1–B3). `filtros` viene de esquemaFiltrosListado:
//   q        texto buscado ('' = sin búsqueda)
//   tipo     '', 'cliente' o 'proveedor' (C6: los de tipo 'ambos' aparecen en los dos filtros)
//   estado   'activos' o 'archivados' (C5)
//   pagina   número de página; si pasa de la última, se devuelve la última
// Devuelve { contactos, total, pagina, paginas, desde, hasta }.
export function listarContactos(db, { q = '', tipo = '', estado = 'activos', pagina = 1 } = {}) {
  const condiciones = [estado === 'archivados' ? 'c.archivado_en IS NOT NULL' : 'c.archivado_en IS NULL'];
  const parametros = [];

  if (tipo !== '') {
    condiciones.push(`c.tipo IN (?, 'ambos')`);
    parametros.push(tipo);
  }
  const busqueda = condicionDeBusqueda(q);
  if (busqueda) {
    condiciones.push(`(${busqueda.sql})`);
    parametros.push(...busqueda.parametros);
  }
  const donde = condiciones.join(' AND ');

  const total = db.prepare(`SELECT count(*) FROM contactos c WHERE ${donde}`).pluck().get(...parametros);
  const paginas = Math.max(1, Math.ceil(total / CONTACTOS_POR_PAGINA));
  const paginaActual = Math.min(pagina, paginas);
  const saltar = (paginaActual - 1) * CONTACTOS_POR_PAGINA;

  // B2, B3: ordenados por apellidos y nombres sin tildes; el id desempata, así cada contacto queda
  // siempre en la misma página. Con cada contacto, su primer teléfono y su primer correo.
  const filas = db
    .prepare(
      `SELECT c.id, c.nombres, c.apellidos, c.dni, c.tipo, c.foto,
              t.numero AS telefono_numero, t.tipo AS telefono_tipo,
              (SELECT e.correo FROM correos e WHERE e.contacto_id = c.id ORDER BY e.id LIMIT 1) AS correo
       FROM contactos c
       LEFT JOIN telefonos t ON t.id = (SELECT min(t2.id) FROM telefonos t2 WHERE t2.contacto_id = c.id)
       WHERE ${donde}
       ORDER BY c.apellidos_busqueda, c.nombres_busqueda, c.id
       LIMIT ? OFFSET ?`,
    )
    .all(...parametros, CONTACTOS_POR_PAGINA, saltar);

  return {
    contactos: filas.map((fila) => ({
      id: fila.id,
      nombres: fila.nombres,
      apellidos: fila.apellidos,
      dni: fila.dni,
      tipo: fila.tipo,
      foto: fila.foto,
      telefono: fila.telefono_numero ? { numero: fila.telefono_numero, tipo: fila.telefono_tipo } : null,
      correo: fila.correo,
    })),
    total,
    pagina: paginaActual,
    paginas,
    desde: total === 0 ? 0 : saltar + 1,
    hasta: saltar + filas.length,
  };
}
