// Constantes de las reglas de negocio (docs/REGLAS-NEGOCIO.md) que usan los validadores.
//
// Algunos de estos valores (códigos de área, máximos por contacto, tipos de contacto y letras con
// tilde) también están en los CHECK, triggers y columnas generadas de las migraciones. Si cambias
// uno de ellos, crea una migración nueva que actualice la base de datos; tests/db.test.js verifica
// que ambos coincidan.

// C1: largo de nombres y de apellidos, en caracteres.
export const MINIMO_CARACTERES_NOMBRE = 2;
export const MAXIMO_CARACTERES_NOMBRE = 60;

// C2: dígitos del DNI.
export const LARGO_DNI = 8;

// E1: largo máximo de un correo (RFC 5321).
export const MAXIMO_CARACTERES_CORREO = 254;

// C1: letras de nombres y apellidos que no son ASCII (además de a–z y A–Z).
// Las columnas nombres_busqueda y apellidos_busqueda (migración 003) les quitan la tilde
// exactamente a estas letras (B2).
export const LETRAS_NO_ASCII_NOMBRE = 'áéíóúüñÁÉÍÓÚÜÑ';

// C6: tipos de contacto.
export const TIPOS_CONTACTO = Object.freeze(['cliente', 'proveedor', 'ambos']);

// F1, F2: formatos de foto aceptados (según el contenido real) y tamaño máximo del archivo.
export const FORMATOS_FOTO = Object.freeze(['jpeg', 'png', 'webp']);
export const MAXIMO_BYTES_FOTO = 2 * 1024 * 1024;

// F4: píxeles máximos de una foto (25 megapíxeles, por ejemplo 5000 × 5000).
export const MAXIMO_PIXELES_FOTO = 25_000_000;

// F3: lado mayor de la foto ya reprocesada, en píxeles.
export const LADO_MAXIMO_FOTO = 512;

// B3: contactos por página del listado.
export const CONTACTOS_POR_PAGINA = 20;

// B1, B2: límites de lo que se escribe en el buscador, para acotar la consulta.
export const MAXIMO_CARACTERES_BUSQUEDA = 100;
export const MAXIMO_PALABRAS_BUSQUEDA = 5;

// B1: el correo se busca por "contiene" solo desde esta cantidad de caracteres (con menos, casi
// todos los correos coincidirían).
export const MINIMO_CARACTERES_BUSQUEDA_CORREO = 3;

// T4: códigos de área de la telefonía fija de provincia (Perú), uno por departamento.
export const CODIGOS_AREA_PROVINCIA = Object.freeze([
  '41', '42', '43', '44',
  '51', '52', '53', '54', '56',
  '61', '62', '63', '64', '65', '66', '67',
  '72', '73', '74', '76',
  '82', '83', '84',
]);

// C3: máximo de teléfonos y de correos por contacto.
export const MAXIMO_TELEFONOS_POR_CONTACTO = 5;
export const MAXIMO_CORREOS_POR_CONTACTO = 5;

// U2: largo de la contraseña. El máximo se mide en bytes UTF-8 porque bcrypt
// solo usa los primeros 72 bytes y descarta el resto sin avisar.
export const MINIMO_CARACTERES_PASSWORD = 10;
export const MAXIMO_BYTES_PASSWORD = 72;

// U5: intentos fallidos de inicio de sesión permitidos por ventana de tiempo.
export const VENTANA_INTENTOS_LOGIN_MS = 8 * 60 * 1000;
export const MAXIMO_INTENTOS_FALLIDOS_POR_CORREO = 5; // por cada combinación de IP y correo
export const MAXIMO_INTENTOS_FALLIDOS_POR_IP = 30; // por IP, sumando todos los correos
