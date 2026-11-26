// Pruebas del esquema zod de contactos: C1–C3, C6 y E1 (los teléfonos en detalle, en telefonos.test.js).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { esquemaContacto } from '../src/validators/contactos.js';
import { MAXIMO_CARACTERES_NOMBRE, MAXIMO_TELEFONOS_POR_CONTACTO, TIPOS_CONTACTO } from '../src/validators/reglas.js';
import { ErrorDeValidacion, erroresPorCampo, validar } from '../src/validators/validar.js';

// Como llegan del formulario: 5 filas de teléfonos y 5 de correos, las vacías incluidas.
const VALIDO = {
  nombres: 'Ana María',
  apellidos: 'Pérez Núñez',
  dni: '01234567',
  tipo: 'cliente',
  telefonos: ['987 654 321', '', '', '', ''],
  correos: ['Ana@Empresa.PE', '', '', '', ''],
};

function datos(cambios = {}) {
  return validar(esquemaContacto, { ...VALIDO, ...cambios });
}

// { campo: primer mensaje } de los errores, o falla si los datos se aceptan.
function errores(entrada) {
  try {
    validar(esquemaContacto, entrada);
  } catch (error) {
    if (error instanceof ErrorDeValidacion) {
      return erroresPorCampo(error.errores);
    }
    throw error;
  }
  assert.fail(`se esperaba un error de validación con ${JSON.stringify(entrada)}`);
}

const erroresCon = (cambios) => errores({ ...VALIDO, ...cambios });

describe('validación de contactos', () => {
  it('acepta un contacto válido, lo normaliza y descarta los campos ajenos (como _csrf)', () => {
    assert.deepEqual(datos({ _csrf: 'token' }), {
      nombres: 'Ana María',
      apellidos: 'Pérez Núñez',
      dni: '01234567',
      tipo: 'cliente',
      telefonos: [{ numero: '987654321', tipo: 'celular' }],
      correos: ['ana@empresa.pe'],
    });
  });

  it('informa todos los campos que faltan a la vez', () => {
    assert.deepEqual(errores({}), {
      nombres: 'Escribe los nombres.',
      apellidos: 'Escribe los apellidos.',
      dni: 'Escribe el DNI.',
      tipo: 'Elige si es cliente, proveedor o ambos.',
      telefonos: 'Escribe al menos un teléfono.',
      correos: 'Escribe al menos un correo.',
    });
  });

  describe('nombres y apellidos (C1)', () => {
    for (const nombre of ['José', 'Ñandú', 'Güemes', "O'Brien", 'Rivas-Plata', 'De la Cruz', 'MARÍA JOSÉ']) {
      it(`acepta ${JSON.stringify(nombre)}`, () => {
        assert.equal(datos({ nombres: nombre }).nombres, nombre);
        assert.equal(datos({ apellidos: nombre }).apellidos, nombre);
      });
    }

    it('quita los espacios de los extremos y reduce los dobles', () => {
      assert.equal(datos({ nombres: '  Ana   María \t' }).nombres, 'Ana María');
    });

    it('convierte el apóstrofo tipográfico en apóstrofo simple', () => {
      assert.equal(datos({ apellidos: 'O’Brien' }).apellidos, "O'Brien");
    });

    it('guarda en forma NFC una tilde escrita como carácter combinable', () => {
      const conTildeCombinable = 'José'; // "José" escrito como "e" + tilde
      assert.equal(datos({ nombres: conTildeCombinable }).nombres, 'José');
    });

    const invalidos = [
      ['Ana2', /solo pueden tener letras/, 'números'],
      ['Ana!', /solo pueden tener letras/, 'símbolos'],
      ['François', /solo pueden tener letras/, 'letras de otros idiomas (ver Mejoras futuras)'],
      ['A', /al menos 2 caracteres/, '1 carácter'],
      ['a'.repeat(MAXIMO_CARACTERES_NOMBRE + 1), /más de 60 caracteres/, `${MAXIMO_CARACTERES_NOMBRE + 1} caracteres`],
      ['   ', /Escribe los nombres/, 'solo espacios'],
    ];
    for (const [nombre, mensaje, descripcion] of invalidos) {
      it(`rechaza ${descripcion}`, () => {
        assert.match(erroresCon({ nombres: nombre }).nombres, mensaje);
      });
    }

    it('el mensaje nombra el campo que falló', () => {
      assert.match(erroresCon({ apellidos: 'Ana2' }).apellidos, /^Los apellidos solo pueden tener letras/);
    });
  });

  describe('DNI (C2)', () => {
    it('acepta 8 dígitos, con ceros a la izquierda y espacios alrededor', () => {
      assert.equal(datos({ dni: ' 00123456 ' }).dni, '00123456');
    });

    for (const dni of ['1234567', '123456789', '1234567a', '1234 5678']) {
      it(`rechaza ${JSON.stringify(dni)}`, () => {
        assert.equal(erroresCon({ dni }).dni, 'El DNI debe tener exactamente 8 dígitos.');
      });
    }
  });

  describe('tipo (C6)', () => {
    for (const tipo of TIPOS_CONTACTO) {
      it(`acepta ${tipo}`, () => {
        assert.equal(datos({ tipo }).tipo, tipo);
      });
    }

    it('rechaza un tipo desconocido', () => {
      assert.equal(erroresCon({ tipo: 'socio' }).tipo, 'Elige si es cliente, proveedor o ambos.');
    });
  });

  describe('teléfonos (C3)', () => {
    it('ignora las filas vacías y conserva el orden', () => {
      assert.deepEqual(datos({ telefonos: ['', '01 234 5678', '', '987654321', ''] }).telefonos, [
        { numero: '012345678', tipo: 'fijo' },
        { numero: '987654321', tipo: 'celular' },
      ]);
    });

    it('acepta una sola fila enviada como texto (no como lista)', () => {
      assert.deepEqual(datos({ telefonos: '987654321' }).telefonos, [{ numero: '987654321', tipo: 'celular' }]);
    });

    it('exige al menos un teléfono', () => {
      assert.equal(erroresCon({ telefonos: ['', '', ''] }).telefonos, 'Escribe al menos un teléfono.');
    });

    it('deja el error en la fila donde está', () => {
      const encontrados = erroresCon({ telefonos: ['987654321', '', '12345', '', ''] });

      assert.match(encontrados['telefonos.2'], /El teléfono no es válido/);
      assert.equal(encontrados['telefonos.0'], undefined);
    });

    it('detecta un número repetido aunque esté escrito de otra forma', () => {
      const encontrados = erroresCon({ telefonos: ['987 654 321', '', '+51987654321'] });

      assert.equal(encontrados['telefonos.2'], 'Es el mismo número que el teléfono 1.');
    });

    it(`rechaza más de ${MAXIMO_TELEFONOS_POR_CONTACTO} filas`, () => {
      const seis = ['911111111', '922222222', '933333333', '944444444', '955555555', '966666666'];

      assert.match(erroresCon({ telefonos: seis }).telefonos, /como máximo 5 teléfonos/);
    });
  });

  describe('correos (C3, E1)', () => {
    it('los guarda sin espacios alrededor y en minúsculas', () => {
      assert.deepEqual(datos({ correos: ['  Ana@Empresa.PE ', 'VENTAS@empresa.pe'] }).correos, [
        'ana@empresa.pe',
        'ventas@empresa.pe',
      ]);
    });

    it('exige al menos un correo', () => {
      assert.equal(erroresCon({ correos: ['', ''] }).correos, 'Escribe al menos un correo.');
    });

    it('rechaza un correo con formato inválido, en su fila', () => {
      assert.equal(erroresCon({ correos: ['ana@empresa.pe', 'ana@'] })['correos.1'], 'El correo no es válido.');
    });

    it('rechaza un correo de más de 254 caracteres', () => {
      const largo = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(63)}.pe`;

      assert.match(erroresCon({ correos: [largo] })['correos.0'], /más de 254 caracteres/);
    });

    it('detecta un correo repetido aunque cambien las mayúsculas', () => {
      const encontrados = erroresCon({ correos: ['ana@empresa.pe', 'ANA@Empresa.pe'] });

      assert.equal(encontrados['correos.1'], 'Es el mismo correo que el correo 1.');
    });
  });
});
