import { Router } from 'express';
import { getBridge } from '../services/mt5-bridge/index.js';

const router = Router();

// GET /api/quotes — котировка EURUSD из MT5-моста.
// (Раньше был кэш нескольких символов + Yahoo; по ТЗ v3 — только EURUSD из MT5.)
router.get('/', async (req, res) => {
  const bridge = getBridge();
  try {
    const quote = await bridge.quote();
    res.json({ quotes: [quote], symbol: bridge.symbol, updatedAt: quote.time, source: bridge.status() });
  } catch (err) {
    console.error('[quotes] error:', err.message);
    res.status(502).json({ error: 'MT5-мост недоступен', detail: err.message });
  }
});

export default router;
