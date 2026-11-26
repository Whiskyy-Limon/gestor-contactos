import { Router } from 'express';
import { listarContactos } from '../services/busqueda.js';
import { buscarContacto, crearContacto } from '../services/contactos.js';
import { esquemaFiltrosListado } from '../validators/contactos.js';
import {
  MAXIMO_CARACTERES_BUSQUEDA,
  MAXIMO_CORREOS_POR_CONTACTO,
  MAXIMO_TELEFONOS_POR_CONTACTO,
  TIPOS_CONTACTO,
} from '../validators/reglas.js';
import { ErrorDeValidacion, erroresPorCampo } from '../validators/validar.js';

// B3: dirección del listado con estos filtros. Omite los valores por defecto, así la dirección
// queda corta: /contactos, /contactos?q=perez&pagina=2.
function urlDelListado({ q, tipo, estado, pagina }) {
  const parametros = new URLSearchParams();
  if (q) parametros.set('q', q);
  if (tipo) parametros.set('tipo', tipo);
  if (estado !== 'activos') parametros.set('estado', estado);
  if (pagina > 1) parametros.set('pagina', String(pagina));
  const consulta = parametros.toString();
  return consulta ? `/contactos?${consulta}` : '/contactos';
}

// Texto que se anuncia a los lectores de pantalla después de una búsqueda en vivo.
function anuncioDeResultados(total) {
  if (total === 0) return 'No se encontraron contactos.';
  if (total === 1) return '1 contacto encontrado.';
  return `${total} contactos encontrados.`;
}

// Datos de las vistas del listado (página completa y fragmento de resultados) a partir de los
// parámetros de la dirección (B1–B3).
function datosDelListado(db, consulta) {
  const filtros = esquemaFiltrosListado.parse(consulta);
  const resultado = listarContactos(db, filtros);
  const actuales = { ...filtros, pagina: resultado.pagina };

  return {
    titulo: filtros.estado === 'archivados' ? 'Contactos archivados' : 'Contactos',
    filtros: actuales,
    resultado,
    maximoBusqueda: MAXIMO_CARACTERES_BUSQUEDA,
    hayFiltros: filtros.q !== '' || filtros.tipo !== '',
    // Dirección canónica de esta búsqueda: el navegador la pone en la barra de direcciones.
    urlActual: urlDelListado(actuales),
    anuncio: anuncioDeResultados(resultado.total),
    // Enlace a otra página conservando la búsqueda y los filtros (B3).
    enlace: (cambios) => urlDelListado({ ...actuales, ...cambios }),
  };
}

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

  // B1–B3: listado con búsqueda, filtros y paginación (página completa).
  router.get('/contactos', (req, res) => {
    res.render('contactos/listado', datosDelListado(db, req.query));
  });

  // Solo los resultados, para la búsqueda en vivo (public/js/busqueda.js): el mismo HTML que la
  // página completa, armado y escapado en el servidor. Va antes de /contactos/:id.
  router.get('/contactos/resultados', (req, res) => {
    res.render('contactos/resultados', datosDelListado(db, req.query));
  });

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
