import 'dotenv/config'; // must be first: loads .env before other modules read process.env
import http from 'node:http';
import express from 'express';
import cors from 'cors';

import { initDb, dbStatus } from './db.js';
import authRouter, { ensureSeedAdmin } from './routes/auth.js';
import tradesRouter from './routes/trades.js';
import quotesRouter from './routes/quotes.js';
import accountRouter from './routes/account.js';
import positionsRouter from './routes/positions.js';
import candlesRouter from './routes/candles.js';
import uploadRouter from './routes/upload.js';
import syncRouter from './routes/sync.js';
import adminRouter from './routes/admin.js';
import { startSyncScheduler } from './services/sync-service.js';
import { getBridge } from './services/mt5-bridge/index.js';
import { attachWsHub } from './services/ws-hub.js';

const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Health check — always available, even without DB.
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    db: dbStatus(),
    mt5: getBridge().status(),
  });
});

app.use('/api/auth', authRouter);
app.use('/api/trades', tradesRouter);
app.use('/api/quotes', quotesRouter);
app.use('/api/account', accountRouter);
app.use('/api/positions', positionsRouter);
app.use('/api/candles', candlesRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/sync', syncRouter);
app.use('/api/admin', adminRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[server] unhandled error:', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

initDb();
// Create the first admin user once the DB probe finishes (no-op if users exist).
setTimeout(() => ensureSeedAdmin(), 1500).unref();
startSyncScheduler();
getBridge().start();

const server = http.createServer(app);
attachWsHub(server);

server.listen(PORT, () => {
  console.log(`[server] MT5 Terminal API + WS listening on port ${PORT}`);
});
