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
