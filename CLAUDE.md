# Gestor de contactos — instrucciones para el agente

## Contexto
Sistema web para que una pequeña empresa gestione sus contactos (clientes y proveedores). Hoy viven en hojas de cálculo, con pérdida de datos, duplicados y sin control de acceso. El sistema debe resolver esos tres problemas.

## Stack (no cambiar sin consultar)
- **Node.js LTS + Express**, monolito con vistas **EJS** renderizadas en el servidor.
- **SQLite** con **better-sqlite3**. SQL escrito a mano en archivos de migración (`src/db/migrations/*.sql`). Sin ORM.
- Validación con **zod**, SIEMPRE en el servidor.
- Sesiones con **express-session** guardadas en SQLite. Cookie `httpOnly`, `sameSite=lax`, `secure` en producción, duración de 30 días.
- Contraseñas con **bcryptjs**.
- Subida de fotos con **multer** (en memoria) + **sharp** para reprocesar la imagen.
- Pruebas con **node:test** + **supertest**.
- **Windows es el sistema de desarrollo**: todos los scripts de npm deben funcionar en Windows (nada de `VAR=valor comando`, `rm -rf`, etc.).

## Convenciones técnicas
- Módulos ES (`"type": "module"`): `import`/`export`, con la extensión `.js` en las rutas relativas.
- Node >= 22.9. Las variables de `.env` se cargan con la opción nativa `--env-file-if-exists` y el modo desarrollo usa `node --watch`; por eso no se usan `dotenv` ni `nodemon`.
- `src/config/` es el único lugar que lee `process.env`; el resto del código importa la configuración desde ahí.
- `src/app.js` exporta `crearApp()`, que construye y devuelve la app sin escuchar en ningún puerto; `src/server.js` es el único que llama a `listen`.
- Las pruebas viven en `tests/` y se llaman `*.test.js`.

## Estructura
```
src/
  app.js            configura Express (sin app.listen, para poder testear)
  server.js         arranca el servidor
  config/           lee variables de entorno
  db/               conexión y migraciones (db/migrations/*.sql)
  routes/           rutas, delgadas: reciben la petición, llaman a un servicio y responden
  services/         lógica de negocio y acceso a datos
  validators/       esquemas zod
  middlewares/      auth, csrf, errores, upload
  views/            plantillas EJS
public/             CSS y archivos estáticos
storage/uploads/    fotos subidas; FUERA de public, se sirven por una ruta protegida
tests/              pruebas
scripts/            tareas de consola (migrar la BD, crear usuario)
```

## Comandos
- `npm run dev` — servidor en modo desarrollo (se reinicia al cambiar el código).
- `npm start` — servidor en modo normal.
- `npm test` — ejecuta las pruebas.
- `npm run db:migrate` — aplica las migraciones pendientes.
- `npm run user:create` — crea un usuario desde la consola.

## Reglas de trabajo
- Cambios pequeños, una etapa a la vez. Al terminar cada etapa, propón un mensaje de commit en español que explique qué cambió. **No hagas commit sin aprobación explícita.**
- Nunca pongas claves reales en el código. Todo secreto va en `.env`; mantén `.env.example` actualizado cada vez que se agregue o cambie una variable.
- Toda regla de negocio se valida en el servidor y, cuando aplique, también con restricciones en la base de datos (`UNIQUE`, `NOT NULL`, `CHECK`, `FOREIGN KEY`).
- Consultas SQL siempre con parámetros; nunca concatenando texto.
- Si dudas de una decisión, pregunta en vez de asumir.
- Código y comentarios claros. Usar nombres en español para el dominio (`contacto`, `telefono`, `correo`) está bien.
