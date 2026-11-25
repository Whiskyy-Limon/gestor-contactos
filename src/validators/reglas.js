// Constantes de las reglas de negocio (docs/REGLAS-NEGOCIO.md) que usan los validadores.
//
// La base de datos tiene su propia copia de estos valores en los CHECK y triggers de las
// migraciones. Si cambias alguno, crea una migración nueva que actualice la base de datos;
// tests/db.test.js verifica que ambos coincidan.

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
