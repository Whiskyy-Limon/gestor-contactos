// Fotos de los contactos (C4, F1–F4): validación por contenido, reprocesamiento con sharp y archivos
// en la carpeta de fotos (UPLOADS_PATH, fuera de public/).
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { FORMATOS_FOTO, LADO_MAXIMO_FOTO, MAXIMO_PIXELES_FOTO } from '../validators/reglas.js';
import { reemplazarFoto } from './contactos.js';

// Una foto que no se puede aceptar, con el mensaje para mostrar junto al formulario.
export class ErrorDeFoto extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorDeFoto';
    this.status = 400;
    this.mensajePublico = mensaje;
  }
}

const MENSAJE_NO_ES_IMAGEN = 'El archivo no es una imagen JPG, PNG o WebP válida.';
const MENSAJE_DEMASIADOS_PIXELES =
  `La imagen es demasiado grande: puede tener como máximo ${MAXIMO_PIXELES_FOTO / 1_000_000} ` +
  'megapíxeles (por ejemplo, 5000 × 5000 píxeles).';

const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// F2: formato según los primeros bytes del archivo (su "firma"), no según la extensión ni el tipo
// que informa el navegador. Lo que no es JPG, PNG ni WebP (SVG, GIF, HEIC, un ejecutable…) se
// rechaza antes de pasárselo a sharp.
function formatoPorFirma(contenido) {
  if (contenido.length >= 3 && contenido[0] === 0xff && contenido[1] === 0xd8 && contenido[2] === 0xff) {
    return 'jpeg';
  }
  if (contenido.subarray(0, 8).equals(FIRMA_PNG)) {
    return 'png';
  }
  if (
    contenido.length >= 12 &&
    contenido.toString('latin1', 0, 4) === 'RIFF' &&
    contenido.toString('latin1', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

// F2–F4: valida la imagen por su contenido y la reprocesa. Devuelve el WebP resultante.
export async function procesarFoto(contenido) {
  const formato = formatoPorFirma(contenido);
  if (!FORMATOS_FOTO.includes(formato)) {
    throw new ErrorDeFoto(MENSAJE_NO_ES_IMAGEN);
  }

  // Lee solo la cabecera (no decodifica la imagen) para saber el formato real y cuántos píxeles tiene.
  let metadatos;
  try {
    metadatos = await sharp(contenido).metadata();
  } catch {
    throw new ErrorDeFoto(MENSAJE_NO_ES_IMAGEN);
  }
  if (metadatos.format !== formato) {
    throw new ErrorDeFoto(MENSAJE_NO_ES_IMAGEN);
  }
  // F4: una imagen "bomba" pesa poco pero se descomprime en cientos de millones de píxeles.
  if (metadatos.width * metadatos.height > MAXIMO_PIXELES_FOTO) {
    throw new ErrorDeFoto(MENSAJE_DEMASIADOS_PIXELES);
  }

  // F3. limitInputPixels es una segunda barrera por si la cabecera mintiera sobre el tamaño.
  // rotate() endereza la imagen según la orientación de la cámara (EXIF) antes de que se descarten
  // los metadatos: sharp no copia EXIF, GPS ni ningún otro metadato a la salida.
  try {
    return await sharp(contenido, { limitInputPixels: MAXIMO_PIXELES_FOTO })
      .rotate()
      .resize(LADO_MAXIMO_FOTO, LADO_MAXIMO_FOTO, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new ErrorDeFoto(MENSAJE_NO_ES_IMAGEN);
  }
}

// F3: nombre aleatorio, 32 caracteres hexadecimales + .webp (el mismo formato que exige la BD).
const NOMBRE_DE_FOTO = /^[0-9a-f]{32}\.webp$/;

export function esNombreDeFoto(nombre) {
  return typeof nombre === 'string' && NOMBRE_DE_FOTO.test(nombre);
}

async function guardarArchivo(carpeta, contenido) {
  const nombre = `${crypto.randomBytes(16).toString('hex')}.webp`;
  // 'wx': falla si ya existiera un archivo con ese nombre (nunca se pisa una foto).
  await fs.writeFile(path.join(carpeta, nombre), contenido, { flag: 'wx' });
  return nombre;
}

async function borrarArchivo(carpeta, nombre) {
  await fs.rm(path.join(carpeta, nombre), { force: true });
}

// C4: cambia la foto del contacto. Valida y reprocesa la imagen, guarda el archivo nuevo, lo
// registra en la base de datos y recién entonces borra el anterior. Si la base de datos falla, se
// borra el archivo nuevo: no quedan archivos sin contacto.
// Lanza ErrorDeFoto, ConflictoDeEdicion (contacto archivado) o un error 404.
export async function cambiarFoto(db, { carpeta, contactoId, contenido, usuarioId, registrarError }) {
  const webp = await procesarFoto(contenido);
  const nombre = await guardarArchivo(carpeta, webp);

  let anterior;
  try {
    anterior = reemplazarFoto(db, contactoId, nombre, usuarioId);
  } catch (error) {
    await borrarArchivo(carpeta, nombre);
    throw error;
  }
  // La foto nueva ya quedó guardada: si no se puede borrar la anterior, solo se registra.
  if (anterior) {
    await borrarArchivo(carpeta, anterior).catch(registrarError);
  }
  return nombre;
}

// C4: quita la foto del contacto y borra su archivo. Devuelve false si no tenía foto.
export async function quitarFoto(db, { carpeta, contactoId, usuarioId, registrarError }) {
  const anterior = reemplazarFoto(db, contactoId, null, usuarioId);
  if (anterior) {
    await borrarArchivo(carpeta, anterior).catch(registrarError);
  }
  return anterior !== null;
}
