// Único lugar del proyecto que lee process.env.
// Las variables de .env las carga Node con --env-file-if-exists (ver scripts en package.json).

const nodeEnv = process.env.NODE_ENV ?? 'development';

// TRUST_PROXY: vacío, "0" o "false" = no hay proxy; un número = cuántos proxies hay delante;
// cualquier otro texto se pasa tal cual a Express (por ejemplo "loopback" o una lista de IPs).
function leerTrustProxy(valor) {
  const texto = (valor ?? '').trim();
  if (texto === '' || texto === '0' || texto.toLowerCase() === 'false') {
    return false;
  }
  return /^\d+$/.test(texto) ? Number(texto) : texto;
}

export const config = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: Number(process.env.PORT ?? 3000),
  sessionSecret: process.env.SESSION_SECRET,
  databasePath: process.env.DATABASE_PATH ?? 'storage/contactos.db',
  carpetaFotos: process.env.UPLOADS_PATH ?? 'storage/uploads',
  trustProxy: leerTrustProxy(process.env.TRUST_PROXY),
};
