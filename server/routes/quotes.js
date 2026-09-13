import { Router } from 'express';
import { getBridge } from '../services/mt5-bridge/index.js';

const router = Router();

// GET /api/quotes — котировки Market Watch из MT5-моста.
router.get('/', async (req, res) => {
  const bridge = getBridge();
  try {
    const quotes = await bridge.quotes();
    res.json({ quotes, symbol: bridge.symbol, updatedAt: quotes[0]?.time, source: bridge.status() });
  } catch (err) {
    console.error('[quotes] error:', err.message);
    res.status(502).json({ error: 'MT5-мост недоступен', detail: err.message });
  }
});

export default router;
