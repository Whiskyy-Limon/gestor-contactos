// Aplica el modo claro u oscuro elegido con el botón del modo (public/js/tema.js) antes de que la
// página se dibuje por primera vez, para que no parpadee.
//
// Es un script clásico (sin defer, async ni type="module") en el <head>, antes de la hoja de
// estilos (partials/cabecera.ejs): el navegador detiene la lectura de la página hasta ejecutarlo y
// no dibuja nada antes de terminar el <head>, así que la página aparece ya con el modo elegido.
// Por eso es corto y no depende de nada. Es el único script del <head>; los demás son módulos, que
// se ejecutan después de leer la página. Es un archivo aparte porque la Content-Security-Policy
// no permite scripts en línea.
//
// Sin elección guardada, o si el navegador no deja leer el almacenamiento, no hace nada: la página
// sigue el modo del sistema. La clave y los valores son los de tema.js (CLAVE_TEMA, colorSchemeDe);
// tests/tema.test.js verifica que coincidan.
{
  let tema = null;
  try {
    tema = localStorage.getItem('tema');
  } catch {
    // Almacenamiento bloqueado (por ejemplo, con las cookies desactivadas): modo del sistema.
  }
  if (tema === 'claro' || tema === 'oscuro') {
    document.documentElement.dataset.tema = tema;
    // También el fondo que pinta el navegador antes de que lleguen los estilos.
    document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', tema === 'oscuro' ? 'dark' : 'light');
  }
}
