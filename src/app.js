import express from 'express';
import inicioRouter from './routes/inicio.js';

// Construye la app sin escuchar en ningún puerto, para poder usarla en las pruebas.
export function crearApp() {
  const app = express();

  // No anunciar qué framework usa el servidor.
  app.disable('x-powered-by');

  app.use(inicioRouter);

  return app;
}
