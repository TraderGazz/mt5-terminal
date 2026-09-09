import { Router } from 'express';
import { authRequired } from './auth.js';
import { getBridge } from '../services/mt5-bridge/index.js';

const router = Router();

// GET /api/positions — открытые позиции (страница «Торговля», только просмотр).
router.get('/', authRequired, async (req, res) => {
  const bridge = getBridge();
  try {
    const positions = await bridge.positions();
    res.json({ positions, count: positions.length, source: bridge.status() });
  } catch (err) {
    console.error('[positions] error:', err.message);
    res.status(502).json({ error: 'MT5-мост недоступен', detail: err.message });
  }
});

export default router;
