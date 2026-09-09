import { Router } from 'express';
import { authRequired } from './auth.js';
import { getBridge } from '../services/mt5-bridge/index.js';

const router = Router();

const TF = new Set(['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1']);

// GET /api/candles?timeframe=M5&from=&to= — свечи EURUSD для графика.
router.get('/', authRequired, async (req, res) => {
  const bridge = getBridge();
  const timeframe = String(req.query.timeframe || 'M5').toUpperCase();
  if (!TF.has(timeframe)) {
    return res.status(400).json({ error: `timeframe: ${[...TF].join(', ')}` });
  }
  try {
    const bars = await bridge.candles({
      timeframe,
      from: req.query.from,
      to: req.query.to,
      count: Math.min(Number(req.query.count) || 300, 1000),
    });
    res.json({ symbol: bridge.symbol, timeframe, bars, source: bridge.status() });
  } catch (err) {
    console.error('[candles] error:', err.message);
    res.status(502).json({ error: 'MT5-мост недоступен', detail: err.message });
  }
});

export default router;
