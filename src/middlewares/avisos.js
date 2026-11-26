// Mensajes de una sola vez, como "Contacto creado.": la ruta guarda el texto en req.session.aviso
// antes de redirigir, y la página siguiente lo muestra (partials/cabecera.ejs) y lo borra.
export function avisos(req, res, next) {
  res.locals.aviso = null;
  if (req.session?.aviso) {
    res.locals.aviso = req.session.aviso;
    delete req.session.aviso;
  }
  next();
}
