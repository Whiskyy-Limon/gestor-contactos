// Único lugar del proyecto que lee process.env.
// Las variables de .env las carga Node con --env-file-if-exists (ver scripts en package.json).

const nodeEnv = process.env.NODE_ENV ?? 'development';

export const config = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: Number(process.env.PORT ?? 3000),
  sessionSecret: process.env.SESSION_SECRET,
  databasePath: process.env.DATABASE_PATH ?? 'storage/contactos.db',
};
