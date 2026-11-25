import { z } from 'zod';
import { MAXIMO_BYTES_PASSWORD, MINIMO_CARACTERES_PASSWORD } from './reglas.js';

const correo = z
  .string({ error: 'El correo es obligatorio.' })
  .trim()
  .toLowerCase()
  .pipe(
    z
      .email({ error: 'El correo no es válido.' })
      .max(254, { error: 'El correo no puede tener más de 254 caracteres.' }),
  );

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

// Usuario nuevo (U2, U3). El correo se guarda en minúsculas y sin espacios alrededor.
export const esquemaNuevoUsuario = z.object({
  nombre: z
    .string({ error: 'El nombre es obligatorio.' })
    .trim()
    .min(2, { error: 'El nombre debe tener al menos 2 caracteres.' })
    .max(100, { error: 'El nombre no puede tener más de 100 caracteres.' }),
  correo,
  password,
});
