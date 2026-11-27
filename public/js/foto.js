// Menú de la foto en la ficha del contacto (C4, F1).
//
// El avatar abre un menú (<details>) con "Cambiar foto" y "Quitar foto". Sin JavaScript el menú
// muestra el campo del archivo y un botón para enviarlo. Con este script, "Cambiar foto" abre el
// selector de archivos y la foto se envía apenas se elige, con una vista previa mientras sube.
// El menú se cierra con Escape, con un clic fuera o cuando el foco pasa a otra parte de la página.
// El servidor valida todo de nuevo (peso, formato, tamaño): aquí solo se adelanta el aviso del peso.
// Es un archivo aparte (módulo ES) porque la Content-Security-Policy no permite scripts en línea.

// Lógica del menú, sin tocar la página. Recibe sus dependencias, así se prueba en Node sin
// navegador (tests/foto-menu.test.js).
//   maximoBytes, mensajePeso  peso máximo de la foto (F1) y el mensaje si se pasa
//   menuAbierto() → boolean;  abrirMenu();  cerrarMenu()
//   devolverFoco()            pone el foco en el avatar (el botón que abre el menú)
//   abrirSelector()           abre el selector de archivos
//   limpiarSeleccion()        vacía el campo del archivo
//   mostrarError(mensaje);  limpiarError()
//   leerVistaPrevia(archivo) → Promise<url>  rechaza si el navegador no puede mostrar la imagen
//   mostrarVistaPrevia(url)   pone la imagen elegida en el avatar
//   enviar()                  envía el formulario de la foto
//   alCambiarEstado(subiendo) avisa cuando empieza la subida
// Devuelve { elegir, alElegirArchivo, alPresionarTecla, alHacerClic, alSalirElFoco, estaSubiendo }.
export function crearMenuFoto({
  maximoBytes,
  mensajePeso,
  menuAbierto,
  abrirMenu,
  cerrarMenu,
  devolverFoco,
  abrirSelector,
  limpiarSeleccion,
  mostrarError,
  limpiarError,
  leerVistaPrevia,
  mostrarVistaPrevia,
  enviar,
  alCambiarEstado = () => {},
}) {
  let subiendo = false;

  // "Cambiar foto": abre el selector. Mientras sube una foto no se elige otra.
  function elegir() {
    if (!subiendo) {
      abrirSelector();
    }
  }

  // Se eligió un archivo (o se canceló el selector: `archivo` vacío). Devuelve la promesa de la
  // vista previa, que no detiene el envío.
  function alElegirArchivo(archivo) {
    if (subiendo || !archivo) {
      return undefined;
    }
    if (archivo.size > maximoBytes) {
      // F1: se avisa sin enviarla; el menú queda abierto con el mensaje para elegir otra.
      limpiarSeleccion();
      mostrarError(mensajePeso);
      abrirMenu();
      return undefined;
    }
    subiendo = true;
    limpiarError();
    cerrarMenu();
    devolverFoco();
    alCambiarEstado(true);
    const vistaPrevia = leerVistaPrevia(archivo).then(mostrarVistaPrevia, () => {
      // Si el navegador no puede mostrarla, queda la foto anterior; el servidor dirá qué pasó.
    });
    enviar();
    return vistaPrevia;
  }

  // Escape cierra el menú; si el foco estaba dentro, vuelve al avatar. Devuelve si la usó.
  function alPresionarTecla(tecla, { focoDentro }) {
    if (tecla !== 'Escape' || !menuAbierto()) {
      return false;
    }
    cerrarMenu();
    if (focoDentro) {
      devolverFoco();
    }
    return true;
  }

  // Un clic fuera del menú lo cierra.
  function alHacerClic({ dentro }) {
    if (!dentro && menuAbierto()) {
      cerrarMenu();
    }
  }

  // El foco pasó a otra parte de la página (con Tab, por ejemplo): se cierra. Si no hay destino
  // (la ventana perdió el foco, o se abrió el selector de archivos), queda como está.
  function alSalirElFoco({ hayDestino, destinoDentro }) {
    if (hayDestino && !destinoDentro && menuAbierto()) {
      cerrarMenu();
    }
  }

  return { elegir, alElegirArchivo, alPresionarTecla, alHacerClic, alSalirElFoco, estaSubiendo: () => subiendo };
}

// Lee el archivo como data: URL (la CSP permite imágenes data:, no blob:) y comprueba que el
// navegador pueda mostrarlo.
function leerComoImagen(archivo) {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.addEventListener('error', rechazar);
    lector.addEventListener('load', () => {
      const imagen = new Image();
      imagen.addEventListener('error', rechazar);
      imagen.addEventListener('load', () => resolver(lector.result));
      imagen.src = lector.result;
    });
    lector.readAsDataURL(archivo);
  });
}

// Conecta la lógica con el menú de la ficha.
function iniciar(documento) {
  const menu = documento.querySelector('[data-foto-menu]');
  if (!menu) {
    return;
  }
  const boton = menu.querySelector('summary');
  const formulario = menu.querySelector('[data-foto-formulario]');
  const campo = menu.querySelector('[data-foto-archivo]');
  const error = menu.querySelector('[data-foto-error]');
  const estado = documento.querySelector('[data-foto-estado]');

  // Con JavaScript, el campo y su botón sobran: "Cambiar foto" abre el selector y envía sola.
  for (const elemento of menu.querySelectorAll('[data-foto-sin-js]')) elemento.hidden = true;
  for (const elemento of menu.querySelectorAll('[data-foto-con-js]')) elemento.hidden = false;

  const logica = crearMenuFoto({
    maximoBytes: Number(menu.dataset.maximoBytes),
    mensajePeso: menu.dataset.mensajePeso,
    menuAbierto: () => menu.open,
    abrirMenu: () => {
      menu.open = true;
    },
    cerrarMenu: () => {
      menu.open = false;
    },
    devolverFoco: () => boton.focus(),
    abrirSelector: () => campo.click(),
    limpiarSeleccion: () => {
      campo.value = '';
    },
    mostrarError: (mensaje) => {
      error.textContent = mensaje;
      error.hidden = false;
    },
    limpiarError: () => {
      error.textContent = '';
      error.hidden = true;
    },
    leerVistaPrevia: leerComoImagen,
    mostrarVistaPrevia: (url) => {
      // La imagen elegida reemplaza al avatar (foto o iniciales) mientras sube.
      const imagen = documento.createElement('img');
      imagen.className = 'avatar avatar--foto avatar--grande';
      imagen.alt = '';
      imagen.src = url;
      boton.querySelector('.avatar').replaceWith(imagen);
    },
    enviar: () => formulario.requestSubmit(),
    alCambiarEstado: (subiendo) => {
      menu.classList.toggle('foto-menu--subiendo', subiendo);
      estado.textContent = subiendo ? 'Subiendo la foto…' : '';
    },
  });

  menu.querySelector('[data-foto-elegir]').addEventListener('click', () => logica.elegir());
  campo.addEventListener('change', () => logica.alElegirArchivo(campo.files[0]));

  // Mientras sube, el avatar no vuelve a abrir el menú.
  boton.addEventListener('click', (evento) => {
    if (logica.estaSubiendo()) {
      evento.preventDefault();
    }
  });

  documento.addEventListener('keydown', (evento) => {
    if (logica.alPresionarTecla(evento.key, { focoDentro: menu.contains(documento.activeElement) })) {
      evento.preventDefault();
    }
  });
  documento.addEventListener('click', (evento) => logica.alHacerClic({ dentro: menu.contains(evento.target) }));
  menu.addEventListener('focusout', (evento) => {
    logica.alSalirElFoco({ hayDestino: evento.relatedTarget !== null, destinoDentro: menu.contains(evento.relatedTarget) });
  });

  // Si el navegador vuelve a esta página desde su caché (botón "Atrás" después de subir), la
  // recarga: si no, quedaría la vista previa y "subiendo" de antes.
  window.addEventListener('pageshow', (evento) => {
    if (evento.persisted && logica.estaSubiendo()) {
      window.location.reload();
    }
  });
}

if (typeof document !== 'undefined') {
  iniciar(document);
}
