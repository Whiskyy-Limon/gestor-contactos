import { Router } from 'express';
import { verificarCsrf } from '../middlewares/csrf.js';
import { MENSAJE_FOTO_PESADA, recibirFoto } from '../middlewares/subida-foto.js';
import { listarContactos } from '../services/busqueda.js';
import { ErrorDeFoto, cambiarFoto, quitarFoto } from '../services/fotos.js';
import {
  ConflictoDeEdicion,
  archivarContacto,
  buscarContacto,
  crearContacto,
  editarContacto,
  restaurarContacto,
} from '../services/contactos.js';
import { esquemaFiltrosListado } from '../validators/contactos.js';
import {
  MAXIMO_BYTES_FOTO,
  MAXIMO_CARACTERES_BUSQUEDA,
  MAXIMO_CORREOS_POR_CONTACTO,
  MAXIMO_TELEFONOS_POR_CONTACTO,
  TIPOS_CONTACTO,
} from '../validators/reglas.js';
import { formatearTelefono } from '../validators/telefonos.js';
import { ErrorDeValidacion, erroresPorCampo } from '../validators/validar.js';

// Rutas con formulario multipart: quedan fuera de la verificación CSRF global (src/app.js) y la
// hacen ellas mismas con verificarCsrf, después de que multer lee el cuerpo (ver middlewares/csrf.js).
export const RUTAS_MULTIPART = Object.freeze([{ metodo: 'POST', patron: /^\/contactos\/[^/]+\/foto$/ }]);

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

// Valores para el formulario de edición: lo guardado, con los teléfonos en su formato habitual.
function valoresDelContacto(contacto) {
  return {
    nombres: contacto.nombres,
    apellidos: contacto.apellidos,
    dni: contacto.dni,
    tipo: contacto.tipo,
    telefonos: filasDelFormulario(
      contacto.telefonos.map(({ numero, tipo }) => formatearTelefono(numero, tipo)),
      MAXIMO_TELEFONOS_POR_CONTACTO,
    ),
    correos: filasDelFormulario(contacto.correos, MAXIMO_CORREOS_POR_CONTACTO),
  };
}

// Formulario de contacto, para crear (sin contactoId) o para editar (con contactoId y version).
//   errores      { campo: mensaje } de la validación
//   dniRepetido  { id, nombre, archivado } del contacto que ya tiene el DNI (C2)
//   conflicto    { motivo, por, en } si la edición no se guardó (C7, C5)
function mostrarFormulario(
  res,
  { estado = 200, contactoId = null, version = null, valores, errores = {}, dniRepetido = null, conflicto = null },
) {
  const editando = contactoId !== null;
  res.status(estado).render('contactos/formulario', {
    titulo: editando ? 'Editar contacto' : 'Nuevo contacto',
    accion: editando ? `/contactos/${contactoId}/editar` : '/contactos',
    textoBoton: editando ? 'Guardar cambios' : 'Guardar contacto',
    cancelar: editando ? `/contactos/${contactoId}` : '/contactos',
    contactoId,
    version,
    tipos: TIPOS_CONTACTO,
    valores,
    errores,
    dniRepetido,
    // C2: al registrar un DNI de un contacto archivado se ofrece restaurarlo. Al editar otro
    // contacto no: restaurar ese no resuelve la edición en curso.
    ofrecerRestaurar: !editando,
    conflicto,
  });
}

// Datos de un ErrorDeValidacion para volver a mostrar el formulario.
function datosDelError(error) {
  return {
    errores: erroresPorCampo(error.errores),
    dniRepetido: error.errores.find((e) => e.contacto)?.contacto ?? null,
  };
}

// Detalle del contacto. `errorFoto`: mensaje junto al formulario de la foto (F1–F4).
// El peso máximo y su mensaje van a la página para que el navegador avise antes de enviar (F1);
// el servidor lo vuelve a verificar igual.
function mostrarDetalle(res, contacto, { estado = 200, errorFoto = null } = {}) {
  res.status(estado).render('contactos/detalle', {
    titulo: `${contacto.nombres} ${contacto.apellidos}`,
    contacto,
    errorFoto,
    maximoBytesFoto: MAXIMO_BYTES_FOTO,
    mensajeFotoPesada: MENSAJE_FOTO_PESADA,
  });
}

// Rutas de contactos (todas requieren sesión: se registran después de requiereSesion).
//   carpetaFotos    dónde se guardan las fotos
//   registrarError  dónde se registra un error que no corta la respuesta (por ejemplo, no poder
//                   borrar el archivo de la foto anterior)
export function crearRutasContactos(db, { carpetaFotos, registrarError }) {
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
      mostrarFormulario(res, { estado: 400, valores: valoresDelFormulario(req.body), ...datosDelError(error) });
    }
  });

  // Contacto de la URL, o null si el id no tiene la forma correcta o no existe (→ 404).
  function contactoDeLaRuta(req) {
    const id = leerId(req.params.id);
    return id === null ? null : buscarContacto(db, id);
  }

  router.get('/contactos/:id', (req, res, next) => {
    const contacto = contactoDeLaRuta(req);
    if (!contacto) {
      return next(); // página no encontrada
    }
    mostrarDetalle(res, contacto);
  });

  // Corta antes de leer el cuerpo si el contacto no existe (→ 404): no se recibe una foto en vano.
  function exigirContacto(req, res, next) {
    const id = leerId(req.params.id);
    next(id !== null && buscarContacto(db, id) ? undefined : 'route');
  }

  // C4, F1–F4: cambiar la foto. Orden: multer lee el formulario (en memoria) → se verifica el token
  // CSRF → se valida y reprocesa la imagen → archivo → base de datos.
  router.post('/contactos/:id/foto', exigirContacto, recibirFoto, verificarCsrf, async (req, res) => {
    const contacto = contactoDeLaRuta(req);
    if (req.errorDeSubida) {
      return mostrarDetalle(res, contacto, { estado: req.errorDeSubida.estado, errorFoto: req.errorDeSubida.mensaje });
    }
    if (!req.file) {
      return mostrarDetalle(res, contacto, { estado: 400, errorFoto: 'Elige una foto.' });
    }
    try {
      await cambiarFoto(db, {
        carpeta: carpetaFotos,
        contactoId: contacto.id,
        contenido: req.file.buffer,
        usuarioId: req.usuario.id,
        registrarError,
      });
    } catch (error) {
      if (error instanceof ErrorDeFoto) {
        return mostrarDetalle(res, contacto, { estado: 400, errorFoto: error.message });
      }
      if (error instanceof ConflictoDeEdicion) {
        req.session.aviso = 'Este contacto está archivado: restáuralo para cambiar la foto.';
        return res.redirect(303, `/contactos/${contacto.id}`);
      }
      throw error;
    }
    req.session.aviso = 'Foto actualizada.';
    res.redirect(303, `/contactos/${contacto.id}`);
  });

  // C4: quitar la foto (formulario normal, con la verificación CSRF global).
  router.post('/contactos/:id/foto/quitar', async (req, res, next) => {
    const id = leerId(req.params.id);
    if (id === null) {
      return next();
    }
    try {
      const quitada = await quitarFoto(db, { carpeta: carpetaFotos, contactoId: id, usuarioId: req.usuario.id, registrarError });
      req.session.aviso = quitada ? 'Foto quitada.' : 'El contacto no tenía foto.';
    } catch (error) {
      if (!(error instanceof ConflictoDeEdicion)) {
        throw error;
      }
      req.session.aviso = 'Este contacto está archivado: restáuralo para cambiar la foto.';
    }
    res.redirect(303, `/contactos/${id}`);
  });

  // Editar (C7). Un contacto archivado no se edita (C5): se vuelve a su detalle, que ofrece restaurarlo.
  router.get('/contactos/:id/editar', (req, res, next) => {
    const contacto = contactoDeLaRuta(req);
    if (!contacto) {
      return next();
    }
    if (contacto.archivado) {
      req.session.aviso = 'Este contacto está archivado: restáuralo para poder editarlo.';
      return res.redirect(302, `/contactos/${contacto.id}`);
    }
    mostrarFormulario(res, {
      contactoId: contacto.id,
      version: contacto.version,
      valores: valoresDelContacto(contacto),
    });
  });

  router.post('/contactos/:id/editar', (req, res, next) => {
    const contacto = contactoDeLaRuta(req);
    if (!contacto) {
      return next();
    }
    try {
      editarContacto(db, contacto.id, req.body ?? {}, req.usuario.id);
      req.session.aviso = 'Cambios guardados.';
      res.redirect(303, `/contactos/${contacto.id}`);
    } catch (error) {
      // En los dos casos se vuelve a mostrar lo que se escribió, para no perderlo.
      const comun = { contactoId: contacto.id, valores: valoresDelFormulario(req.body) };
      if (error instanceof ErrorDeValidacion) {
        return mostrarFormulario(res, { ...comun, estado: 400, version: req.body?.version, ...datosDelError(error) });
      }
      if (error instanceof ConflictoDeEdicion) {
        // C7: el formulario lleva ahora la versión guardada; si se vuelve a guardar, la reemplaza
        // a sabiendas.
        return mostrarFormulario(res, {
          ...comun,
          estado: 409,
          version: error.actual.version,
          conflicto: { motivo: error.motivo, por: error.actual.por, en: error.actual.en },
        });
      }
      throw error;
    }
  });

  // Archivar (C5): primero una página de confirmación; el POST archiva.
  router.get('/contactos/:id/archivar', (req, res, next) => {
    const contacto = contactoDeLaRuta(req);
    if (!contacto) {
      return next();
    }
    if (contacto.archivado) {
      return res.redirect(302, `/contactos/${contacto.id}`);
    }
    res.render('contactos/archivar', { titulo: 'Archivar contacto', contacto });
  });

  router.post('/contactos/:id/archivar', (req, res, next) => {
    const id = leerId(req.params.id);
    if (id === null) {
      return next();
    }
    const archivado = archivarContacto(db, id, req.usuario.id);
    req.session.aviso = archivado ? 'Contacto archivado.' : 'El contacto ya estaba archivado.';
    res.redirect(303, `/contactos/${id}`);
  });

  // Restaurar (C5): sin confirmación, porque solo deshace el archivado.
  router.post('/contactos/:id/restaurar', (req, res, next) => {
    const id = leerId(req.params.id);
    if (id === null) {
      return next();
    }
    const restaurado = restaurarContacto(db, id, req.usuario.id);
    req.session.aviso = restaurado ? 'Contacto restaurado.' : 'El contacto no estaba archivado.';
    res.redirect(303, `/contactos/${id}`);
  });

  return router;
}
