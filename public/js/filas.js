// Filas de teléfonos y de correos del formulario de contacto (C3).
//
// Sin JavaScript se ven todas las filas de cada grupo y las vacías se ignoran al guardar. Con
// JavaScript se muestran solo las filas con datos (al menos una), un botón "Agregar" para mostrar
// la siguiente y un botón "Quitar" en cada fila. Es un archivo aparte porque la
// Content-Security-Policy no permite scripts en línea.

for (const grupo of document.querySelectorAll('[data-filas]')) {
  prepararGrupo(grupo);
}

function prepararGrupo(grupo) {
  const filas = [...grupo.querySelectorAll('[data-fila]')];
  const campos = filas.map((fila) => fila.querySelector('input'));

  const agregar = document.createElement('button');
  agregar.type = 'button';
  agregar.className = 'boton boton--secundario';
  agregar.textContent = grupo.dataset.textoAgregar;
  agregar.addEventListener('click', () => {
    const siguiente = filas.find((fila) => fila.hidden);
    if (siguiente) {
      siguiente.hidden = false;
      siguiente.querySelector('input').focus();
    }
    actualizarBotonAgregar();
  });
  grupo.append(agregar);

  filas.forEach((fila, indice) => {
    const quitar = document.createElement('button');
    quitar.type = 'button';
    quitar.className = 'boton boton--secundario boton--quitar';
    quitar.textContent = 'Quitar';
    quitar.setAttribute('aria-label', `Quitar ${fila.querySelector('label').textContent}`);
    quitar.addEventListener('click', () => quitarFila(indice));
    fila.append(quitar);
  });

  // Quedan visibles las filas hasta la última que tenga datos o un error (como mínimo, la primera).
  // Las visibles siempre son las primeras: "Agregar" muestra la siguiente y "Quitar" oculta la última.
  let ultimaConDatos = 0;
  filas.forEach((fila, indice) => {
    if (campos[indice].value.trim() !== '' || fila.querySelector('.campo__error')) {
      ultimaConDatos = indice;
    }
  });
  filas.forEach((fila, indice) => {
    fila.hidden = indice > ultimaConDatos;
  });
  actualizarBotonAgregar();

  function cantidadVisibles() {
    return filas.filter((fila) => !fila.hidden).length;
  }

  // Quitar una fila sube los valores de las siguientes, así las filas visibles siguen siendo
  // "Teléfono 1", "Teléfono 2"… sin huecos, y se oculta la última. Si es la única, solo se vacía.
  function quitarFila(indice) {
    const visibles = cantidadVisibles();
    for (let i = indice; i < visibles - 1; i++) {
      campos[i].value = campos[i + 1].value;
    }
    campos[visibles - 1].value = '';
    if (visibles > 1) {
      filas[visibles - 1].hidden = true;
    }
    // Los mensajes de error de las filas ya no corresponden a los valores que se movieron.
    limpiarErroresDeFilas();
    campos[Math.min(indice, cantidadVisibles() - 1)].focus();
    actualizarBotonAgregar();
  }

  function limpiarErroresDeFilas() {
    filas.forEach((fila, indice) => {
      fila.querySelector('.campo__error')?.remove();
      campos[indice].removeAttribute('aria-invalid');
      campos[indice].removeAttribute('aria-describedby');
    });
  }

  function actualizarBotonAgregar() {
    agregar.hidden = filas.every((fila) => !fila.hidden);
  }
}
