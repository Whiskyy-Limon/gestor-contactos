// Carga contactos ficticios para ver la app con datos (npm run db:demo).
//
// Solo fuera de producción, y solo en una base de datos sin contactos: nunca mezcla datos de
// demostración con datos reales. Necesita un usuario (npm run user:create), que queda como autor en
// la auditoría (A1).
//
// Los contactos se crean con los mismos servicios que usa la app (crearContacto, archivarContacto,
// cambiarFoto), así que cada dato pasa por las mismas validaciones (C1–C6, T1–T5, E1, F1–F4).
// Todos los datos son inventados; los avatares son ilustraciones dibujadas aquí, no fotos de personas.
import fs from 'node:fs';
import sharp from 'sharp';
import { config } from '../src/config/index.js';
import { abrirBaseDeDatos } from '../src/db/conexion.js';
import { migracionesPendientes } from '../src/db/migraciones.js';
import { archivarContacto, crearContacto } from '../src/services/contactos.js';
import { cambiarFoto } from '../src/services/fotos.js';

// [nombres, apellidos, dni, tipo, teléfonos, correos, extra]. Los teléfonos van escritos como los
// escribiría una persona (T1–T4); la app los normaliza al guardar.
//   extra.archivar  se archiva después de crearlo (C5)
//   extra.avatar    colores del avatar ilustrado que recibe como foto (C4)
const CONTACTOS = [
  ['José', 'Álvarez Campos', '53580237', 'ambos', ['991 082 947'], ['jose.alvarez@empresa3.pe']],
  ['Natalia', 'Bustamante Ríos', '67160474', 'cliente', ['995 165 894'], ['natalia.bustamante@empresa2.pe']],
  [
    'Lucía', 'Castillo Ramos', '40000000', 'cliente', ['987 000 000', '(01) 400 0000', '(044) 200000'],
    ['lucia.castillo@empresa0.pe'],
    { avatar: { fondo: ['#93c5fd', '#c4b5fd'], piel: '#f1c9a5', pelo: '#6b4423', ropa: '#4338ca' } },
  ],
  ['Julia', 'Ccori Mamani', '64691340', 'cliente', ['994 423 540'], ['julia.ccori@empresa0.pe']],
  ['Luis', 'Chávez Ríos', '46172835', 'proveedor', ['988 855 885', '(01) 345 6789'], ['luis.chavez@empresa1.pe']],
  ['Carmen', 'Díaz Núñez', '49876536', 'cliente', ['989 969 416'], ['carmen.diaz@empresa0.pe']],
  ['Ricardo', 'Espinoza Tello', '65925907', 'proveedor', ['994 794 717'], ['ricardo.espinoza@empresa1.pe', 'compras@empresa1.pe']],
  ['Rosa', 'Flores Paredes', '47407402', 'cliente', ['989 227 062'], ['rosa.flores@empresa2.pe']],
  ['Pedro', 'Gutiérrez Soto', '48641969', 'ambos', ['989 598 239', '(054) 281937'], ['pedro.gutierrez@empresa3.pe']],
  ['Raúl', 'Herrera Pinto', '56049371', 'proveedor', ['991 825 301'], ['raul.herrera@empresa1.pe']],
  ['Jorge', 'Mendoza Salas', '41234567', 'proveedor', ['+51 987 371 177'], ['jorge.mendoza@empresa1.pe']],
  ['Patricia', 'Morales Ibáñez', '57283938', 'cliente', ['992 196 478'], ['patricia.morales@empresa2.pe']],
  ['Valeria', 'Navarro Ugarte', '62222206', 'ambos', ['993 681 186'], ['valeria.navarro@empresa2.pe']],
  ['Gabriela', 'Ortiz Benites', '59753072', 'proveedor', ['992 938 832'], ['gabriela.ortiz@empresa0.pe']],
  ['Diego', 'Paredes Llosa', '63456773', 'cliente', ['994 052 363'], ['diego.paredes@empresa3.pe']],
  [
    'María Elena', 'Quispe Huamán', '42469134', 'ambos', ['987 742 354', '(084) 241356'],
    ['maria.quispe@empresa2.pe'],
    { avatar: { fondo: ['#fde68a', '#fca5a5'], piel: '#d9a071', pelo: '#1f2937', ropa: '#0f766e' } },
  ],
  ['Miguel', 'Ramírez Cruz', '51111103', 'proveedor', ['990 340 593'], ['miguel.ramirez@empresa1.pe']],
  ['Andrés', 'Reyes Cárdenas', '58518505', 'cliente', ['992 567 655'], ['andres.reyes@empresa3.pe']],
  ['Carlos', 'Rojas Vega', '43703701', 'cliente', ['988 113 531'], ['carlos.rojas@empresa3.pe']],
  ['Elena', 'Sánchez Mora', '54814804', 'cliente', ['991 454 124'], ['elena.sanchez@empresa0.pe']],
  ['Sofía', 'Torres Alva', '60318274', 'proveedor', ['993 206 118'], ['sofia.torres@empresa1.pe']],
  ['Martín', 'Vargas Zegarra', '45592610', 'cliente', ['986 514 230', '(01) 428 7765'], ['martin.vargas@empresa2.pe', 'mvargas@empresa2.pe']],
  ['Ana', 'Villanueva Rojas', '52741963', 'ambos', ['995 338 412'], ['ana.villanueva@empresa3.pe']],
  ['Óscar', 'Zúñiga Pérez', '61827345', 'proveedor', ['990 771 264'], ['oscar.zuniga@empresa0.pe']],
  ['Inés', 'Arias Montoya', '69629608', 'cliente', ['995 908 248', '(01) 429 6280'], ['ines.arias@empresa0.pe'], { archivar: true }],
];

// Avatar ilustrado (una silueta sobre un degradado), como PNG.
function avatarIlustrado({ fondo, piel, pelo, ropa }) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
    <defs><linearGradient id="f" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${fondo[0]}"/><stop offset="1" stop-color="${fondo[1]}"/>
    </linearGradient></defs>
    <rect width="400" height="400" fill="url(#f)"/>
    <ellipse cx="200" cy="400" rx="130" ry="120" fill="${ropa}"/>
    <circle cx="200" cy="175" r="78" fill="${piel}"/>
    <path d="M122 170a78 78 0 0 1 156 0c-20-34-50-46-78-46s-58 12-78 46z" fill="${pelo}"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// Explica por qué no se cargan los datos y termina con error.
function negarse(mensaje) {
  console.error(`No se cargaron los datos de demostración: ${mensaje}`);
  process.exitCode = 1;
}

async function main() {
  if (config.isProduction) {
    return negarse('este comando no se usa en producción (NODE_ENV=production).');
  }

  const db = abrirBaseDeDatos();
  try {
    const pendientes = migracionesPendientes(db);
    if (pendientes.length > 0) {
      return negarse(`la base de datos ${config.databasePath} tiene migraciones pendientes. Ejecuta primero: npm run db:migrate`);
    }
    if (db.prepare('SELECT count(*) FROM contactos').pluck().get() > 0) {
      return negarse(`la base de datos ${config.databasePath} ya tiene contactos; los datos de demostración solo se cargan en una vacía.`);
    }
    const usuario = db.prepare('SELECT id, nombre FROM usuarios ORDER BY id LIMIT 1').get();
    if (!usuario) {
      return negarse('no hay usuarios. Crea uno primero con: npm run user:create');
    }

    // La carpeta de fotos la crea la app al arrancar; en una instalación nueva todavía no existe.
    fs.mkdirSync(config.carpetaFotos, { recursive: true });

    // Contactos y archivado en una transacción: o se cargan todos, o ninguno.
    const conAvatar = [];
    db.transaction(() => {
      for (const [nombres, apellidos, dni, tipo, telefonos, correos, extra = {}] of CONTACTOS) {
        const id = crearContacto(db, { nombres, apellidos, dni, tipo, telefonos, correos }, usuario.id);
        if (extra.archivar) {
          archivarContacto(db, id, usuario.id);
        }
        if (extra.avatar) {
          conAvatar.push({ id, avatar: extra.avatar });
        }
      }
    })();

    // Fotos (F1–F4): pasan por la misma validación y el mismo reprocesamiento que una subida.
    for (const { id, avatar } of conAvatar) {
      await cambiarFoto(db, {
        carpeta: config.carpetaFotos,
        contactoId: id,
        contenido: await avatarIlustrado(avatar),
        usuarioId: usuario.id,
        registrarError: (error) => console.error(error),
      });
    }

    const archivados = CONTACTOS.filter(([, , , , , , extra]) => extra?.archivar).length;
    console.log(
      `Se cargaron ${CONTACTOS.length} contactos de demostración en ${config.databasePath} ` +
        `(${archivados} archivado, ${conAvatar.length} con foto), creados por ${usuario.nombre}.`,
    );
  } finally {
    db.close();
  }
}

await main();
