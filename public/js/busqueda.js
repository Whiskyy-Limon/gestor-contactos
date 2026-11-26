// Búsqueda en vivo del listado de contactos (B1).
//
// Mientras se escribe, la lista se actualiza sola: se espera ESPERA_MS después de la última tecla
// y se piden los resultados a /contactos/resultados, que devuelve el HTML ya armado y escapado por
// el servidor (la misma vista que la página completa). Aquí nunca se arma HTML con datos.
// Sin JavaScript, el formulario funciona igual con el botón "Buscar" o con Enter.
// Es un archivo aparte (módulo ES) porque la Content-Security-Policy no permite scripts en línea.

export const ESPERA_MS = 300;

// Lógica de la búsqueda en vivo, sin tocar la página. Recibe sus dependencias, así se prueba en
// Node sin navegador (tests/busqueda-en-vivo.test.js).
//   consultaActual       consulta que ya se muestra ("q=ana&tipo=&estado=activos"): no se repite
//   pedir(url, signal)   → Promise<{ ok, redirected, html }> (en la página: fetch)
//   aplicar(html)        muestra los resultados recibidos
//   navegar(url)         carga la página completa (si algo sale mal)
//   alCambiarEstado(ocupado)  avisa cuando empieza y termina una consulta
//   temporizador         objeto con setTimeout y clearTimeout
// Devuelve { programar(consulta), buscar(consulta) }:
//   programar: al escribir; consulta cuando pasa ESPERA_MS sin cambios.
//   buscar: al cambiar un filtro o con Enter; consulta enseguida.
export function crearBusquedaEnVivo({
  consultaActual = null,
  pedir,
  aplicar,
  navegar,
  alCambiarEstado = () => {},
  esperaMs = ESPERA_MS,
  temporizador = globalThis,
}) {
  let espera = null;
  let controlador = null; // AbortController de la consulta en curso
  let ultimaConsulta = consultaActual;

  function cancelarEspera() {
    if (espera !== null) {
      temporizador.clearTimeout(espera);
      espera = null;
    }
  }

  function programar(consulta) {
    cancelarEspera();
    espera = temporizador.setTimeout(() => {
      espera = null;
      buscar(consulta);
    }, esperaMs);
  }

  async function buscar(consulta) {
    cancelarEspera();
    if (consulta === ultimaConsulta) {
      return; // ya se muestra (o ya se pidió) esta misma consulta
    }
    ultimaConsulta = consulta;

    // Una consulta nueva cancela la anterior: su respuesta ya no sirve.
    controlador?.abort();
    const propio = new AbortController();
    controlador = propio;
    alCambiarEstado(true);

    try {
      const respuesta = await pedir(`/contactos/resultados?${consulta}`, propio.signal);
      if (propio !== controlador) {
        return; // llegó tarde: mientras tanto se pidió otra consulta
      }
      if (!respuesta.ok || respuesta.redirected) {
        // Error del servidor o sesión vencida (redirigida al login): se carga la página completa,
        // que muestra el error o el login.
        navegar(`/contactos?${consulta}`);
        return;
      }
      aplicar(respuesta.html);
    } catch (error) {
      if (error.name !== 'AbortError' && propio === controlador) {
        navegar(`/contactos?${consulta}`); // falló la red: se intenta con la página completa
      }
    } finally {
      if (propio === controlador) {
        controlador = null;
        alCambiarEstado(false);
      }
    }
  }

  return { programar, buscar };
}

// Conecta la lógica con el formulario y la lista de la página del listado.
function iniciar(documento) {
  const formulario = documento.querySelector('[data-busqueda-en-vivo]');
  if (!formulario) {
    return;
  }
  const contenedor = documento.getElementById(formulario.dataset.busquedaEnVivo);
  const anuncio = documento.querySelector('[data-anuncio-busqueda]');
  const tituloListado = documento.querySelector('[data-titulo-listado]');

  // Con JavaScript, el botón sobra: la lista se actualiza sola.
  formulario.querySelector('[data-boton-buscar]').hidden = true;

  // Consulta del formulario, con el texto sin espacios alrededor ("jose " busca lo mismo que "jose").
  function consultaDelFormulario() {
    const parametros = new URLSearchParams(new FormData(formulario));
    parametros.set('q', (parametros.get('q') ?? '').trim());
    return parametros.toString();
  }

  const busqueda = crearBusquedaEnVivo({
    consultaActual: consultaDelFormulario(),
    pedir: async (url, signal) => {
      const respuesta = await fetch(url, { signal, headers: { Accept: 'text/html' } });
      return { ok: respuesta.ok, redirected: respuesta.redirected, html: await respuesta.text() };
    },
    aplicar: (html) => {
      contenedor.innerHTML = html; // HTML del servidor, ya escapado
      const { url, titulo, anuncio: texto } = contenedor.firstElementChild.dataset;
      history.replaceState(null, '', url); // al recargar o compartir, se mantiene la búsqueda
      tituloListado.textContent = titulo;
      documento.title = `${titulo} · Gestor de contactos`;
      anuncio.textContent = texto;
    },
    navegar: (url) => window.location.assign(url),
    alCambiarEstado: (ocupado) => contenedor.setAttribute('aria-busy', String(ocupado)),
  });

  formulario.addEventListener('input', (evento) => {
    if (evento.target.name === 'q') {
      busqueda.programar(consultaDelFormulario());
    }
  });
  formulario.addEventListener('change', (evento) => {
    if (evento.target.tagName === 'SELECT') {
      busqueda.buscar(consultaDelFormulario());
    }
  });
  // Enter: consulta enseguida, sin recargar la página.
  formulario.addEventListener('submit', (evento) => {
    evento.preventDefault();
    busqueda.buscar(consultaDelFormulario());
  });
}

if (typeof document !== 'undefined') {
  iniciar(document);
}
