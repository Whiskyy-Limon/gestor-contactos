import { z } from 'zod';
import { esquemaCorreo } from './correo.js';
import { MAXIMO_BYTES_PASSWORD, MAXIMO_CARACTERES_CORREO, MINIMO_CARACTERES_PASSWORD } from './reglas.js';

// U2. La contraseña no se recorta: los espacios pueden ser parte de ella.
const password = z
  .string({ error: 'La contraseña es obligatoria.' })
  .min(MINIMO_CARACTERES_PASSWORD, {
    error: `La contraseña debe tener al menos ${MINIMO_CARACTERES_PASSWORD} caracteres.`,
  })
  .refine((valor) => Buffer.byteLength(valor, 'utf8') <= MAXIMO_BYTES_PASSWORD, {
    error:
      `La contraseña no puede superar los ${MAXIMO_BYTES_PASSWORD} bytes ` +
      `(${MAXIMO_BYTES_PASSWORD} caracteres sin tildes; las letras con tilde y la ñ ocupan 2 bytes y los emojis 4).`,
  });

// Datos del formulario de login (U4). Solo se revisa la forma: cualquier problema se responde con
// el mismo mensaje genérico que una contraseña incorrecta, para no dar pistas.
export const esquemaLogin = z.object({
  correo: z.string().trim().toLowerCase().max(MAXIMO_CARACTERES_CORREO),
  password: z
    .string()
    .min(1)
    .refine((valor) => Buffer.byteLength(valor, 'utf8') <= MAXIMO_BYTES_PASSWORD),
});

// Usuario nuevo (U2, U3). El correo se guarda en minúsculas y sin espacios alrededor.
export const esquemaNuevoUsuario = z.object({
  nombre: z
    .string({ error: 'El nombre es obligatorio.' })
    .trim()
    .min(2, { error: 'El nombre debe tener al menos 2 caracteres.' })
    .max(100, { error: 'El nombre no puede tener más de 100 caracteres.' }),
  correo: esquemaCorreo,
  password,
});
