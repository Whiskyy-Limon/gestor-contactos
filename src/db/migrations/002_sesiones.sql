-- Sesiones de express-session. Las administra src/db/almacen-sesiones.js.
-- expira_en es una excepción a la convención de fechas en texto ISO: es una marca técnica,
-- no una fecha del negocio, y se compara en cada petición con Date.now() (milisegundos).

CREATE TABLE sesiones (
  sid        TEXT    PRIMARY KEY,
  datos      TEXT    NOT NULL CHECK (json_valid(datos)),  -- la sesión serializada en JSON
  expira_en  INTEGER NOT NULL                             -- milisegundos desde 1970 (Date.now())
) STRICT;

-- Para borrar rápido las sesiones expiradas.
CREATE INDEX sesiones_por_expiracion ON sesiones (expira_en);
