// Páginas de error genéricas. Nunca se muestra el stack ni el mensaje interno de un error:
// el detalle completo solo se registra en el servidor.

const MENSAJES_POR_ESTADO = {
  400: 'La solicitud no es válida.',
  403: 'No tienes permiso para realizar esta acción.',
  404: 'La página que buscas no existe.',
  413: 'Los datos enviados son demasiado grandes.',
};
const MENSAJE_ERROR_INTERNO = 'Ocurrió un error inesperado. Intenta de nuevo en unos minutos.';

function renderizarError(res, estado, mensaje, registrarError) {
  res.status(estado).render('error', { titulo: estado === 404 ? 'Página no encontrada' : 'Error', mensaje }, (error, html) => {
    if (error) {
      // Si falla la propia plantilla de error, se responde texto plano (sin detalles).
      registrarError(error);
      res.type('text/plain').send(mensaje);
      return;
    }
    res.send(html);
  });
}

export function noEncontrado(registrarError) {
  return (req, res) => renderizarError(res, 404, MENSAJES_POR_ESTADO[404], registrarError);
}

// `error.status` (o statusCode) indica un error del cliente (4xx). Nuestro código puede agregar
// `error.mensajePublico` con un texto en español; el resto de los mensajes nunca se muestra.
export function manejarErrores(registrarError) {
  // Express reconoce el manejador de errores porque declara 4 parámetros (aunque no use `next`).
  return (error, req, res, next) => {
    const estadoPedido = error.status ?? error.statusCode;
    const esErrorDelCliente = Number.isInteger(estadoPedido) && estadoPedido >= 400 && estadoPedido < 500;
    const estado = esErrorDelCliente ? estadoPedido : 500;

    if (!esErrorDelCliente) {
      registrarError(error);
    }
    if (res.headersSent) {
      // La respuesta ya empezó a enviarse: lo único posible es cortar la conexión.
      return req.socket.destroy();
    }

    const mensaje = esErrorDelCliente
      ? (error.mensajePublico ?? MENSAJES_POR_ESTADO[estado] ?? MENSAJES_POR_ESTADO[400])
      : MENSAJE_ERROR_INTERNO;
    renderizarError(res, estado, mensaje, registrarError);
  };
}
