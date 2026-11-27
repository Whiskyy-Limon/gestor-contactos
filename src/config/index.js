// Único lugar del proyecto que lee process.env.
// Las variables de .env las carga Node con --env-file-if-exists (ver scripts en package.json).
//
// La configuración se valida con zod al cargarse, antes de abrir la base de datos o escuchar en un
// puerto:
// - una variable vacía (o solo con espacios) es como si no estuviera: toma su valor por defecto.
//   Así "PORT=" no termina en un puerto aleatorio, ni "UPLOADS_PATH=" guarda las fotos en la raíz
//   del proyecto, ni "DATABASE_PATH=" abre una base de datos temporal que se pierde al cerrarla;
// - un valor inválido (PORT=abc, NODE_ENV=prod) detiene el arranque con un mensaje que dice qué
//   variable corregir, sin stack.
// SESSION_SECRET no tiene valor por defecto: si falta, crearApp detiene el arranque (los scripts de
// consola no lo necesitan).
import { z } from 'zod';

export class ErrorDeConfiguracion extends Error {
  constructor(problemas) {
    super(problemas.join('\n'));
    this.name = 'ErrorDeConfiguracion';
  }
}

const ENTORNOS = ['development', 'production', 'test'];
const MENSAJE_PUERTO = 'debe ser un número de puerto entre 1 y 65535.';

function vacioComoAusente(valor) {
  return typeof valor === 'string' && valor.trim() === '' ? undefined : valor;
}

// Variable con valor por defecto: si falta o está vacía, `porDefecto`.
function conValorPorDefecto(esquema, porDefecto) {
  return z.preprocess(vacioComoAusente, esquema.optional()).transform((valor) => valor ?? porDefecto);
}

// TRUST_PROXY: vacío, "0" o "false" = no hay proxy; un número = cuántos proxies hay delante;
// cualquier otro texto se pasa tal cual a Express (por ejemplo "loopback" o una lista de IPs).
function leerTrustProxy(valor) {
  const texto = valor.trim();
  if (texto === '0' || texto.toLowerCase() === 'false') {
    return false;
  }
  return /^\d+$/.test(texto) ? Number(texto) : texto;
}

const esquemaEntorno = z.object({
  NODE_ENV: conValorPorDefecto(
    z.enum(ENTORNOS, { error: `debe ser ${ENTORNOS.slice(0, -1).join(', ')} o ${ENTORNOS.at(-1)}.` }),
    'development',
  ),
  PORT: conValorPorDefecto(
    z
      .string()
      .trim()
      .regex(/^\d+$/, { error: MENSAJE_PUERTO })
      .transform(Number)
      .refine((puerto) => puerto >= 1 && puerto <= 65535, { error: MENSAJE_PUERTO }),
    3000,
  ),
  SESSION_SECRET: z.preprocess(vacioComoAusente, z.string().optional()),
  DATABASE_PATH: conValorPorDefecto(z.string(), 'storage/contactos.db'),
  UPLOADS_PATH: conValorPorDefecto(z.string(), 'storage/uploads'),
  TRUST_PROXY: conValorPorDefecto(z.string().transform(leerTrustProxy), false),
});

// Valida las variables `entorno` (normalmente process.env) y devuelve la configuración.
// Lanza ErrorDeConfiguracion con un problema por línea si algún valor no es válido.
export function leerConfiguracion(entorno) {
  const resultado = esquemaEntorno.safeParse(entorno);
  if (!resultado.success) {
    throw new ErrorDeConfiguracion(
      resultado.error.issues.map((issue) => {
        const variable = issue.path[0];
        // El valor ayuda a encontrar el error, salvo en un secreto, que nunca se muestra.
        const valor = /SECRET/.test(variable) ? '' : ` Valor recibido: "${entorno[variable]}".`;
        return `- ${variable}: ${issue.message}${valor}`;
      }),
    );
  }
  const variables = resultado.data;
  return {
    nodeEnv: variables.NODE_ENV,
    isProduction: variables.NODE_ENV === 'production',
    port: variables.PORT,
    sessionSecret: variables.SESSION_SECRET,
    databasePath: variables.DATABASE_PATH,
    carpetaFotos: variables.UPLOADS_PATH,
    trustProxy: variables.TRUST_PROXY,
  };
}

// Si la configuración no es válida, no tiene sentido seguir: se explica qué corregir y se termina
// el proceso (servidor o script de consola) sin mostrar un stack.
function cargarConfiguracion() {
  try {
    return leerConfiguracion(process.env);
  } catch (error) {
    if (!(error instanceof ErrorDeConfiguracion)) {
      throw error;
    }
    console.error(`La configuración no es válida (revisa .env o las variables de entorno):\n${error.message}`);
    process.exit(1);
  }
}

export const config = cargarConfiguracion();
