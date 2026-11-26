import { Router } from 'express';

const router = Router();

// Página de inicio (requiere sesión): el listado de contactos.
router.get('/', (req, res) => {
  res.redirect(302, '/contactos');
});

export default router;
