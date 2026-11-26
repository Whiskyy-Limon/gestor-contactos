import { Router } from 'express';
import { esNombreDeFoto } from '../services/fotos.js';

// F3: las fotos se sirven solo con sesión iniciada (esta ruta se registra después de
// requiereSesion) y solo si el nombre tiene el formato de una foto (32 hex + .webp) y pertenece a
// un contacto. Cualquier otro nombre (incluido "../algo") responde 404 sin tocar el disco.
export function crearRutaFotos(db, carpetaFotos) {
  const router = Router();
  const perteneceAUnContacto = db.prepare('SELECT 1 FROM contactos WHERE foto = ?');

  router.get('/fotos/:nombre', (req, res, next) => {
    const { nombre } = req.params;
    if (!esNombreDeFoto(nombre) || !perteneceAUnContacto.get(nombre)) {
      return next(); // página no encontrada
    }
    // root: el archivo se busca solo dentro de la carpeta de fotos. Content-Type fijo; helmet ya
    // agrega X-Content-Type-Options: nosniff, y sinCache, Cache-Control: no-store (cacheControl:
    // false evita que sendFile lo reemplace).
    res.sendFile(
      nombre,
      { root: carpetaFotos, dotfiles: 'deny', cacheControl: false, headers: { 'Content-Type': 'image/webp' } },
      (error) => {
        if (error) {
          next(error);
        }
      },
    );
  });

  return router;
}
