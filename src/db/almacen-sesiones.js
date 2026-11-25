import session from 'express-session';

const UN_DIA_MS = 24 * 60 * 60 * 1000;
const QUINCE_MINUTOS_MS = 15 * 60 * 1000;

function sinOperacion() {}

// Milisegundos (desde 1970) en que vence la sesión. Si la cookie no tiene vencimiento
// (cookie de sesión del navegador), se guarda un día como máximo.
function calcularExpiracion(sesion) {
  const expira = sesion?.cookie?.expires;
  return expira ? new Date(expira).getTime() : Date.now() + UN_DIA_MS;
}

// Almacén de sesiones de express-session sobre better-sqlite3 (tabla `sesiones`, migración 002).
//
// express-session usa callbacks y better-sqlite3 es síncrono. Cada método hace su trabajo dentro
// de un try y llama al callback FUERA del try: si el callback lanzara un error, el catch no debe
// atraparlo y volver a llamar al callback, porque express-session terminaría la petición dos veces.
export class AlmacenSesionesSqlite extends session.Store {
  #consultas;
  #temporizador;

  constructor(db, { intervaloLimpiezaMs = QUINCE_MINUTOS_MS } = {}) {
    super();

    this.#consultas = {
      obtener: db.prepare('SELECT datos FROM sesiones WHERE sid = ? AND expira_en > ?'),
      guardar: db.prepare(`
        INSERT INTO sesiones (sid, datos, expira_en) VALUES (?, ?, ?)
        ON CONFLICT (sid) DO UPDATE SET datos = excluded.datos, expira_en = excluded.expira_en
      `),
      renovar: db.prepare('UPDATE sesiones SET expira_en = ? WHERE sid = ? AND expira_en > ?'),
      borrar: db.prepare('DELETE FROM sesiones WHERE sid = ?'),
      borrarExpiradas: db.prepare('DELETE FROM sesiones WHERE expira_en <= ?'),
    };

    this.borrarExpiradas();
    this.#temporizador = setInterval(() => {
      try {
        this.borrarExpiradas();
      } catch (error) {
        console.error('No se pudieron borrar las sesiones expiradas:', error);
      }
    }, intervaloLimpiezaMs);
    // El temporizador no impide que el proceso termine (pruebas, scripts).
    this.#temporizador.unref();
  }

  // Devuelve la sesión guardada, o null si no existe o ya venció.
  get(sid, callback = sinOperacion) {
    let sesion;
    try {
      const fila = this.#consultas.obtener.get(sid, Date.now());
      sesion = fila ? JSON.parse(fila.datos) : null;
    } catch (error) {
      return callback(error);
    }
    callback(null, sesion);
  }

  // Crea o reemplaza la sesión.
  set(sid, sesion, callback = sinOperacion) {
    try {
      this.#consultas.guardar.run(sid, JSON.stringify(sesion), calcularExpiracion(sesion));
    } catch (error) {
      return callback(error);
    }
    callback(null);
  }

  // Renueva el vencimiento sin reescribir los datos. express-session lo usa con `rolling`
  // cuando la sesión no cambió. No revive una sesión que ya venció.
  touch(sid, sesion, callback = sinOperacion) {
    try {
      this.#consultas.renovar.run(calcularExpiracion(sesion), sid, Date.now());
    } catch (error) {
      return callback(error);
    }
    callback(null);
  }

  // Borra la sesión (cierre de sesión o regeneración del id).
  destroy(sid, callback = sinOperacion) {
    try {
      this.#consultas.borrar.run(sid);
    } catch (error) {
      return callback(error);
    }
    callback(null);
  }

  // Borra las sesiones vencidas y devuelve cuántas borró.
  borrarExpiradas() {
    return this.#consultas.borrarExpiradas.run(Date.now()).changes;
  }

  // Detiene la limpieza periódica. Llamarlo antes de cerrar la base de datos.
  cerrar() {
    clearInterval(this.#temporizador);
  }
}
