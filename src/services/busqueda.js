// B2: texto sin tildes ni diéresis, en minúsculas y con la ñ como n ("Núñez" → "nunez").
//
// Se aplica a lo que se escribe en el buscador. Las columnas nombres_busqueda y apellidos_busqueda
// (migración 003) hacen lo mismo con los nombres guardados; tests/db.test.js verifica que ambas
// den el mismo resultado para cada letra que admite C1.
//
// NFD separa cada letra de su tilde ("á" → "a" + tilde combinable) y luego se quitan las marcas.
export function normalizarParaBusqueda(texto) {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}
