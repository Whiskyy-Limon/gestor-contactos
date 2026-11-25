// Constantes de las reglas de negocio (docs/REGLAS-NEGOCIO.md) que usan los validadores.
//
// Algunos de estos valores (códigos de área y máximos por contacto) también están en los CHECK
// y triggers de las migraciones. Si cambias uno de ellos, crea una migración nueva que actualice
// la base de datos; tests/db.test.js verifica que ambos coincidan.

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
