import { Router } from 'express';
import multer from 'multer';
import { query, requireDb } from '../db.js';
import { authRequired, requireRole } from './auth.js';
import { parseMt5Report, Mt5ReportParseError } from '../services/mt5-parser.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

// POST /api/upload/mt5-report
// Accepts an MT5 HTML report (multipart field "report"), parses it and
// upserts trades into the database. Responds with "Загружено N сделок".
router.post(
  '/mt5-report',
  authRequired,
  requireRole('admin', 'trader'),
  requireDb,
  upload.single('report'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл отчёта не передан (поле "report")' });
    }
    let parsed;
    try {
      parsed = parseMt5Report(req.file.buffer);
    } catch (err) {
      if (err instanceof Mt5ReportParseError) {
        return res.status(422).json({ error: err.message });
      }
      console.error('[upload] parse error:', err);
      return res.status(500).json({ error: 'Ошибка разбора отчёта' });
    }

    let inserted = 0;
    let skippedEdited = 0;
    try {
      for (const t of parsed.trades) {
        const { rows } = await query(
          `INSERT INTO trades
             (ticket, symbol, type, volume, open_price, close_price,
              profit, swap, commission, open_time, close_time,
              comment, position_id, order_ticket)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           ON CONFLICT (ticket) DO UPDATE SET
             symbol = EXCLUDED.symbol,
             type = EXCLUDED.type,
             volume = EXCLUDED.volume,
             open_price = EXCLUDED.open_price,
             close_price = EXCLUDED.close_price,
             profit = EXCLUDED.profit,
             swap = EXCLUDED.swap,
             commission = EXCLUDED.commission,
             open_time = EXCLUDED.open_time,
             close_time = EXCLUDED.close_time,
             comment = EXCLUDED.comment,
             position_id = EXCLUDED.position_id,
             order_ticket = EXCLUDED.order_ticket
           WHERE trades.is_edited = FALSE
           RETURNING id`,
          [
            t.ticket, t.symbol, t.type, t.volume, t.open_price, t.close_price,
            t.profit, t.swap, t.commission, t.open_time, t.close_time,
            t.comment, t.position_id, t.order_ticket,
          ]
        );
        if (rows.length) inserted += 1;
        else skippedEdited += 1;
      }

      await query(
        'INSERT INTO import_log (filename, trades_count, source, user_id) VALUES ($1, $2, $3, $4)',
        [req.file.originalname || 'report.htm', inserted, `html-report:${parsed.source}`, req.user.sub]
      );
    } catch (err) {
      console.error('[upload] db error:', err.message);
      return res.status(500).json({ error: 'Ошибка сохранения в базу' });
    }

    res.json({
      message: `Загружено ${inserted} сделок`,
      inserted,
      skippedEdited,
      parsed: parsed.trades.length,
    });
  }
);

export default router;
