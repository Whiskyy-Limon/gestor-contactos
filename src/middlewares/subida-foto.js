import multer from 'multer';
import { MAXIMO_BYTES_FOTO } from '../validators/reglas.js';

// Lectura del formulario multipart de la foto (F1). El archivo queda en memoria (req.file.buffer):
// nunca se escribe tal cual en el disco; lo que se guarda es la imagen ya reprocesada por sharp.
// Límites: 1 archivo de hasta 2 MB y pocos campos (solo se espera _csrf).
const subida = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAXIMO_BYTES_FOTO, files: 1, fields: 5, fieldSize: 1024, parts: 6 },
}).single('foto');

// F1: también lo muestra el navegador antes de enviar (public/js/foto.js), con el mismo texto.
export const MENSAJE_FOTO_PESADA = `La foto pesa más de ${MAXIMO_BYTES_FOTO / 1024 / 1024} MB.`;

const MENSAJE_ENVIO_INVALIDO = 'El envío de la foto no es válido. Vuelve a intentarlo.';

const MENSAJES = {
  LIMIT_FILE_SIZE: MENSAJE_FOTO_PESADA,
  LIMIT_FILE_COUNT: 'Envía una sola foto.',
  LIMIT_UNEXPECTED_FILE: 'Envía una sola foto.',
};

// Un límite superado (por ejemplo, más de 2 MB) no corta la petición: queda en
// req.errorDeSubida = { estado, mensaje } para mostrarlo en el detalle del contacto, después de
// verificar el token CSRF.
// Cualquier otro error al leer el formulario viene del envío, no del servidor: un multipart sin
// boundary, un cuerpo cortado o una conexión interrumpida. Responde 400 con la página de error
// genérica y no se registra como error inesperado. No hace falta verificar el token: no se cambia nada.
export function recibirFoto(req, res, next) {
  subida(req, res, (error) => {
    if (!error) {
      return next();
    }
    if (error instanceof multer.MulterError) {
      req.errorDeSubida = {
        estado: error.code === 'LIMIT_FILE_SIZE' ? 413 : 400,
        mensaje: MENSAJES[error.code] ?? MENSAJE_ENVIO_INVALIDO,
      };
      return next();
    }
    error.status = 400;
    error.mensajePublico = MENSAJE_ENVIO_INVALIDO;
    next(error);
  });
}
