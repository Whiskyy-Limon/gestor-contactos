# Bitácora de trabajo con IA

## Cómo usé la IA
- **Claude Code**: agente que escribe el código, corre comandos y pruebas, y hace los commits que yo apruebo.
- **Claude (chat)**: lo usé como guía y revisor. Me ayudó a planificar las etapas, redactar los prompts y revisar los planes y el código que proponía el agente antes de aprobarlos.
- Reglas que me puse: trabajar por etapas, pedir siempre el plan antes del código, no aceptar commits sin leerlos, y desactivar el modo automático de permisos para revisar cada comando.

## Etapa 1 — Estructura inicial (25/11)
**Acepté (entendiendo por qué):**
- ES Modules en vez de CommonJS: sintaxis moderna de Node.
- Sin dotenv ni nodemon: Node 22 ya trae `--env-file-if-exists` y `--watch`. Menos dependencias.
- `.gitattributes` con LF: en Windows evita que Git marque archivos como cambiados solo por los saltos de línea.
- `crearApp()` sin `listen`: permite probar la app sin levantar el servidor.
- Desactivó la cabecera `X-Powered-By`, para no anunciar que usa Express.
- `.claude/settings.local.json` en el .gitignore, porque es configuración personal del agente.

**Problemas:**
- El commit falló en PowerShell por cómo pasaba el mensaje; el agente lo resolvió escribiendo el mensaje en un archivo temporal. Verifiqué con `git status` que ese archivo no quedara en el repo. Después agregué una regla a `CLAUDE.md`: los archivos temporales van en la carpeta temporal del sistema y se borran después.

**Cómo verifiqué:** `node -v`, `npm test`, `npm run dev` y abrir localhost, y `git status` para confirmar que `.env` no se sube.

## Etapa 2 — Reglas de negocio y base de datos (25/11)
Yo definí las reglas (foto opcional, archivar en vez de borrar, celulares y fijos, mínimo 1 teléfono y 1 correo, sin registro público, DNI único de 8 dígitos).

**La IA encontró errores en MIS reglas:**
- "Quitar el prefijo 51" chocaba con el código de área de Puno (51). Ahora solo se quita si el número tiene 11 dígitos y lo que queda es un celular válido.
- Los fijos de provincia se escriben con 0, como "(044) 123456", y mi regla los habría rechazado. Ahora se acepta el 0 al escribir y se guarda sin él.
- El rango 41–84 de códigos de área incluía códigos que no existen. Lo cambié por la lista exacta de 23 códigos.

**Una afirmación incorrecta que se corrigió con pruebas:**
- Se dijo (tanto el agente como el chat) que las tablas `STRICT` evitaban perder el cero inicial del DNI. El agente lo probó y no era cierto: lo que protege el DNI es el `CHECK` de 8 dígitos. Lección: verificar con pruebas, no por lo que suena lógico.

**Decisiones que acepté:**
- Triggers para el máximo de 5 teléfonos y 5 correos, además de la validación en el servidor (doble barrera).
- `CHECK` en `password_hash`: la BD rechaza cualquier cosa que no sea un hash bcrypt.
- `CHECK` en `foto`: solo nombres aleatorios, para impedir rutas como `../../algo`.
- La lista de códigos de área se define una sola vez en JS, y una prueba compara los 100 códigos posibles contra la BD para que no se desincronicen.

**Lo que pedí controlar:**
- Si `better-sqlite3` fallaba al instalarse en Windows, que se detuviera en vez de instalar herramientas por su cuenta.
- Verificar que en `git status` no hubiera PDF ni scripts sueltos de la investigación del agente.

**Cómo verifiqué:** 30 pruebas pasando; `npm run db:migrate` dos veces seguidas (la segunda no aplica nada); revisé el SQL del esquema antes de aprobarlo.

## Etapa 3 — Login, sesión persistente y seguridad (25/11)
**Decisiones mías sobre lo que propuso el agente:**
- **Rechacé EJS 7.0.2** y fijé la 3.1.10: cuatro versiones mayores en un año sin notas de versión ni CHANGELOG es una señal de riesgo de cadena de suministro. La 3.1.10 es estable y corrige la CVE-2024-33883.
- **Límite de intentos por IP + correo** (y no solo por IP): en una oficina todos comparten la misma IP pública, y un empleado que se equivoca bloquearía a todos.
- **Ventana de 8 minutos** (el agente propuso 15). La bajé porque la contraseña mínima de 10 caracteres ya hace inviable la fuerza bruta, y priorizo no bloquear mucho tiempo a un empleado que se equivoca.
- **Máximo de 72 bytes en la contraseña:** bcrypt ignora en silencio lo que pasa de ese límite.
- **Permisos:** aprobé "una vez" los comandos que instalan paquetes, borran archivos o hacen push; "siempre" solo para correr pruebas y leer GitHub.

**Lo que hizo bien el agente (y entendí):**
- Almacén de sesiones propio (unas 70 líneas) en vez de otra dependencia.
- Regenera el id de sesión al iniciar sesión, contra la fijación de sesión.
- Mensaje genérico y hash falso cuando el correo no existe, para no revelar qué usuarios existen.
- Cookie anónima de 1 día y de 30 días al iniciar sesión; prefijo `__Host-` en producción.
- CSRF con token sincronizado, también en el login.
- Midió bcrypt en mi máquina (costo 12 ≈ 210 ms) antes de decidir.
- **Prueba de mutación:** quitó a propósito cada protección y confirmó que las pruebas fallaban.
- Se corrigió a sí mismo: los formularios multipart (fotos) necesitarán un manejo especial del CSRF.
- Como las pruebas no cubrían el valor de la ventana de 8 minutos, lo verificó aparte en las cabeceras (`w=480`).

**Cómo verifiqué:**
- `npm audit` sin vulnerabilidades después de cada instalación.
- `user:create` a mano: la contraseña no se ve al escribirla y con un argumento se niega.
- En el navegador: error genérico (el mismo para un correo inexistente); la sesión sobrevive a recargar, a cerrar el navegador y a reiniciar el servidor; el logout la invalida; no hay errores de CSP en la consola; al sexto intento me bloquea.
- 104 pruebas automáticas.

## Etapa 4 — Contactos (26/11)

**Decisiones mías:**
- Tipo de contacto (cliente, proveedor o ambos), búsqueda sin tildes, auditoría de quién creó, editó y archivó, paginación de 20 y **sin roles** (lo dejé como mejora futura: preferí algo más pequeño y bien hecho).
- **Búsqueda en vivo** (idea mía): me resultaba incómodo buscar y luego "Limpiar". Pedí que la lista se actualice mientras escribo y que busque por "empieza con", porque "contiene" con una sola letra trae casi todo.
- Separar en dos commits la corrección de un error (los avisos de una sola vez) y la funcionalidad de editar, para que el historial muestre qué fue corrección y qué fue nuevo.

**Propuestas del agente que acepté (y entendí):**
- **Bloqueo optimista (C7):** si dos personas editan el mismo contacto, la segunda no sobrescribe sin aviso. Es justo la pérdida de datos del caso. Funciona con un número de versión y un `UPDATE ... WHERE version = ?`.
- Migración con `ALTER TABLE` en vez de reconstruir la tabla, porque reconstruirla habría disparado el borrado en cascada de teléfonos y correos.
- Columnas de búsqueda generadas por SQLite: nunca quedan desfasadas del nombre.
- La foto en un formulario aparte, para no perder el archivo elegido si el formulario vuelve con errores.
- En la búsqueda en vivo: correo desde 3 caracteres (si no, con "h" salen todos los @hotmail), y el guion y el apóstrofo como separadores (Rivas-Plata, O'Brien). También me avisó lo que se pierde: "4567" ya no encuentra el DNI 01234567.
- CSRF en las fotos: la excepción se decide por una lista de rutas y no por tipo de contenido, para que un atacante no pueda saltarse la protección mandando un multipart a otra ruta.

**Lo que encontraron las pruebas:**
- **Código redundante:** al romper a propósito la revisión previa del DNI, ninguna prueba falló. El `UNIQUE` de la base ya lo cubría, así que se eliminó.
- **Un error real:** el aviso "Contacto creado" se perdía si otra petición llegaba antes de mostrarlo. Lo corregimos con su prueba.
- **Pruebas mal diseñadas:** una búsqueda de "a" encontraba a todos porque todos se llamaban "Ana", y en "Rosa María Medina" dos palabras empezaban con M. Una prueba mal diseñada da falsa confianza; se corrigieron.

**Dependencias:** antes de instalar multer y sharp, el agente revisó quién los publica (GitHub Actions con publicación verificada), que el CHANGELOG estuviera completo y que no tuvieran scripts de instalación. Es lo que aprendí con EJS, convertido en procedimiento.

**Cómo verifiqué en el navegador:**
- Crear contacto, errores junto a cada campo, DNI repetido con enlace y caché después de cerrar sesión.
- Búsqueda: probé `' OR 1=1 --` (sin resultados) y `<script>alert(1)</script>` (se ve escapado y no se ejecuta). En la pestaña Network comprobé que escribir rápido hace una sola petición.
- **Edición simultánea en dos pestañas:** apareció el aviso de conflicto con mi nombre y la hora, y se conservó lo que escribí.
- Archivar, restaurar y "Restaurar ese contacto" con el DNI de un archivado.
- Fotos: archivo falso, más de 2 MB, la ruta de la foto sin sesión y que al cambiarla quede un solo archivo.

## Mejora visual (26/11)

**Decisiones mías:** pedí mejorar el diseño, una foto estilo Discord (lápiz y menú al hacer clic), un botón luna/sol para el modo oscuro y una **confirmación al quitar la foto**, porque el agente la había dejado a un clic y borra el archivo para siempre. Elegí la paleta Índigo entre tres opciones. Acepté que **cambiar** la foto no pida confirmación, porque ya exige elegir un archivo.

**Lo que aprendí:**
- Todo con CSS propio, sin frameworks, porque la CSP solo permite archivos del propio servidor.
- El contraste se **midió** en la página real (más de 1.000 textos, modos claro y oscuro), no a ojo.
- Funciona con teclado, en celular (sin hover) y sin JavaScript.
- Para evitar el parpadeo del tema, un script pequeño en el `<head>` aplica el modo antes de dibujar la página.
- **Me equivoqué en una suposición:** creí que en un navegador viejo la app se vería "sin colores pero funcional". El agente lo probó y era inusable (campos sin borde, botones invisibles). Agregamos un respaldo en modo claro con una prueba que vigila que los colores coincidan.

## Etapa 5 — Revisión final (27/11)

- Pedí una **revisión de seguridad a una sesión nueva del agente**, sin el contexto del desarrollo, para que leyera el código como otra persona.
- **Encontró un error en MI regla U5:** si alguien bloqueado seguía intentando, terminaba bloqueando a toda la oficina, justo lo que yo quería evitar. Ninguna prueba lo cubría.
- Corregimos 5 hallazgos, cada uno en su commit y siempre en el mismo orden: **primero la prueba que falla, después la corrección**. Entre ellos: el límite de visitas al login, la validación de la configuración (`NODE_ENV=prod` dejaba la app insegura sin avisar), el error 400 en envíos de foto mal formados y que el servidor de desarrollo escuche solo en localhost (lo elegí yo).
- Al probar `engine-strict`, la primera simulación del agente no funcionaba. No confió en ese resultado: lo probó de otra forma con mi Node real.
- **Datos personales:** las capturas del README usan solo datos ficticios. Borré una captura que podía tener datos míos.
- Dejé en "mejoras futuras" lo que no valía la pena hacer hoy, para entregar algo bien hecho y que pueda explicar.
- **Permisos:** no fui constante con el modo de permisos: en varios momentos la sesión estuvo en automático o en "aceptar ediciones". Lo compensé revisando y probando el resultado de cada tanda antes de aprobar su commit.
