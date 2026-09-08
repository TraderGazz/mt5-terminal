import { Router } from 'express';
import { getCachedQuotes } from '../services/quotes/index.js';

const router = Router();

// GET /api/quotes — cached quotes for the Market Watch page.
// Optional ?symbol=EURUSD to fetch a single symbol.
router.get('/', (req, res) => {
  const data = getCachedQuotes();
  const { symbol } = req.query;
  if (symbol) {
    const q = data.quotes.find((item) => item.symbol === String(symbol).toUpperCase());
    if (!q) return res.status(404).json({ error: 'Symbol not found' });
    return res.json({ quote: q, updatedAt: data.updatedAt, refreshSec: data.refreshSec });
  }
  res.json(data);
});

export default router;
