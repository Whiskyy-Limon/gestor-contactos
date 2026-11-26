import { Router } from 'express';
import { buscarContacto, crearContacto } from '../services/contactos.js';
import { MAXIMO_CORREOS_POR_CONTACTO, MAXIMO_TELEFONOS_POR_CONTACTO, TIPOS_CONTACTO } from '../validators/reglas.js';
import { ErrorDeValidacion, erroresPorCampo } from '../validators/validar.js';

// Id de la URL → entero positivo, o null si no tiene esa forma (y la ruta responde 404).
function leerId(texto) {
  if (!/^[1-9]\d{0,15}$/.test(texto)) {
    return null;
  }
  const id = Number(texto);
  return Number.isSafeInteger(id) ? id : null;
}

// Filas de un campo repetido para dibujar el formulario: siempre `cantidad` filas (C3), con lo que
// se escribió en las primeras y vacías el resto.
function filasDelFormulario(valor, cantidad) {
  const escritas = (Array.isArray(valor) ? valor : [valor]).filter((texto) => typeof texto === 'string');
  return Array.from({ length: cantidad }, (_, i) => escritas[i] ?? '');
}

// Valores para dibujar el formulario: vacíos, o lo que se escribió (sin normalizar, tal cual).
function valoresDelFormulario(cuerpo = {}) {
  const texto = (valor) => (typeof valor === 'string' ? valor : '');
  return {
    nombres: texto(cuerpo.nombres),
    apellidos: texto(cuerpo.apellidos),
    dni: texto(cuerpo.dni),
    tipo: texto(cuerpo.tipo),
    telefonos: filasDelFormulario(cuerpo.telefonos, MAXIMO_TELEFONOS_POR_CONTACTO),
    correos: filasDelFormulario(cuerpo.correos, MAXIMO_CORREOS_POR_CONTACTO),
  };
}

function mostrarFormulario(res, { estado = 200, valores, errores = {}, dniRepetido = null }) {
  res.status(estado).render('contactos/formulario', {
    titulo: 'Nuevo contacto',
    accion: '/contactos',
    tipos: TIPOS_CONTACTO,
    valores,
    errores,
    dniRepetido,
  });
}

// Rutas de contactos (todas requieren sesión: se registran después de requiereSesion).
export function crearRutasContactos(db) {
  const router = Router();

  router.get('/contactos/nuevo', (req, res) => {
    mostrarFormulario(res, { valores: valoresDelFormulario() });
  });

  router.post('/contactos', (req, res) => {
    try {
      const id = crearContacto(db, req.body ?? {}, req.usuario.id);
      req.session.aviso = 'Contacto creado.';
      res.redirect(303, `/contactos/${id}`);
    } catch (error) {
      if (!(error instanceof ErrorDeValidacion)) {
        throw error;
      }
      // Se vuelve a mostrar el formulario con lo escrito y cada mensaje junto a su campo.
      mostrarFormulario(res, {
        estado: 400,
        valores: valoresDelFormulario(req.body),
        errores: erroresPorCampo(error.errores),
        dniRepetido: error.errores.find((e) => e.contacto)?.contacto ?? null,
      });
    }
  });

  router.get('/contactos/:id', (req, res, next) => {
    const id = leerId(req.params.id);
    const contacto = id === null ? null : buscarContacto(db, id);
    if (!contacto) {
      return next(); // página no encontrada
    }
    res.render('contactos/detalle', { titulo: `${contacto.nombres} ${contacto.apellidos}`, contacto });
  });

  return router;
}
