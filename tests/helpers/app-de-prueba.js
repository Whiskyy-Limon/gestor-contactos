// Utilidades para las pruebas de la app: base de datos en memoria, un usuario y su propio secreto.
// Nunca usan la base de datos real ni el SESSION_SECRET de .env.
import { crearApp } from '../../src/app.js';
import { abrirBaseDeDatos } from '../../src/db/conexion.js';
import { aplicarMigraciones } from '../../src/db/migraciones.js';
import { crearUsuario } from '../../src/services/usuarios.js';

export const SECRETO_DE_PRUEBA = 'secreto-solo-para-pruebas-'.padEnd(64, '0');
export const NOMBRE_COOKIE = 'gestor.sid';
export const NOMBRE = 'Ana Pérez';
export const CORREO = 'ana@empresa.pe';
export const PASSWORD = 'clave-segura-123';

// Base de datos migrada con un usuario y una app lista.
// `nuevaApp()` crea otra app sobre la misma base de datos (simula reiniciar el servidor).
// `erroresRegistrados` junta lo que la app registraría en la consola.
export async function crearEntornoDePrueba(opcionesApp = {}) {
  const db = abrirBaseDeDatos(':memory:');
  aplicarMigraciones(db);
  const usuario = await crearUsuario(db, { nombre: NOMBRE, correo: CORREO, password: PASSWORD }, { costo: 4 });

  const erroresRegistrados = [];
  const nuevaApp = () =>
    crearApp({
      db,
      sessionSecret: SECRETO_DE_PRUEBA,
      registrarError: (error) => erroresRegistrados.push(error),
      ...opcionesApp,
    });

  return { db, usuario, app: nuevaApp(), nuevaApp, erroresRegistrados };
}

// Devuelve "nombre=valor" de la cookie de sesión que envía la respuesta, o null si no envía ninguna.
export function cookieDeSesion(respuesta, nombre = NOMBRE_COOKIE) {
  const cookie = (respuesta.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${nombre}=`));
  return cookie ? cookie.split(';')[0] : null;
}

// Inicia sesión como un navegador: abre el formulario y lo envía. Devuelve la respuesta del envío.
export async function iniciarSesion(agente, { correo = CORREO, password = PASSWORD } = {}) {
  await agente.get('/login');
  return agente.post('/login').type('form').send({ correo, password });
}

export function contarSesiones(db) {
  return db.prepare('SELECT count(*) FROM sesiones').pluck().get();
}
