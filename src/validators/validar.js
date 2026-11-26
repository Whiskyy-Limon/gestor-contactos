// Error con la lista de problemas de los datos ingresados, uno por campo,
// listo para mostrarse al usuario (en un formulario o en la consola).
export class ErrorDeValidacion extends Error {
  constructor(errores) {
    super(errores.map((error) => error.mensaje).join(' '));
    this.name = 'ErrorDeValidacion';
    this.errores = errores; // [{ campo, mensaje }]
  }
}

// { campo: mensaje } con el primer mensaje de cada campo, para mostrarlo junto a ese campo en un
// formulario. Un campo puede fallar en varias reglas a la vez (por ejemplo, vacío y sin el formato);
// basta con mostrar la primera.
export function erroresPorCampo(errores) {
  const porCampo = {};
  for (const { campo, mensaje } of errores) {
    porCampo[campo] ??= mensaje;
  }
  return porCampo;
}

// Valida `datos` con un esquema zod. Devuelve los datos ya limpios (con trim, minúsculas, etc.)
// o lanza ErrorDeValidacion con todos los problemas encontrados.
export function validar(esquema, datos) {
  const resultado = esquema.safeParse(datos);
  if (resultado.success) {
    return resultado.data;
  }
  throw new ErrorDeValidacion(
    resultado.error.issues.map((issue) => ({ campo: issue.path.join('.'), mensaje: issue.message })),
  );
}
