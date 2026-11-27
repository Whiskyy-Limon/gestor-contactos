import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import {
  MAXIMO_INTENTOS_FALLIDOS_POR_CORREO,
  MAXIMO_INTENTOS_FALLIDOS_POR_IP,
  MAXIMO_VISITAS_LOGIN_POR_IP,
  VENTANA_INTENTOS_LOGIN_MS,
  VENTANA_VISITAS_LOGIN_MS,
} from '../validators/reglas.js';

// U5: límite de intentos fallidos de inicio de sesión. Son dos contadores:
// - por IP y correo: si una persona se equivoca, solo se bloquea su correo, no el resto de la
//   oficina que sale a internet con la misma IP;
// - por IP, más alto: frena a quien prueba muchos correos distintos.
// Los intentos correctos no cuentan (skipSuccessfulRequests: una respuesta < 400 se descuenta).
// Los contadores viven en memoria: se reinician al reiniciar el servidor.
//
// Orden: primero el contador por IP y correo, después el por IP. express-rate-limit suma el
// intento antes de decidir y no descuenta un 429; si el contador por IP fuera primero, cada
// reintento de un correo ya bloqueado sumaría al tope de la IP, y una sola persona que insiste
// terminaría bloqueando a toda la oficina. Así, un correo bloqueado corta la cadena antes de
// llegar al contador por IP.

function correoNormalizado(req) {
  const correo = req.body?.correo;
  return typeof correo === 'string' ? correo.trim().toLowerCase() : '';
}

// `alBloquear(req, res)` responde cuando se superó un límite.
export function crearLimitesLogin({ alBloquear }) {
  const comunes = {
    windowMs: VENTANA_INTENTOS_LOGIN_MS,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) => alBloquear(req, res),
  };

  const porIp = rateLimit({ ...comunes, limit: MAXIMO_INTENTOS_FALLIDOS_POR_IP });

  const porIpYCorreo = rateLimit({
    ...comunes,
    limit: MAXIMO_INTENTOS_FALLIDOS_POR_CORREO,
    // ipKeyGenerator agrupa las IPv6 por subred (/56), como el contador por IP.
    keyGenerator: (req) => `${ipKeyGenerator(req.ip)}|${correoNormalizado(req)}`,
  });

  return [porIpYCorreo, porIp];
}

const MENSAJE_DEMASIADAS_VISITAS =
  'Demasiadas visitas desde esta conexión. Espera unos minutos e intenta de nuevo.';

// U7: límite de visitas al formulario de login (GET /login) por IP. Cada visita sin sesión guarda
// una sesión anónima en la base de datos (la del token CSRF); sin límite, alguien sin cuenta podría
// crear filas sin fin hasta llenar el disco. Cuenta todas las visitas, no solo las fallidas.
// Al superarlo responde con la página de error genérica, que no tiene formulario: no crea sesión.
export function crearLimiteVisitasLogin() {
  return rateLimit({
    windowMs: VENTANA_VISITAS_LOGIN_MS,
    limit: MAXIMO_VISITAS_LOGIN_POR_IP,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res, next) => {
      const error = new Error('Límite de visitas a /login superado');
      error.status = 429;
      error.mensajePublico = MENSAJE_DEMASIADAS_VISITAS;
      next(error);
    },
  });
}
