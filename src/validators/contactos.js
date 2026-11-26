import { z } from 'zod';
import { esquemaCorreo } from './correo.js';
import {
  LARGO_DNI,
  LETRAS_NO_ASCII_NOMBRE,
  MAXIMO_CARACTERES_NOMBRE,
  MAXIMO_CORREOS_POR_CONTACTO,
  MAXIMO_TELEFONOS_POR_CONTACTO,
  MINIMO_CARACTERES_NOMBRE,
  TIPOS_CONTACTO,
} from './reglas.js';
import { normalizarTelefono } from './telefonos.js';

// C1: letras del español, espacios, apóstrofo y guion.
const PATRON_NOMBRE = new RegExp(`^[A-Za-z${LETRAS_NO_ASCII_NOMBRE}' -]+$`, 'u');

// C1: antes de validar, el nombre pasa a la forma NFC (una "é" escrita como "e" + tilde
// combinable queda como una sola letra), el apóstrofo tipográfico (’) pasa a ser ', y se quitan
// los espacios de los extremos y los dobles.
function normalizarNombre(texto) {
  return texto.normalize('NFC').replaceAll('’', "'").trim().replace(/\s+/g, ' ');
}

// campo: 'nombres' o 'apellidos'.
function campoNombre(campo) {
  return z
    .string({ error: `Escribe los ${campo}.` })
    .transform(normalizarNombre)
    .pipe(
      z
        .string()
        .min(1, { error: `Escribe los ${campo}.` })
        .min(MINIMO_CARACTERES_NOMBRE, {
          error: `Los ${campo} deben tener al menos ${MINIMO_CARACTERES_NOMBRE} caracteres.`,
        })
        .max(MAXIMO_CARACTERES_NOMBRE, {
          error: `Los ${campo} no pueden tener más de ${MAXIMO_CARACTERES_NOMBRE} caracteres.`,
        })
        .regex(PATRON_NOMBRE, {
          error: `Los ${campo} solo pueden tener letras, espacios, apóstrofo (') y guion (-).`,
        }),
    );
}

// C2. El DNI se guarda como texto para no perder los ceros a la izquierda.
const dni = z
  .string({ error: 'Escribe el DNI.' })
  .trim()
  .min(1, { error: 'Escribe el DNI.' })
  .regex(new RegExp(`^\\d{${LARGO_DNI}}$`), { error: `El DNI debe tener exactamente ${LARGO_DNI} dígitos.` });

// C6.
const tipo = z.enum(TIPOS_CONTACTO, { error: 'Elige si es cliente, proveedor o ambos.' });

// Un campo repetido del formulario (varios inputs con name="telefonos") llega como lista si hay
// más de uno, como texto si hay uno solo, o no llega.
function comoLista(valor) {
  if (valor === undefined) {
    return [];
  }
  return Array.isArray(valor) ? valor : [valor];
}

// C3: filas de teléfonos o de correos. Las filas vacías se ignoran. Cada error queda en la fila
// donde está ("telefonos.2" es la tercera fila), así el formulario lo muestra junto a ese campo.
//   interpretar(texto) → { valido: true, valor, clave } o { valido: false, mensaje }
//   `clave` es el valor normalizado, para detectar repetidos aunque se hayan escrito distinto.
function listaDeFilas({ maximo, mensajeMaximo, mensajeVacia, mensajeRepetido, interpretar }) {
  return z
    .preprocess(
      comoLista,
      z.array(z.string(), { error: mensajeVacia }).max(maximo, { error: mensajeMaximo }),
    )
    .transform((filas, ctx) => {
      const valores = [];
      const filaDeCadaClave = new Map(); // clave → número de fila (desde 1)
      let filasConDatos = 0;

      filas.forEach((texto, indice) => {
        if (texto.trim() === '') {
          return;
        }
        filasConDatos++;
        const resultado = interpretar(texto);
        const reportar = (message) => ctx.issues.push({ code: 'custom', message, input: texto, path: [indice] });

        if (!resultado.valido) {
          return reportar(resultado.mensaje);
        }
        if (filaDeCadaClave.has(resultado.clave)) {
          return reportar(mensajeRepetido(filaDeCadaClave.get(resultado.clave)));
        }
        filaDeCadaClave.set(resultado.clave, indice + 1);
        valores.push(resultado.valor);
      });

      if (filasConDatos === 0) {
        ctx.issues.push({ code: 'custom', message: mensajeVacia, input: filas });
      }
      return valores;
    });
}

// C3, T1–T5: devuelve [{ numero, tipo }] con el número solo en dígitos.
const telefonos = listaDeFilas({
  maximo: MAXIMO_TELEFONOS_POR_CONTACTO,
  mensajeMaximo: `Un contacto puede tener como máximo ${MAXIMO_TELEFONOS_POR_CONTACTO} teléfonos.`,
  mensajeVacia: 'Escribe al menos un teléfono.',
  mensajeRepetido: (fila) => `Es el mismo número que el teléfono ${fila}.`,
  interpretar: (texto) => {
    const telefono = normalizarTelefono(texto);
    return telefono.valido
      ? { valido: true, valor: { numero: telefono.numero, tipo: telefono.tipo }, clave: telefono.numero }
      : telefono;
  },
});

// C3, E1: devuelve los correos en minúsculas.
const correos = listaDeFilas({
  maximo: MAXIMO_CORREOS_POR_CONTACTO,
  mensajeMaximo: `Un contacto puede tener como máximo ${MAXIMO_CORREOS_POR_CONTACTO} correos.`,
  mensajeVacia: 'Escribe al menos un correo.',
  mensajeRepetido: (fila) => `Es el mismo correo que el correo ${fila}.`,
  interpretar: (texto) => {
    const resultado = esquemaCorreo.safeParse(texto);
    return resultado.success
      ? { valido: true, valor: resultado.data, clave: resultado.data }
      : { valido: false, mensaje: resultado.error.issues[0].message };
  },
});

// Datos de un contacto tal como llegan del formulario (C1–C3, C6, T1–T5, E1).
// Los campos que no son del contacto (por ejemplo _csrf) se descartan.
export const esquemaContacto = z.object({
  nombres: campoNombre('nombres'),
  apellidos: campoNombre('apellidos'),
  dni,
  tipo,
  telefonos,
  correos,
});
