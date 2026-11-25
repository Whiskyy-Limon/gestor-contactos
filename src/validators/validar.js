// Error con la lista de problemas de los datos ingresados, uno por campo,
// listo para mostrarse al usuario (en un formulario o en la consola).
export class ErrorDeValidacion extends Error {
  constructor(errores) {
    super(errores.map((error) => error.mensaje).join(' '));
    this.name = 'ErrorDeValidacion';
    this.errores = errores; // [{ campo, mensaje }]
  }
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
