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