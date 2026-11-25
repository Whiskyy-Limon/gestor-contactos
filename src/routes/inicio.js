import { Router } from 'express';

const router = Router();

// Página de inicio (requiere sesión): saluda al usuario.
router.get('/', (req, res) => {
  res.render('inicio', { titulo: 'Inicio' });
});

export default router;
