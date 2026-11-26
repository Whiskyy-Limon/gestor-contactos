import { z } from 'zod';
import { MAXIMO_CARACTERES_CORREO } from './reglas.js';

// E1 (correos de contactos) y U3 (correo de usuario): formato válido, como máximo 254 caracteres,
// sin espacios alrededor y en minúsculas.
export const esquemaCorreo = z
  .string({ error: 'El correo es obligatorio.' })
  .trim()
  .toLowerCase()
  .pipe(
    z.email({ error: 'El correo no es válido.' }).max(MAXIMO_CARACTERES_CORREO, {
      error: `El correo no puede tener más de ${MAXIMO_CARACTERES_CORREO} caracteres.`,
    }),
  );
