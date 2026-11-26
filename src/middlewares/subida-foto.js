import multer from 'multer';
import { MAXIMO_BYTES_FOTO } from '../validators/reglas.js';

// Lectura del formulario multipart de la foto (F1). El archivo queda en memoria (req.file.buffer):
// nunca se escribe tal cual en el disco; lo que se guarda es la imagen ya reprocesada por sharp.
// Límites: 1 archivo de hasta 2 MB y pocos campos (solo se espera _csrf).
const subida = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAXIMO_BYTES_FOTO, files: 1, fields: 5, fieldSize: 1024, parts: 6 },
}).single('foto');

const MENSAJES = {
  LIMIT_FILE_SIZE: `La foto pesa más de ${MAXIMO_BYTES_FOTO / 1024 / 1024} MB.`,
  LIMIT_FILE_COUNT: 'Envía una sola foto.',
  LIMIT_UNEXPECTED_FILE: 'Envía una sola foto.',
};

// Un problema con el envío (por ejemplo, más de 2 MB) no corta la petición: queda en
// req.errorDeSubida = { estado, mensaje } para mostrarlo en el detalle del contacto, después de
// verificar el token CSRF. Cualquier otro error sigue al manejador de errores.
export function recibirFoto(req, res, next) {
  subida(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      req.errorDeSubida = {
        estado: error.code === 'LIMIT_FILE_SIZE' ? 413 : 400,
        mensaje: MENSAJES[error.code] ?? 'El envío de la foto no es válido. Vuelve a intentarlo.',
      };
      return next();
    }
    next(error);
  });
}
