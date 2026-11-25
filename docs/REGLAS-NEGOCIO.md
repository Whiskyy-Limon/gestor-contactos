# Reglas de negocio — Gestor de contactos

Este documento reúne las reglas que el sistema debe cumplir y el motivo de cada una. Son decisiones del responsable del proyecto: cualquier cambio se consulta antes de aplicarse.

Todas las reglas se validan en el servidor. Cuando la base de datos puede verificar una regla (`NOT NULL`, `UNIQUE`, `CHECK`, `FOREIGN KEY`), también se aplica ahí, como segunda barrera.

Cada regla tiene un código (C1, T2, …) para poder citarla en el código, las pruebas y los commits.

---

## Contacto

### C1. Nombres y apellidos
**Regla:** Nombres y apellidos son obligatorios. Cada campo tiene entre 2 y 60 caracteres y solo admite letras (incluidas las vocales con tilde, la ñ y la ü), espacios, apóstrofo (`'`) y guion (`-`). Antes de guardar se quitan los espacios del inicio y del final, y los espacios dobles se reducen a uno.

**Porqué:** Los nombres reales llevan tildes, ñ y ü, y hay apellidos compuestos ("De la Cruz", "Rivas-Plata") o con apóstrofo ("O'Brien"); la regla los acepta y rechaza números y símbolos, que casi siempre son errores de tipeo. Normalizar los espacios evita que "Ana  María" y "Ana María" se vean como datos distintos.

### C2. DNI
**Regla:** El DNI es obligatorio y tiene exactamente 8 dígitos. Es único en todo el sistema, incluidos los contactos archivados. Si se intenta registrar un DNI que pertenece a un contacto archivado, el mensaje debe indicarlo y ofrecer restaurar ese contacto.

**Porqué:** El principal problema del cliente son los duplicados, y el DNI identifica a cada persona de forma única. Los archivados también cuentan porque archivar no es borrar: aceptar de nuevo ese DNI crearía un duplicado del contacto archivado. Ofrecer restaurarlo recupera los datos que ya existen en vez de cargarlos otra vez. El DNI se guarda como texto para no perder los ceros a la izquierda.

### C3. Teléfonos y correos del contacto
**Regla:** Cada contacto tiene al menos 1 teléfono y al menos 1 correo, y como máximo 5 de cada uno. Dentro de un mismo contacto no se repite un teléfono ni un correo.

**Porqué:** Un contacto sin forma de comunicarse no le sirve a la empresa. El máximo mantiene la ficha legible y evita cargas abusivas. Repetir un dato dentro de la misma ficha no aporta nada y ensucia la información. La restricción es por contacto: dos contactos distintos sí pueden compartir un teléfono o un correo (por ejemplo, la central de una empresa).

### C4. Foto
**Regla:** La foto es opcional. Si un contacto no tiene foto, se muestra un avatar con sus iniciales.

**Porqué:** No siempre se tiene una foto del contacto. Las iniciales permiten reconocerlo de un vistazo en los listados sin exigir una imagen.

### C5. Eliminar es archivar
**Regla:** Eliminar un contacto significa archivarlo: no se borra de la base de datos, deja de aparecer en el listado normal y se puede restaurar.

**Porqué:** Hoy el cliente pierde datos. Archivar permite deshacer un error y conserva toda la información, junto con la fecha en que se archivó.

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
**Regla:** Toda foto se reprocesa con sharp: se redimensiona a un máximo de 512 px, se convierte a WebP y se le eliminan los metadatos (EXIF, GPS). Se guarda con un nombre aleatorio en `storage/uploads/`, fuera de la carpeta pública, y solo se puede ver con la sesión iniciada.

**Porqué:** Redimensionar ahorra espacio y acelera los listados. Convertir a un único formato simplifica mostrarlas. Los metadatos pueden revelar dónde y cuándo se tomó la foto; quitarlos protege la privacidad. Reprocesar además descarta cualquier contenido extra escondido en el archivo original. El nombre aleatorio impide adivinar las direcciones de otras fotos y evita usar el nombre original, que puede traer datos personales o caracteres peligrosos. Las fotos son datos personales, por eso se protegen igual que el resto de la información.

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

---

## Búsqueda

### B1. Búsqueda de contactos
**Regla:** Se puede buscar por nombres, apellidos, DNI, teléfono o correo. Por defecto solo se muestran los contactos activos; un filtro permite ver los archivados.

**Porqué:** Son los datos con los que el personal suele buscar a un contacto. Los archivados no estorban en el trabajo diario, pero siguen siendo fáciles de encontrar para restaurarlos.
