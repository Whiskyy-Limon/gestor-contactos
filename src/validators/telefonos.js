import { CODIGOS_AREA_PROVINCIA } from './reglas.js';

// Teléfonos de Perú (T1–T5): interpretar lo que se escribe y mostrar lo que se guardó.

// T1: espacios, guiones y paréntesis son solo formato. Sin ellos, debe quedar un "+" opcional
// (el del prefijo +51 de T2, que así puede escribirse "(+51)") seguido solo de dígitos.
const FORMATO = /[\s()-]/g;
const SOLO_DIGITOS = /^\+?\d*$/;
const CODIGOS_AREA = new Set(CODIGOS_AREA_PROVINCIA);

const MENSAJES = {
  caracteres: 'El teléfono solo puede tener números, espacios, guiones, paréntesis y el prefijo +51.',
  prefijo: 'Con el prefijo +51 solo se aceptan celulares, por ejemplo +51 987 654 321.',
  celular: 'Un celular tiene 9 dígitos y empieza con 9, por ejemplo 987 654 321.',
  lima: 'Un fijo de Lima tiene el 01 y 7 dígitos más, por ejemplo 01 234 5678.',
  provincia: 'Un fijo de provincia tiene el código de área y 6 dígitos más, por ejemplo 044 123456.',
  general:
    'El teléfono no es válido. Escribe un celular (987 654 321), un fijo de Lima con el 01 ' +
    '(01 234 5678) o un fijo de provincia con su código de área (044 123456).',
};

const valido = (numero, tipo) => ({ valido: true, numero, tipo });
const invalido = (mensaje) => ({ valido: false, mensaje });
const esCelular = (digitos) => digitos.length === 9 && digitos.startsWith('9');

// T4: 8 dígitos (código de área + 6), con un código de la lista vigente.
function fijoDeProvincia(digitos) {
  if (digitos.length !== 8) {
    return invalido(MENSAJES.provincia);
  }
  const codigo = digitos.slice(0, 2);
  if (!CODIGOS_AREA.has(codigo)) {
    return invalido(`El código de área ${codigo} no corresponde a ningún departamento del Perú.`);
  }
  return valido(digitos, 'fijo');
}

// Interpreta un teléfono escrito a mano.
// Devuelve { valido: true, numero, tipo } con el número solo en dígitos (T1) y su tipo (T5),
// o { valido: false, mensaje } con un mensaje para mostrar junto al campo.
export function normalizarTelefono(texto) {
  const compacto = String(texto).replace(FORMATO, '');
  if (!SOLO_DIGITOS.test(compacto)) {
    return invalido(MENSAJES.caracteres);
  }
  const conPrefijo = compacto.startsWith('+');
  const digitos = conPrefijo ? compacto.slice(1) : compacto;

  // T2: el prefijo 51 (o +51) solo se reconoce si al quitarlo queda un celular. Así "51 123456",
  // un fijo de Puno (código 51), no se confunde con un número con prefijo.
  if (digitos.length === 11 && digitos.startsWith('51') && esCelular(digitos.slice(2))) {
    return valido(digitos.slice(2), 'celular');
  }
  if (conPrefijo) {
    return invalido(MENSAJES.prefijo);
  }

  if (digitos.startsWith('9')) {
    return esCelular(digitos) ? valido(digitos, 'celular') : invalido(MENSAJES.celular); // T2
  }
  if (digitos.startsWith('01')) {
    return digitos.length === 9 ? valido(digitos, 'fijo') : invalido(MENSAJES.lima); // T3
  }
  if (digitos.startsWith('0')) {
    // T4 con el 0 con que se marca dentro del país: "(044) 123456" se guarda como 44123456.
    return digitos.length === 9 ? fijoDeProvincia(digitos.slice(1)) : invalido(MENSAJES.provincia);
  }
  if (digitos.length === 8) {
    return fijoDeProvincia(digitos);
  }
  return invalido(MENSAJES.general);
}

// Número guardado → texto para mostrar: "987 654 321", "(01) 234 5678" o "(044) 123456".
export function formatearTelefono(numero, tipo) {
  if (tipo === 'celular' && numero.length === 9) {
    return `${numero.slice(0, 3)} ${numero.slice(3, 6)} ${numero.slice(6)}`;
  }
  if (tipo === 'fijo' && numero.length === 9) {
    return `(01) ${numero.slice(2, 5)} ${numero.slice(5)}`;
  }
  if (tipo === 'fijo' && numero.length === 8) {
    return `(0${numero.slice(0, 2)}) ${numero.slice(2)}`;
  }
  return numero;
}
