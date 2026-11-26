// Pruebas de la interpretación y el formato de los teléfonos de Perú (T1–T5).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CODIGOS_AREA_PROVINCIA } from '../src/validators/reglas.js';
import { formatearTelefono, normalizarTelefono } from '../src/validators/telefonos.js';

describe('teléfonos (T1–T5)', () => {
  describe('normalizarTelefono', () => {
    const validos = [
      ['987654321', '987654321', 'celular', 'un celular (T2)'],
      ['987 654 321', '987654321', 'celular', 'un celular con espacios (T1)'],
      ['987-654-321', '987654321', 'celular', 'un celular con guiones (T1)'],
      ['  987 654 321  ', '987654321', 'celular', 'un celular con espacios alrededor'],
      ['+51 987 654 321', '987654321', 'celular', 'un celular con +51 (T2)'],
      ['(+51) 987-654-321', '987654321', 'celular', 'un celular con (+51) (T2)'],
      ['51987654321', '987654321', 'celular', 'un celular con 51 sin el + (T2)'],
      ['01 234 5678', '012345678', 'fijo', 'un fijo de Lima (T3)'],
      ['(01) 234-5678', '012345678', 'fijo', 'un fijo de Lima con paréntesis y guion (T3)'],
      ['(044) 123456', '44123456', 'fijo', 'un fijo de provincia con el 0 inicial (T4)'],
      ['044-123456', '44123456', 'fijo', 'un fijo de provincia con el 0 y guion (T4)'],
      ['44 123456', '44123456', 'fijo', 'un fijo de provincia sin el 0 (T4)'],
      ['51 123456', '51123456', 'fijo', 'un fijo de Puno: ahí el 51 es el código de área, no el prefijo'],
      ['(051) 123456', '51123456', 'fijo', 'un fijo de Puno con el 0 inicial'],
    ];
    for (const [escrito, numero, tipo, descripcion] of validos) {
      it(`acepta ${descripcion}: ${JSON.stringify(escrito)} → ${numero} (${tipo})`, () => {
        assert.deepEqual(normalizarTelefono(escrito), { valido: true, numero, tipo });
      });
    }

    const invalidos = [
      ['98765432', /celular tiene 9 dígitos/, 'un celular de 8 dígitos'],
      ['9876543210', /celular tiene 9 dígitos/, 'un celular de 10 dígitos'],
      ['01 234 567', /fijo de Lima tiene el 01 y 7 dígitos/, 'un fijo de Lima incompleto'],
      ['044 12345', /fijo de provincia tiene el código de área y 6 dígitos/, 'un fijo de provincia incompleto'],
      ['45 123456', /código de área 45 no corresponde/, 'un código de área que no existe'],
      ['(070) 123456', /código de área 70 no corresponde/, 'un código de área que no existe, con el 0'],
      ['+51 01 234 5678', /prefijo \+51 solo se aceptan celulares/, 'un fijo con +51'],
      ['+1 987 654 321', /prefijo \+51 solo se aceptan celulares/, 'otro prefijo de país'],
      ['987 654 321 anexo 2', /solo puede tener números, espacios, guiones, paréntesis/, 'letras'],
      ['987.654.321', /solo puede tener números/, 'puntos'],
      ['98+7654321', /solo puede tener números/, 'un + que no está al principio'],
      ['12345', /El teléfono no es válido/, 'un número demasiado corto'],
      ['---', /El teléfono no es válido/, 'solo caracteres de formato'],
    ];
    for (const [escrito, mensaje, descripcion] of invalidos) {
      it(`rechaza ${descripcion}: ${JSON.stringify(escrito)}`, () => {
        const resultado = normalizarTelefono(escrito);
        assert.equal(resultado.valido, false);
        assert.match(resultado.mensaje, mensaje);
      });
    }

    it('acepta cada código de área de CODIGOS_AREA_PROVINCIA, con y sin el 0', () => {
      for (const codigo of CODIGOS_AREA_PROVINCIA) {
        assert.equal(normalizarTelefono(`${codigo} 123456`).numero, `${codigo}123456`);
        assert.equal(normalizarTelefono(`(0${codigo}) 123456`).numero, `${codigo}123456`);
      }
    });
  });

  describe('formatearTelefono', () => {
    it('muestra cada tipo de número con su formato habitual', () => {
      assert.equal(formatearTelefono('987654321', 'celular'), '987 654 321');
      assert.equal(formatearTelefono('012345678', 'fijo'), '(01) 234 5678');
      assert.equal(formatearTelefono('44123456', 'fijo'), '(044) 123456');
    });

    it('lo que muestra se puede volver a escribir y da el mismo número', () => {
      for (const [numero, tipo] of [['987654321', 'celular'], ['012345678', 'fijo'], ['44123456', 'fijo']]) {
        assert.deepEqual(normalizarTelefono(formatearTelefono(numero, tipo)), { valido: true, numero, tipo });
      }
    });
  });
});
