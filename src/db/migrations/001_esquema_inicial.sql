-- Esquema inicial: usuarios, contactos, telefonos y correos.
-- Aplica las reglas de docs/REGLAS-NEGOCIO.md que SQLite puede verificar.
-- El resto (letras permitidas en nombres, formato completo del correo,
-- "al menos 1 teléfono y 1 correo") se valida en el servidor con zod.
-- Fechas: texto ISO 8601 en UTC, por ejemplo 2026-11-25T14:30:00Z.

CREATE TABLE usuarios (
  id              INTEGER PRIMARY KEY,
  nombre          TEXT    NOT NULL CHECK (length(nombre) BETWEEN 2 AND 100),
  correo          TEXT    NOT NULL UNIQUE COLLATE NOCASE           -- U3
                          CHECK (length(correo) <= 254),
  password_hash   TEXT    NOT NULL
                          CHECK (password_hash GLOB '$2[aby]$*'),  -- U2: solo hashes bcrypt
  creado_en       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  actualizado_en  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
) STRICT;

CREATE TABLE contactos (
  id              INTEGER PRIMARY KEY,
  nombres         TEXT    NOT NULL CHECK (                         -- C1
                    length(nombres) BETWEEN 2 AND 60
                    AND nombres = trim(nombres)
                    AND instr(nombres, '  ') = 0
                  ),
  apellidos       TEXT    NOT NULL CHECK (                         -- C1
                    length(apellidos) BETWEEN 2 AND 60
                    AND apellidos = trim(apellidos)
                    AND instr(apellidos, '  ') = 0
                  ),
  dni             TEXT    NOT NULL UNIQUE CHECK (                  -- C2
                    length(dni) = 8 AND dni NOT GLOB '*[^0-9]*'
                  ),
  foto            TEXT    UNIQUE CHECK (                           -- F3: 32 hex + .webp; NULL = sin foto
                    foto IS NULL OR (
                      length(foto) = 37
                      AND foto GLOB '*.webp'
                      AND substr(foto, 1, 32) NOT GLOB '*[^0-9a-f]*'
                    )
                  ),
  creado_por      INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE RESTRICT,
  creado_en       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  actualizado_en  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  archivado_en    TEXT                                             -- C5: NULL = activo
) STRICT;

CREATE TABLE telefonos (
  id           INTEGER PRIMARY KEY,
  contacto_id  INTEGER NOT NULL REFERENCES contactos (id) ON DELETE CASCADE,
  numero       TEXT    NOT NULL CHECK (numero NOT GLOB '*[^0-9]*'),   -- T1: solo dígitos
  tipo         TEXT    NOT NULL CHECK (tipo IN ('celular', 'fijo')),  -- T5
  UNIQUE (contacto_id, numero),                                       -- C3
  CHECK (                                                             -- T2, T3, T4
       (tipo = 'celular' AND length(numero) = 9 AND numero GLOB '9*')
    OR (tipo = 'fijo'    AND length(numero) = 9 AND numero GLOB '01*')
    OR (tipo = 'fijo'    AND length(numero) = 8 AND substr(numero, 1, 2) IN (
          -- Misma lista que CODIGOS_AREA_PROVINCIA en src/validators/reglas.js
          '41', '42', '43', '44',
          '51', '52', '53', '54', '56',
          '61', '62', '63', '64', '65', '66', '67',
          '72', '73', '74', '76',
          '82', '83', '84'
        ))
  )
) STRICT;

CREATE TABLE correos (
  id           INTEGER PRIMARY KEY,
  contacto_id  INTEGER NOT NULL REFERENCES contactos (id) ON DELETE CASCADE,
  correo       TEXT    NOT NULL CHECK (                               -- E1
                 length(correo) <= 254
                 AND correo = lower(correo)
                 AND correo = trim(correo)
                 AND instr(correo, '@') > 1
               ),
  UNIQUE (contacto_id, correo)                                        -- C3
) STRICT;

-- C3: máximo 5 teléfonos y 5 correos por contacto
-- (mismo valor que MAXIMO_TELEFONOS_POR_CONTACTO y MAXIMO_CORREOS_POR_CONTACTO).
CREATE TRIGGER telefonos_maximo_5
BEFORE INSERT ON telefonos
WHEN (SELECT count(*) FROM telefonos WHERE contacto_id = NEW.contacto_id) >= 5
BEGIN
  SELECT RAISE(ABORT, 'Un contacto no puede tener más de 5 teléfonos');
END;

CREATE TRIGGER correos_maximo_5
BEFORE INSERT ON correos
WHEN (SELECT count(*) FROM correos WHERE contacto_id = NEW.contacto_id) >= 5
BEGIN
  SELECT RAISE(ABORT, 'Un contacto no puede tener más de 5 correos');
END;

-- Listado por defecto (B1): contactos activos ordenados por apellidos y nombres.
CREATE INDEX contactos_activos_por_nombre
  ON contactos (apellidos, nombres) WHERE archivado_en IS NULL;

-- Búsqueda por teléfono y por correo. La búsqueda por DNI usa el índice que crea UNIQUE.
CREATE INDEX telefonos_por_numero ON telefonos (numero);
CREATE INDEX correos_por_correo   ON correos (correo);

-- Índice de la clave foránea creado_por.
CREATE INDEX contactos_por_creador ON contactos (creado_por);
