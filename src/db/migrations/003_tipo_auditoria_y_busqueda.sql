-- Tipo de contacto (C6), auditoría (A1), ediciones simultáneas (C7) y búsqueda sin tildes (B2).
--
-- Se usa ALTER TABLE ... ADD COLUMN y no se reconstruye la tabla: reconstruirla obliga a borrar
-- `contactos`, y con las claves foráneas activas ese borrado dispara el ON DELETE CASCADE y elimina
-- los teléfonos y correos (las claves foráneas no se pueden desactivar dentro de la transacción
-- del migrador).
--
-- Supone que la tabla contactos está vacía: hasta esta migración no había forma de crear contactos.
-- Si tuviera filas, SQLite rechaza los CHECK nuevos de tipo y actualizado_por, y el migrador deshace
-- toda la migración sin cambiar nada.

-- C6: tipo obligatorio. SQLite exige un DEFAULT para agregar una columna NOT NULL; el '' no pasa
-- el CHECK, así que todo INSERT tiene que indicar el tipo.
-- Misma lista que TIPOS_CONTACTO en src/validators/reglas.js.
ALTER TABLE contactos ADD COLUMN tipo TEXT NOT NULL DEFAULT ''
  CHECK (tipo IN ('cliente', 'proveedor', 'ambos'));

-- A1: quién modificó por última vez (al crear, el mismo usuario que creó) y quién archivó.
-- Una columna con REFERENCES solo se puede agregar con DEFAULT NULL; el CHECK la hace obligatoria.
ALTER TABLE contactos ADD COLUMN actualizado_por INTEGER REFERENCES usuarios (id) ON DELETE RESTRICT
  CHECK (actualizado_por IS NOT NULL);

-- A1 y C5: un contacto se archiva con fecha y autor, o no tiene ninguno de los dos.
ALTER TABLE contactos ADD COLUMN archivado_por INTEGER REFERENCES usuarios (id) ON DELETE RESTRICT
  CHECK ((archivado_en IS NULL) = (archivado_por IS NULL));

-- C7: número de versión. Cada modificación lo aumenta en 1; al guardar una edición se exige que
-- siga siendo el mismo que se leyó al abrir el formulario.
ALTER TABLE contactos ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1);

-- B2: nombres y apellidos sin tildes ni mayúsculas, con la ñ como n. Son columnas generadas:
-- las calcula SQLite a partir del nombre, así que nunca quedan desfasadas.
-- lower() de SQLite solo convierte letras ASCII; por eso antes se reemplazan las letras de C1 que
-- no son ASCII (LETRAS_NO_ASCII_NOMBRE en src/validators/reglas.js). tests/db.test.js verifica
-- que el resultado coincida con normalizarParaBusqueda() de src/services/busqueda.js.
ALTER TABLE contactos ADD COLUMN nombres_busqueda TEXT GENERATED ALWAYS AS (
  lower(replace(replace(replace(replace(replace(replace(replace(
        replace(replace(replace(replace(replace(replace(replace(nombres,
    'á', 'a'), 'é', 'e'), 'í', 'i'), 'ó', 'o'), 'ú', 'u'), 'ü', 'u'), 'ñ', 'n'),
    'Á', 'a'), 'É', 'e'), 'Í', 'i'), 'Ó', 'o'), 'Ú', 'u'), 'Ü', 'u'), 'Ñ', 'n'))
) VIRTUAL;

ALTER TABLE contactos ADD COLUMN apellidos_busqueda TEXT GENERATED ALWAYS AS (
  lower(replace(replace(replace(replace(replace(replace(replace(
        replace(replace(replace(replace(replace(replace(replace(apellidos,
    'á', 'a'), 'é', 'e'), 'í', 'i'), 'ó', 'o'), 'ú', 'u'), 'ü', 'u'), 'ñ', 'n'),
    'Á', 'a'), 'É', 'e'), 'Í', 'i'), 'Ó', 'o'), 'Ú', 'u'), 'Ü', 'u'), 'Ñ', 'n'))
) VIRTUAL;

-- B2 y B3: el listado de activos se ordena por las columnas sin tildes. Reemplaza al índice de la
-- migración 001, que ordenaba por apellidos y nombres tal como se escribieron.
DROP INDEX contactos_activos_por_nombre;
CREATE INDEX contactos_activos_por_nombre
  ON contactos (apellidos_busqueda, nombres_busqueda) WHERE archivado_en IS NULL;

-- Índices de las claves foráneas nuevas (como contactos_por_creador en 001).
CREATE INDEX contactos_por_editor     ON contactos (actualizado_por);
CREATE INDEX contactos_por_archivador ON contactos (archivado_por);
