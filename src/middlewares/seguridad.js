import helmet from 'helmet';

// Cabeceras de seguridad con helmet. Parte de sus valores por defecto y los endurece:
// - Sin scripts ni estilos en línea: todo JavaScript y CSS sale de archivos propios ('self').
// - frame-ancestors 'none' y X-Frame-Options DENY: nadie puede mostrar la app dentro de un iframe.
// - HSTS y upgrade-insecure-requests solo en producción: en http://localhost estorban.
export function cabecerasDeSeguridad({ produccion }) {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'"],
        'img-src': ["'self'", 'data:'],
        'font-src': ["'self'"],
        'connect-src': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'upgrade-insecure-requests': produccion ? [] : null,
      },
    },
    strictTransportSecurity: produccion ? { maxAge: 180 * 24 * 60 * 60, includeSubDomains: true } : false,
    xFrameOptions: { action: 'deny' },
  });
}

// Las páginas dinámicas no se guardan en la caché del navegador ni de un proxy:
// - tienen datos personales, que no deben quedar en el disco ni verse con "Atrás" después de
//   cerrar sesión;
// - llevan el token CSRF de la sesión, y una copia vieja daría error 403 al enviar el formulario.
// Los archivos estáticos se atienden antes de este middleware, así que siguen guardándose en caché.
export function sinCache(req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}
