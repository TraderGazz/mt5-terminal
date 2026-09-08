// MT5 direct-connection layer (stub).
// Reads MT5_SERVER_IP / MT5_LOGIN / MT5_PASSWORD from env. Until real
// credentials are provided, everything works in mock mode and says so.
//
// The actual live sync is performed by server/scripts/mt5-sync.py
// (MetaTrader5 Python API, runs on a Windows host or Wine). This JS layer
// exists so Node code can ask "is MT5 configured?" and fetch quotes when a
// bridge is available.

const config = {
  serverIp: process.env.MT5_SERVER_IP || null,
  login: process.env.MT5_LOGIN || null,
  password: process.env.MT5_PASSWORD || null,
};

export function isMt5Configured() {
  return Boolean(config.serverIp && config.login && config.password);
}

export function mt5Status() {
  return {
    configured: isMt5Configured(),
    mode: isMt5Configured() ? 'live' : 'mock',
    serverIp: config.serverIp ? '***' : null,
    login: config.login ? '***' : null,
  };
}

if (!isMt5Configured()) {
  console.warn(
    '[mt5-api] MT5_SERVER_IP / MT5_LOGIN / MT5_PASSWORD are not set — ' +
      'running in MOCK mode. Live sync will activate once credentials are in .env'
  );
} else {
  console.log('[mt5-api] MT5 credentials present (live mode, sync via scripts/mt5-sync.py)');
}

// Mock quotes used when no real MT5 bridge exists yet.
export async function getMt5Quotes() {
  if (!isMt5Configured()) {
    throw new Error('MT5 is not configured — mock mode, use the mock quote provider instead');
  }
  // TODO(live): call the MT5 bridge endpoint exposed by mt5-sync.py host,
  // e.g. http://<MT5_SERVER_IP>:<port>/quotes, and normalize to
  // { symbol, bid, ask, changePct, time }.
  throw new Error('MT5 live quote bridge is not implemented yet — pending customer credentials');
}

// Fetch latest closed positions from MT5 (live mode only).
export async function getMt5Positions() {
  if (!isMt5Configured()) {
    throw new Error('MT5 is not configured — mock mode');
  }
  // TODO(live): same bridge as getMt5Quotes().
  throw new Error('MT5 live positions bridge is not implemented yet');
}
