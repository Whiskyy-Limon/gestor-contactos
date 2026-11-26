// Funciones de presentación para las vistas EJS. src/app.js las registra en app.locals, así
// cualquier plantilla puede usarlas.
import { formatearTelefono } from '../validators/telefonos.js';

export { formatearTelefono };

// A1: las fechas se guardan en UTC y se muestran en la hora de Perú: "26 nov. 2026, 10:30".
const FORMATO_FECHA = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function formatearFecha(iso) {
  return FORMATO_FECHA.format(new Date(iso));
}

// C4: iniciales para el avatar de un contacto sin foto ("Ana María", "Pérez" → "AP").
export function iniciales(nombres, apellidos) {
  return `${nombres.charAt(0)}${apellidos.charAt(0)}`.toLocaleUpperCase('es');
}

// Clase de color del avatar: siempre la misma para un mismo contacto. Los 6 colores están en
// public/css/estilos.css (avatar--0 a avatar--5).
export function colorDeAvatar(contactoId) {
  return `avatar--${contactoId % 6}`;
}

// C6.
const NOMBRES_DE_TIPO = { cliente: 'Cliente', proveedor: 'Proveedor', ambos: 'Cliente y proveedor' };

export function nombreDeTipo(tipo) {
  return NOMBRES_DE_TIPO[tipo] ?? tipo;
}
