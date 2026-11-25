import { crearApp } from './app.js';
import { config } from './config/index.js';

const app = crearApp();

app.listen(config.port, () => {
  console.log(`Servidor escuchando en http://localhost:${config.port} (${config.nodeEnv})`);
});
