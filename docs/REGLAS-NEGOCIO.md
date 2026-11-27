# Reglas de negocio — Gestor de contactos

Este documento reúne las reglas que el sistema debe cumplir y el motivo de cada una. Son decisiones del responsable del proyecto: cualquier cambio se consulta antes de aplicarse.

Todas las reglas se validan en el servidor. Cuando la base de datos puede verificar una regla (`NOT NULL`, `UNIQUE`, `CHECK`, `FOREIGN KEY`), también se aplica ahí, como segunda barrera.

Cada regla tiene un código (C1, T2, …) para poder citarla en el código, las pruebas y los commits.

---

## Contacto

### C1. Nombres y apellidos
**Regla:** Nombres y apellidos son obligatorios. Cada campo tiene entre 2 y 60 caracteres y solo admite las letras del español (de la a a la z, las vocales con tilde á, é, í, ó, ú, la ü y la ñ, en mayúsculas o minúsculas), espacios, apóstrofo (`'`) y guion (`-`). Antes de guardar se quitan los espacios del inicio y del final, los espacios dobles se reducen a uno y el apóstrofo tipográfico (`’`) se convierte en `'`.

**Porqué:** Los nombres reales llevan tildes, ñ y ü, y hay apellidos compuestos ("De la Cruz", "Rivas-Plata") o con apóstrofo ("O'Brien"); la regla los acepta y rechaza números y símbolos, que casi siempre son errores de tipeo. Normalizar los espacios evita que "Ana  María" y "Ana María" se vean como datos distintos. Muchos teclados de celular escriben el apóstrofo tipográfico; convertirlo evita que "O’Brien" y "O'Brien" sean datos distintos. Las letras de otros idiomas (ç, ö, è…) por ahora no se aceptan, porque la búsqueda sin tildes (B2) está preparada para las letras del español (ver Mejoras futuras).

### C2. DNI
**Regla:** El DNI es obligatorio y tiene exactamente 8 dígitos. Es único en todo el sistema, incluidos los contactos archivados. Si se intenta registrar un DNI que pertenece a un contacto archivado, el mensaje debe indicarlo y ofrecer restaurar ese contacto.

**Porqué:** El principal problema del cliente son los duplicados, y el DNI identifica a cada persona de forma única. Los archivados también cuentan porque archivar no es borrar: aceptar de nuevo ese DNI crearía un duplicado del contacto archivado. Ofrecer restaurarlo recupera los datos que ya existen en vez de cargarlos otra vez. El DNI se guarda como texto para no perder los ceros a la izquierda.

### C3. Teléfonos y correos del contacto
**Regla:** Cada contacto tiene al menos 1 teléfono y al menos 1 correo, y como máximo 5 de cada uno. Dentro de un mismo contacto no se repite un teléfono ni un correo.

**Porqué:** Un contacto sin forma de comunicarse no le sirve a la empresa. El máximo mantiene la ficha legible y evita cargas abusivas. Repetir un dato dentro de la misma ficha no aporta nada y ensucia la información. La restricción es por contacto: dos contactos distintos sí pueden compartir un teléfono o un correo (por ejemplo, la central de una empresa).

### C4. Foto
**Regla:** La foto es opcional. Si un contacto no tiene foto, se muestra un avatar con sus iniciales. La foto se agrega, se cambia o se quita desde el detalle del contacto, en un formulario aparte del de sus datos. Quitarla pide confirmación (F5).

**Porqué:** No siempre se tiene una foto del contacto. Las iniciales permiten reconocerlo de un vistazo en los listados sin exigir una imagen. Si el formulario de datos vuelve con un error, el navegador no conserva el archivo elegido; con la foto en un formulario aparte no hay que elegirla de nuevo.

### C5. Eliminar es archivar
**Regla:** Eliminar un contacto significa archivarlo: no se borra de la base de datos, deja de aparecer en el listado normal y se puede restaurar. Archivar pide confirmación; restaurar no, porque solo deshace el archivado. Un contacto archivado no se puede editar: primero hay que restaurarlo.

**Porqué:** Hoy el cliente pierde datos. Archivar permite deshacer un error y conserva toda la información, junto con la fecha en que se archivó. La confirmación evita archivar por un clic accidental. Impedir que se edite un archivado evita cambios sobre datos que ya no aparecen en el listado normal y que nadie está revisando.

### C6. Tipo de contacto
**Regla:** Cada contacto es `cliente`, `proveedor` o `ambos`, y el tipo es obligatorio. En el listado se puede filtrar por tipo: el filtro "Clientes" incluye a los de tipo "ambos", y el filtro "Proveedores" también.

**Porqué:** El caso habla de clientes y proveedores, y la empresa necesita distinguirlos. Algunos contactos son las dos cosas (la empresa les compra y les vende): con "ambos" se registran una sola vez, sin duplicarlos, y aparecen tanto al buscar clientes como al buscar proveedores.

### C7. Ediciones simultáneas
**Regla:** Si dos personas editan el mismo contacto a la vez, la que guarda en segundo lugar no sobrescribe sin saberlo los cambios de la otra: el sistema le vuelve a mostrar el formulario con lo que escribió, le avisa que otra persona guardó cambios y le ofrece ver la versión guardada. Si vuelve a guardar, reemplaza esa versión a sabiendas.

**Porqué:** Sin este control, quien guarda al último borra sin aviso el trabajo de la otra persona: es la pérdida de datos que hoy ocurre con las hojas de cálculo compartidas. Volver a mostrar lo que escribió evita que pierda su propio trabajo.

---

## Teléfonos (Perú)

### T1. Normalización
**Regla:** Al escribir un teléfono se aceptan espacios, guiones y paréntesis. Se guarda solo en dígitos.

**Porqué:** Cada persona escribe el número a su manera ("987 654 321", "(01) 234-5678"). Guardar solo los dígitos permite detectar repetidos y buscar sin depender del formato.

### T2. Celular
**Regla:** 9 dígitos que empiezan con 9. Al escribir se acepta el prefijo `+51` o `51`, que se quita al guardar.

**Porqué:** Es el formato de los celulares en Perú. El prefijo de país no cambia el número: si se guardara, "+51 987 654 321" y "987 654 321" parecerían números distintos.

**Aclaración:** El prefijo solo se reconoce cuando, al quitarlo, queda un celular válido (11 dígitos en total con el prefijo). Así no se confunde con un fijo de Puno, cuyo código de área también es 51.

### T3. Fijo de Lima
**Regla:** `01` seguido de 7 dígitos (9 dígitos en total).

**Porqué:** Es el formato de la numeración fija de Lima. Validarlo evita guardar números incompletos o con dígitos de más.

### T4. Fijo de provincia
**Regla:** Código de área de 2 dígitos seguido de 6 dígitos (8 dígitos en total). Solo se aceptan los 23 códigos de área vigentes de la tabla de abajo. Al escribir se acepta el 0 inicial con el que se marca dentro del país, por ejemplo "(044) 123456"; ese 0 se quita al guardar, y se guarda `44123456`.

**Porqué:** Es el formato de la numeración fija fuera de Lima. Validarlo evita guardar números incompletos o con dígitos de más. Usar la lista exacta, y no un rango, detecta códigos que no existen (por ejemplo 45, 50 o 70), que casi siempre son errores de tipeo. Aceptar el 0 inicial permite escribir el número como se acostumbra, y quitarlo al guardar hace que "(044) 123456" y "44 123456" se reconozcan como el mismo número.

**Códigos de área vigentes:**

| Código | Departamento  | Código | Departamento  | Código | Departamento   |
|--------|---------------|--------|---------------|--------|----------------|
| 41     | Amazonas      | 56     | Ica           | 72     | Tumbes         |
| 42     | San Martín    | 61     | Ucayali       | 73     | Piura          |
| 43     | Áncash        | 62     | Huánuco       | 74     | Lambayeque     |
| 44     | La Libertad   | 63     | Pasco         | 76     | Cajamarca      |
| 51     | Puno          | 64     | Junín         | 82     | Madre de Dios  |
| 52     | Tacna         | 65     | Loreto        | 83     | Apurímac       |
| 53     | Moquegua      | 66     | Ayacucho      | 84     | Cusco          |
| 54     | Arequipa      | 67     | Huancavelica  |        |                |

**De dónde sale la lista:** Los códigos los asigna el Ministerio de Transportes y Comunicaciones (MTC) en el Plan Técnico Fundamental de Numeración, aprobado por la Resolución Suprema N.° 022-2002-MTC. Ese plan da un código a cada departamento y está vigente desde el 1 de marzo de 2003. Lima y Callao usan el código 1, de ahí el `01` de la regla T3. La lista se contrastó en noviembre de 2026 con el cuadro de códigos del MTC que cita el artículo "Telephone numbers in Peru" de Wikipedia. Si el MTC cambiara los códigos, hay que actualizar la constante `CODIGOS_AREA_PROVINCIA` (en `src/validators/reglas.js`) y el `CHECK` de la tabla `telefonos` con una nueva migración; una prueba verifica que ambas listas coincidan.

### T5. Tipo de teléfono
**Regla:** Se guarda el tipo de cada teléfono: `celular` o `fijo`. Como los formatos de T2, T3 y T4 no se superponen, el tipo se deduce del número.

**Porqué:** Permite mostrar el tipo en la ficha y saber, por ejemplo, si al número se le puede escribir por mensajería.

---

## Correo

### E1. Formato del correo
**Regla:** El correo debe tener un formato válido, como máximo 254 caracteres, y se guarda en minúsculas.

**Porqué:** Un correo mal escrito es un correo al que no se puede escribir. 254 caracteres es el largo máximo de una dirección según el estándar de correo (RFC 5321). En la práctica "Ana@Empresa.com" y "ana@empresa.com" son el mismo buzón; guardarlo en minúsculas evita duplicados que solo se diferencian en las mayúsculas.

---

## Foto

### F1. Formatos y tamaño
**Regla:** Solo se aceptan imágenes JPG, PNG o WebP, de 2 MB como máximo.

**Porqué:** Son formatos que todos los navegadores muestran. El límite de tamaño evita subidas lentas y que el disco se llene.

### F2. Validación por contenido
**Regla:** El tipo de imagen se valida por el contenido real del archivo, no por su extensión ni por el tipo que informa el navegador.

**Porqué:** La extensión y el tipo informado los controla quien sube el archivo y se pueden falsificar: un archivo cualquiera renombrado a `.jpg` pasaría el control.

### F3. Reprocesamiento y almacenamiento
**Regla:** Toda foto se reprocesa con sharp: se endereza según la orientación con que la guardó la cámara, se redimensiona a un máximo de 512 px (sin agrandar las más chicas), se convierte a WebP y se le eliminan los metadatos (EXIF, GPS). Se guarda con un nombre aleatorio en `storage/uploads/`, fuera de la carpeta pública, y solo se puede ver con la sesión iniciada. Al cambiar o quitar la foto, se borra el archivo de la anterior.

**Porqué:** Redimensionar ahorra espacio y acelera los listados. Convertir a un único formato simplifica mostrarlas. Los metadatos pueden revelar dónde y cuándo se tomó la foto; quitarlos protege la privacidad. Reprocesar además descarta cualquier contenido extra escondido en el archivo original. El nombre aleatorio impide adivinar las direcciones de otras fotos y evita usar el nombre original, que puede traer datos personales o caracteres peligrosos. Las fotos son datos personales, por eso se protegen igual que el resto de la información, y no se guardan copias de fotos que ya nadie ve. Enderezarla antes de quitar los metadatos evita que las fotos de celular aparezcan acostadas.

### F4. Límite de píxeles
**Regla:** Una foto puede tener como máximo 25 megapíxeles (por ejemplo, 5000 × 5000 píxeles). Una imagen más grande se rechaza aunque pese menos de 2 MB.

**Porqué:** Un archivo pequeño puede contener una imagen enorme. Una imagen "bomba", como un PNG de un solo color que pesa menos de 2 MB pero se descomprime en cientos de millones de píxeles, agotaría la memoria del servidor al procesarla. Una foto real de menos de 2 MB rara vez supera los 12 a 20 megapíxeles, así que el límite deja margen.

### F5. Quitar la foto pide confirmación
**Regla:** Quitar la foto pide confirmación en una página aparte, que muestra la foto y avisa que se borra para siempre. Solo se quita al confirmar; "Cancelar" vuelve al detalle sin cambiar nada. La confirmación funciona sin JavaScript. Cambiar la foto no pide confirmación.

**Porqué:** Quitar la foto borra su archivo (F3): a diferencia de archivar un contacto (C5), no se puede deshacer, y quizás no haya otra copia de esa foto. En la ficha, "Quitar foto" está en un menú junto a "Cambiar foto": sin confirmación, un clic equivocado costaría la foto, y la pérdida de datos es justamente lo que el sistema debe evitar. Se confirma igual que archivar, con una página propia, así también funciona sin JavaScript. Cambiar la foto no la pide porque ya exige elegir un archivo en el selector, un paso deliberado que no se da por accidente.

---

## Usuarios

### U1. Sin registro público
**Regla:** No existe registro público. Los usuarios se crean desde la consola con `npm run user:create`.

**Porqué:** Es un sistema interno de la empresa. Con un registro abierto, cualquier persona en internet podría crearse una cuenta y ver los contactos.

### U2. Contraseña
**Regla:** La contraseña tiene como mínimo 10 caracteres y como máximo 72 bytes, y se guarda como hash bcrypt, nunca en texto plano. 72 bytes equivalen a 72 caracteres sin tildes; las letras con tilde y la ñ ocupan 2 bytes y los emojis 4, así que con ellos caben menos caracteres. Una contraseña más larga se rechaza con un mensaje que explica el límite.

**Porqué:** La longitud es lo que más dificulta adivinar una contraseña. bcrypt es un algoritmo lento y con sal: si alguien obtuviera la base de datos, no podría recuperar las contraseñas con facilidad. El máximo existe porque bcrypt solo usa los primeros 72 bytes y descarta el resto sin avisar: dos contraseñas largas que empezaran igual servirían como si fueran la misma. Rechazarlas evita esa falsa sensación de seguridad.

### U3. Correo de usuario único
**Regla:** El correo de cada usuario es único, sin distinguir mayúsculas de minúsculas.

**Porqué:** El correo identifica al usuario al iniciar sesión; "Ana@empresa.com" y "ana@empresa.com" deben ser la misma cuenta.

### U4. Inicio y cierre de sesión
**Regla:** Si el correo o la contraseña no son correctos, el mensaje es siempre el mismo, "Correo o contraseña incorrectos", y la respuesta tarda lo mismo exista o no el correo. Al iniciar sesión, la sesión dura 30 días y se renueva con cada uso, así que solo vence después de 30 días sin entrar. Sobrevive a recargar la página, cerrar el navegador y reiniciar el servidor, y termina cuando la persona cierra sesión.

**Porqué:** Un mensaje distinto para un correo inexistente, o una respuesta más rápida en ese caso, permitiría averiguar qué correos tienen cuenta. Es un sistema de uso diario en las computadoras de la empresa: pedir la contraseña a cada rato llevaría a anotarla en un papel o a elegir una más corta. Cerrar sesión borra la sesión del servidor, así que una cookie copiada deja de servir.

### U5. Límite de intentos de inicio de sesión
**Regla:** Se permiten 5 intentos fallidos cada 8 minutos para cada combinación de IP y correo (el correo sin distinguir mayúsculas ni espacios), y 30 intentos fallidos cada 8 minutos por IP, sumando todos los correos. Al superar cualquiera de los dos límites, los intentos se rechazan, incluso con la contraseña correcta, hasta que termine la ventana de 8 minutos, con el mensaje "Demasiados intentos. Espera unos minutos e intenta de nuevo." Los inicios de sesión correctos no cuentan.

**Porqué:** Frena a quien intenta adivinar contraseñas probando muchas. Contar por IP y correo evita que, en una oficina donde todos salen a internet con la misma IP, los errores de una persona bloqueen a las demás; el tope por IP frena a quien prueba muchos correos distintos. La ventana es de 8 minutos, y no más larga, porque la contraseña mínima de 10 caracteres (U2) ya hace inviable la fuerza bruta incluso con unos 37 intentos por hora para un mismo correo; así, un empleado que se equivoca no queda bloqueado tanto tiempo. Los contadores se guardan en memoria y se reinician si se reinicia el servidor, lo que alcanza mientras haya un único servidor.

### U6. Sin roles
**Regla:** Todos los usuarios tienen los mismos permisos: pueden ver, crear, editar, archivar y restaurar cualquier contacto.

**Porqué:** Es una empresa pequeña en la que todo el personal trabaja con los mismos contactos; separar permisos hoy agregaría pasos y complejidad sin resolver un problema actual. La auditoría (A1) permite saber quién hizo cada cambio. Los roles quedan como mejora futura.

---

## Auditoría

### A1. Quién y cuándo
**Regla:** Cada contacto guarda quién lo creó, quién lo modificó por última vez y quién lo archivó, con la fecha y la hora de cada cosa, y el detalle del contacto lo muestra. Al crear un contacto, su última modificación es la creación. Cambiar o quitar la foto y restaurar el contacto cuentan como modificaciones; al restaurarlo se borra quién lo había archivado. Se guarda solo lo último, no el historial de cambios. Las fechas se guardan en UTC y se muestran en la hora de Perú. Un usuario que figura en la auditoría de algún contacto no se puede borrar de la base de datos.

**Porqué:** El cliente pierde datos y necesita saber quién cambió qué. Saber quién hizo el último cambio permite preguntarle a esa persona. Impedir que se borren esos usuarios evita que la auditoría quede apuntando a nadie. El historial completo queda como mejora futura.

---

## Búsqueda

### B1. Búsqueda de contactos
**Regla:** Se puede buscar por nombres, apellidos, DNI, teléfono o correo, y la lista se actualiza mientras se escribe; al borrar todo el texto vuelve la lista completa. Nombres, apellidos, DNI y teléfono se buscan por "empieza con": lo escrito debe ser el comienzo del dato (en nombres y apellidos, el comienzo de alguna de sus palabras; ver B2). El teléfono se puede escribir con cualquiera de los formatos de T1 a T4 (con espacios, guiones, paréntesis, `+51` o el 0 de provincia), pero desde su comienzo: un fijo de Lima, desde el 01, y uno de provincia, desde su código de área. El correo se busca por "contiene" (cualquier parte de la dirección) y solo cuando se escribieron al menos 3 caracteres. Por defecto solo se muestran los contactos activos; un filtro permite ver los archivados y otro filtra por tipo (C6), y los filtros se aplican apenas se cambian.

**Porqué:** Son los datos con los que el personal suele buscar a un contacto. Al buscar mientras se escribe, "empieza con" es lo más intuitivo: cada letra nueva acota la lista, como en la agenda de un celular, mientras que "contiene" con una sola letra trae casi todo. Por eso "4567" no encuentra el DNI 01234567, ni "234 5678" el fijo (01) 234 5678. En el correo sí se busca cualquier parte, para poder buscar por dominio ("empresa", "gmail"), pero desde 3 caracteres, porque con 1 o 2 coincidirían casi todos los correos. Buscar el teléfono tal como cada persona lo escribe evita tener que saber cómo está guardado. Los archivados no estorban en el trabajo diario, pero siguen siendo fáciles de encontrar para restaurarlos.

### B2. Sin tildes ni mayúsculas
**Regla:** La búsqueda por nombres y apellidos no distingue tildes, diéresis ni mayúsculas, y la ñ cuenta como n. Cada palabra escrita debe ser el comienzo de alguna palabra de los nombres o de los apellidos, en cualquier orden, y el guion y el apóstrofo también separan palabras. Así, "jose" encuentra a "José", "munoz" a "Muñoz", "ho" a "Hortensia" y a "de la Hoz" (pero no a "Ochoa"), "perez jo" a "José Pérez", y "plata" a "Rivas-Plata". El listado se ordena por apellidos y luego por nombres con el mismo criterio, así "Álvarez" queda en la A.

**Porqué:** Cada persona escribe los nombres a su manera, con o sin tildes, y no todos los teclados tienen ñ: la búsqueda no puede depender de eso. Separar también por guion y apóstrofo permite encontrar a "Rivas-Plata" por "plata" y a "O'Brien" por "brien". Sin esta regla, "Álvarez" quedaría al final de la lista, después de la Z. Tratar la ñ como n se aparta un poco del orden alfabético del español ("Muñoz" queda junto a "Munoz" y no después de todos los "Mun…"), a cambio de una búsqueda más tolerante. Las versiones sin tildes las calcula la propia base de datos, así nunca quedan desfasadas del nombre.

### B3. Paginación
**Regla:** El listado muestra 20 contactos por página, en el orden de B2. Al cambiar de página se conservan la búsqueda y los filtros.

**Porqué:** Una página corta carga rápido y se recorre de un vistazo; para encontrar a alguien en particular está la búsqueda. Conservar la búsqueda y los filtros evita escribirlos de nuevo en cada página.

---

## Mejoras futuras

Ideas que quedan fuera del alcance actual. Cada una cambia alguna de las reglas de arriba, así que se consulta antes de implementarla.

- **Roles y permisos** (U6): por ejemplo, que solo algunos usuarios puedan archivar o restaurar contactos.
- **Historial completo de auditoría** (A1): registrar cada cambio, con quién lo hizo, cuándo, el valor anterior y el nuevo, en lugar de guardar solo el último.
- **Letras de otros idiomas en los nombres** (C1, B2): aceptar ç, ö, è y otras. Requiere ampliar la validación y, con una migración nueva, las columnas de búsqueda sin tildes.
- **Importar contactos desde Excel o CSV:** para pasar al sistema las hojas de cálculo actuales. Cada fila tendría que cumplir las mismas reglas (en especial C2, para no importar duplicados), y el sistema tendría que informar qué filas no se importaron y por qué.
