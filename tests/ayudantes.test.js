// Pruebas de las funciones de presentación de las vistas (src/views/ayudantes.js).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { iniciales, inicialesDeNombre } from '../src/views/ayudantes.js';

describe('iniciales del avatar', () => {
  it('de un contacto: primera letra de los nombres y de los apellidos (C4)', () => {
    assert.equal(iniciales('Ana María', 'Pérez Soto'), 'AP');
    assert.equal(iniciales('josé', 'álvarez'), 'JÁ');
  });

  it('del usuario: primera letra de la primera y de la última palabra de su nombre', () => {
    assert.equal(inicialesDeNombre('Ana Pérez'), 'AP');
    assert.equal(inicialesDeNombre('Rosa Elena Quispe'), 'RQ');
    assert.equal(inicialesDeNombre('  luis   quispe  '), 'LQ');
    assert.equal(inicialesDeNombre('Admin'), 'A');
    assert.equal(inicialesDeNombre('Íñigo Ñahui'), 'ÍÑ');
  });
});
