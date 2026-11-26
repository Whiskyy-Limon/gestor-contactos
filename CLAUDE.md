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

## Dependencias
- `ejs` está fijada en **3.1.10** (versión exacta, sin `^`). En 2026 se publicaron las versiones mayores 4, 5, 6 y 7 en menos de un año, sin notas de versión ni CHANGELOG: es una señal de riesgo de cadena de suministro. La 3.1.10 es la versión estable conocida y corrige la última CVE publicada (CVE-2024-33883). **No actualizarla sin revisar qué cambió y sin aprobación.**
- Después de instalar o actualizar dependencias, correr `npm audit` y mostrar el resultado.

## Convenciones técnicas
- Módulos ES (`"type": "module"`): `import`/`export`, con la extensión `.js` en las rutas relativas.
- Node >= 22.9. Las variables de `.env` se cargan con la opción nativa `--env-file-if-exists` y el modo desarrollo usa `node --watch`; por eso no se usan `dotenv` ni `nodemon`.
- `src/config/` es el único lugar que lee `process.env`; el resto del código importa la configuración desde ahí.
- `src/app.js` exporta `crearApp({ db, sessionSecret, ... })`, que construye y devuelve la app sin escuchar en ningún puerto; `src/server.js` es el único que llama a `listen`.
- Rutas: en `src/app.js` las públicas se registran antes de `requiereSesion` y todas las demás después. Así, una ruta nueva queda protegida por defecto.
- Vistas EJS: siempre `<%= %>` (escapa HTML); `<%- %>` solo para `include`. Sin estilos ni scripts en línea (la CSP no los permite).
- Estilos: todo en `public/css/estilos.css`, sin frameworks ni fuentes externas (fuente del sistema). Colores, espacios, radios, sombras y tamaños de texto se definen una sola vez como variables en `:root`; el modo oscuro (`prefers-color-scheme: dark`) solo cambia esas variables, y el resto del archivo usa `var(--…)`, nunca colores sueltos. Todo texto cumple WCAG AA contra su fondo (4,5:1; 3:1 el texto grande), y los bordes de los campos y el foco, 3:1. Jerarquía de botones: `.boton` (principal, uno por vista), `.boton--secundario`, `.boton--peligro` (confirma algo destructivo) y `.boton--peligro-contorno` (lleva a esa confirmación).
- Formularios con filas repetidas (teléfonos, correos): todas las filas usan el mismo `name`; `express.urlencoded({ extended: false })` las entrega como lista y el validador deja cada error en su fila (`telefonos.2`), para mostrarlo junto a ese campo. El formulario funciona sin JavaScript; `public/js/filas.js` solo lo mejora.
- Avisos de una sola vez ("Contacto creado."): `req.session.aviso = '…'` antes de redirigir; la cabecera lo muestra (y lo borra) en la próxima página completa. Las redirecciones y los fragmentos no lo consumen.
- Toda respuesta dinámica lleva `Cache-Control: no-store` (middleware `sinCache`); los archivos estáticos no.
- Actualizaciones sin recargar (búsqueda en vivo): el servidor devuelve un fragmento renderizado con la misma vista parcial que usa la página completa; el navegador nunca arma HTML con datos. La lógica de cada script (esperas, cancelaciones) va en una función que recibe sus dependencias, para probarla en Node con temporizadores simulados; la conexión con la página queda aparte.
- CSRF: todo formulario POST lleva `<input type="hidden" name="_csrf" value="<%= csrfToken() %>">` (o la cabecera `X-CSRF-Token`). Formularios multipart (la foto): el middleware global no puede leer su cuerpo (lo lee multer en la ruta), así que cada ruta multipart se declara en `RUTAS_MULTIPART` (`src/routes/contactos.js`), queda fuera de la verificación global y verifica el token ella misma con `verificarCsrf`, después de multer. La excepción es por método y ruta, nunca por `Content-Type`. En el formulario, el campo `_csrf` va antes del archivo.
- Errores: nunca se muestra el stack ni el mensaje interno al usuario. Para un error del cliente, lanzar un error con `status` (4xx) y, si hace falta, `mensajePublico` en español.
- Las pruebas viven en `tests/` y se llaman `*.test.js`. Las utilidades compartidas van en `tests/helpers/` (por ejemplo `app-de-prueba.js`: base de datos en memoria, usuario de prueba y secreto propio).
- Las reglas de negocio están en `docs/REGLAS-NEGOCIO.md`, cada una con un código (C1, T2…). Cita ese código en el código y en las pruebas que la implementan.
- Los valores de las reglas que usa el servidor (códigos de área, máximos por contacto) se definen una sola vez, en `src/validators/reglas.js`. Si la base de datos también los aplica, una prueba verifica que ambos coincidan.

## Base de datos y migraciones
- La conexión se abre con `abrirBaseDeDatos()` (`src/db/conexion.js`), que activa `foreign_keys` y WAL.
- Las migraciones son archivos `src/db/migrations/NNN_descripcion.sql`. `npm run db:migrate` aplica las pendientes en orden, cada una en su transacción, y las registra en `schema_migrations`.
- Una migración ya aplicada no se edita nunca: cualquier cambio va en una migración nueva.
- Los archivos `.sql` no llevan `BEGIN`/`COMMIT` (el migrador ya abre la transacción) ni `PRAGMA` (no tiene efecto dentro de una transacción).
- Tablas `STRICT`. Fechas como texto ISO 8601 en UTC con `Z` (`strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`).
- Las pruebas usan `abrirBaseDeDatos(':memory:')` + `aplicarMigraciones(db)`; nunca la base de datos real.

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
  middlewares/      auth, csrf, errores, avisos, seguridad, subida-foto (multer)
  views/            plantillas EJS y ayudantes.js (presentación: fechas, teléfonos, iniciales)
docs/               reglas de negocio (REGLAS-NEGOCIO.md)
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
- Si necesitas un archivo temporal para el mensaje de commit, créalo en la carpeta temporal del sistema, fuera del proyecto, y bórralo después.
- Nunca pongas claves reales en el código. Todo secreto va en `.env`; mantén `.env.example` actualizado cada vez que se agregue o cambie una variable.
- Toda regla de negocio se valida en el servidor y, cuando aplique, también con restricciones en la base de datos (`UNIQUE`, `NOT NULL`, `CHECK`, `FOREIGN KEY`).
- Consultas SQL siempre con parámetros; nunca concatenando texto.
- Si dudas de una decisión, pregunta en vez de asumir.
- Código y comentarios claros. Usar nombres en español para el dominio (`contacto`, `telefono`, `correo`) está bien.
