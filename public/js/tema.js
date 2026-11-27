// Botón del modo claro/oscuro (partials/pie.ejs), en todas las páginas.
//
// La primera vez la página sigue el modo del sistema. Al hacer clic se cambia de modo y la elección
// se guarda en este navegador (localStorage); se aplica con el atributo data-tema de <html>, y
// estilos.css elige los colores según ese atributo o, sin él, según el sistema. Al cargar una
// página, el modo guardado ya lo aplicó public/js/tema-inicial.js en el <head>, para que no
// parpadee; este módulo se ejecuta después de leer la página y se encarga del botón.
// Sin JavaScript, el botón queda oculto y la página sigue el modo del sistema.
// Es un archivo aparte (módulo ES) porque la Content-Security-Policy no permite scripts en línea.

export const CLAVE_TEMA = 'tema';
const MODOS = ['claro', 'oscuro'];

// El modo guardado si es válido ('claro' u 'oscuro'); si no, null (se sigue al sistema).
export function modoValido(valor) {
  return MODOS.includes(valor) ? valor : null;
}

// Valor de <meta name="color-scheme"> para un modo elegido (null: el del sistema).
export function colorSchemeDe(modo) {
  if (modo === 'oscuro') {
    return 'dark';
  }
  if (modo === 'claro') {
    return 'light';
  }
  return 'light dark';
}

// Texto del botón para lectores de pantalla: dice lo que hace, no el modo actual.
export function textoDelBoton(modo) {
  return modo === 'oscuro' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
}

// Lógica del botón, sin tocar la página. Recibe sus dependencias, así se prueba en Node sin
// navegador (tests/tema.test.js).
//   guardado         lo guardado en el navegador al cargar la página (cualquier valor: se valida)
//   guardar(modo)    guarda la elección (puede fallar: el cambio igual se aplica en esta página)
//   sistemaOscuro()  true si el sistema está en modo oscuro
//   aplicar(modo)    pone data-tema en <html> (null: lo quita y la página sigue al sistema)
//   mostrar(modo)    muestra en el botón el modo actual (ícono y texto)
// Devuelve { iniciar, alternar, alCambiarSistema, alCambiarGuardado(valor) }.
export function crearTema({ guardado, guardar, sistemaOscuro, aplicar, mostrar }) {
  let elegido = modoValido(guardado); // null: sin elección, sigue al sistema

  const modoActual = () => elegido ?? (sistemaOscuro() ? 'oscuro' : 'claro');

  function iniciar() {
    aplicar(elegido);
    mostrar(modoActual());
  }

  // Clic en el botón: el modo contrario al que se ve, y desde ahora queda elegido.
  function alternar() {
    elegido = modoActual() === 'oscuro' ? 'claro' : 'oscuro';
    try {
      guardar(elegido);
    } catch {
      // Sin almacenamiento (por ejemplo, con las cookies bloqueadas): vale solo para esta página.
    }
    aplicar(elegido);
    mostrar(elegido);
  }

  // El sistema cambió de modo. Sin elección, la página ya lo sigue sola (CSS); falta el botón.
  function alCambiarSistema() {
    if (elegido === null) {
      mostrar(modoActual());
    }
  }

  // Lo guardado cambió en otra pestaña (o al volver a esta página con "Atrás").
  function alCambiarGuardado(valor) {
    elegido = modoValido(valor);
    aplicar(elegido);
    mostrar(modoActual());
  }

  return { iniciar, alternar, alCambiarSistema, alCambiarGuardado };
}

// Lee lo guardado; si el navegador no deja leer el almacenamiento, null.
function leerGuardado(ventana) {
  try {
    return ventana.localStorage.getItem(CLAVE_TEMA);
  } catch {
    return null;
  }
}

// Conecta la lógica con el botón y la página.
function iniciar(documento, ventana) {
  const boton = documento.querySelector('[data-tema-boton]');
  // Un navegador sin light-dark() (anterior a 2024) usa el respaldo de estilos.css, siempre en
  // modo claro: el botón no tendría efecto, así que queda oculto.
  if (!boton || !ventana.CSS?.supports('color', 'light-dark(#000, #fff)')) {
    return;
  }
  const texto = boton.querySelector('[data-tema-texto]');
  const raiz = documento.documentElement;
  const meta = documento.querySelector('meta[name="color-scheme"]');
  const sistema = ventana.matchMedia('(prefers-color-scheme: dark)');

  const tema = crearTema({
    guardado: leerGuardado(ventana),
    guardar: (modo) => ventana.localStorage.setItem(CLAVE_TEMA, modo),
    sistemaOscuro: () => sistema.matches,
    aplicar: (modo) => {
      if (modo) {
        raiz.dataset.tema = modo;
      } else {
        delete raiz.dataset.tema;
      }
      meta?.setAttribute('content', colorSchemeDe(modo));
    },
    mostrar: (modo) => {
      boton.dataset.modo = modo; // estilos.css dibuja la luna o el sol
      texto.textContent = textoDelBoton(modo);
      boton.title = textoDelBoton(modo);
    },
  });

  tema.iniciar();
  boton.hidden = false;
  boton.addEventListener('click', () => tema.alternar());
  sistema.addEventListener('change', () => tema.alCambiarSistema());
  ventana.addEventListener('storage', (evento) => {
    // key null: se borró todo lo guardado del sitio.
    if (evento.key === CLAVE_TEMA || evento.key === null) {
      tema.alCambiarGuardado(leerGuardado(ventana));
    }
  });
  // Al volver con "Atrás", el navegador puede mostrar la página tal como quedó, sin cargarla de nuevo.
  ventana.addEventListener('pageshow', (evento) => {
    if (evento.persisted) {
      tema.alCambiarGuardado(leerGuardado(ventana));
    }
  });
}

if (typeof document !== 'undefined') {
  iniciar(document, window);
}
