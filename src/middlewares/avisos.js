// Mensajes de una sola vez, como "Contacto creado.": la ruta guarda el texto en req.session.aviso
// antes de redirigir, y la próxima página completa lo muestra y lo borra (partials/cabecera.ejs
// llama a tomarAviso()). Se consume recién al dibujar la cabecera: una redirección o un fragmento
// de la búsqueda en vivo, que no la dibujan, no se lo llevan sin mostrarlo.
export function avisos(req, res, next) {
  res.locals.tomarAviso = () => {
    const aviso = req.session?.aviso ?? null;
    if (aviso !== null) {
      delete req.session.aviso;
    }
    return aviso;
  };
  next();
}
