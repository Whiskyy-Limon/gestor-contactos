// Crea un usuario desde la consola (U1: no hay registro público).
//
// Los datos se piden uno por uno. La contraseña nunca se acepta como argumento, porque quedaría
// guardada en el historial de la terminal, y no se muestra en pantalla mientras se escribe.
// Si la entrada no es una terminal (por ejemplo, redirigida desde un archivo), lee una línea por dato.
import readline from 'node:readline';
import { Writable } from 'node:stream';
import { config } from '../src/config/index.js';
import { abrirBaseDeDatos } from '../src/db/conexion.js';
import { migracionesPendientes } from '../src/db/migraciones.js';
import { crearUsuario } from '../src/services/usuarios.js';
import { ErrorDeValidacion } from '../src/validators/validar.js';

if (process.argv.length > 2) {
  console.error('Este comando no acepta argumentos: los datos se piden uno por uno.');
  console.error('Si escribiste una contraseña como argumento, quedó en el historial de la terminal: usa otra.');
  process.exit(1);
}

const esTerminal = Boolean(process.stdin.isTTY);

// Salida de readline que se puede silenciar. readline muestra lo que se teclea escribiéndolo
// en esta salida; mientras se pide la contraseña, se descarta.
let silenciada = false;
const salida = new Writable({
  write(fragmento, codificacion, listo) {
    if (!silenciada) {
      process.stdout.write(fragmento, codificacion);
    }
    listo();
  },
});

const rl = readline.createInterface({ input: process.stdin, output: salida, terminal: esTerminal });
// El iterador guarda las líneas que llegan antes de que se pidan (entrada redirigida).
const lineas = rl[Symbol.asyncIterator]();

rl.on('SIGINT', () => {
  process.stdout.write('\nCancelado. No se creó ningún usuario.\n');
  process.exit(130);
});

async function preguntar(texto, { oculto = false } = {}) {
  rl.setPrompt(texto);
  rl.prompt();
  silenciada = oculto;
  try {
    const { value, done } = await lineas.next();
    if (done) {
      throw new Error('La entrada terminó antes de completar los datos.');
    }
    return value;
  } finally {
    silenciada = false;
    // El Enter de una respuesta oculta no se mostró, y una entrada redirigida no se muestra nunca.
    if (oculto || !esTerminal) {
      process.stdout.write('\n');
    }
  }
}

async function main() {
  const db = abrirBaseDeDatos();
  try {
    const pendientes = migracionesPendientes(db);
    if (pendientes.length > 0) {
      console.error(`La base de datos ${config.databasePath} tiene migraciones pendientes: ${pendientes.join(', ')}.`);
      console.error('Ejecuta primero: npm run db:migrate');
      process.exitCode = 1;
      return;
    }

    console.log(`Crear usuario en ${config.databasePath}`);
    const nombre = await preguntar('Nombre: ');
    const correo = await preguntar('Correo: ');
    const password = await preguntar('Contraseña: ', { oculto: true });
    const confirmacion = await preguntar('Repite la contraseña: ', { oculto: true });

    if (password !== confirmacion) {
      console.error('Las contraseñas no coinciden. No se creó el usuario.');
      process.exitCode = 1;
      return;
    }

    const usuario = await crearUsuario(db, { nombre, correo, password });
    console.log(`Usuario creado: ${usuario.nombre} <${usuario.correo}> (id ${usuario.id}).`);
  } catch (error) {
    if (error instanceof ErrorDeValidacion) {
      console.error('No se creó el usuario:');
      for (const { mensaje } of error.errores) {
        console.error(`- ${mensaje}`);
      }
    } else {
      console.error('Error inesperado:', error);
    }
    process.exitCode = 1;
  } finally {
    rl.close();
    db.close();
  }
}

await main();
