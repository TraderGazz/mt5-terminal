import { mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { inspectTransferSnapshot, prepareTransfer, importPreparedTransfer, transferCaptureSignature } from '../services/transfer-staging.js';

// Refreshes only the localhost preview. Source access is read-only except for
// the normal API authentication checks performed by the existing application.
dotenv.config({path:fileURLToPath(new URL('../.env',import.meta.url)),quiet:true});
const sourceLogin = '2000108452';
const targetLogin = '2000138707';
const sourceUrl = new URL(process.env.DATABASE_URL);
if (sourceUrl.pathname !== '/terminal') throw new Error('Run with the first terminal database configuration');
if (!process.env.JWT_SECRET || !process.env.MT5_BRIDGE_URL) throw new Error('Missing source settings');

async function run(command, args, { env = process.env, stdin = 'ignore', stdout = 'inherit' } = {}) {
  await new Promise((resolve,reject)=>{
    const child = spawn(command,args,{env,stdio:[stdin,stdout,'inherit']});
    child.once('error',reject);
    child.once('exit',code=>code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

const settingsTables = ['position_overrides','account_overrides','accounts','app_settings'];
async function settings(client) {
  const result = {};
  for (const table of settingsTables) {
    // Deterministic ordering also makes the post-capture stability check useful.
    result[table] = (await client.query(`SELECT * FROM ${table} ORDER BY 1`)).rows;
  }
  return result;
}

async function main() {
  await run('pm2',['describe','mt5-transfer-preview'],{stdout:'ignore'});
  const client = new pg.Client({connectionString:sourceUrl.href});
  await client.connect();
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g,'') + '_' + randomBytes(3).toString('hex');
  const directory = '/root/mt5-backups/terminal1-refresh-' + stamp;
  const database = 'terminal_migration_test_' + stamp;
  const targetUrl = new URL(sourceUrl.href);
  targetUrl.pathname = '/' + database;
  let snapshot, specifications;
  try {
    const {rows:[user]} = await client.query('SELECT id,login,role FROM users WHERE active=TRUE ORDER BY id LIMIT 1');
    if (!user) throw new Error('No active source user');
    const token = jwt.sign({sub:String(user.id),login:user.login,role:user.role},process.env.JWT_SECRET,{expiresIn:'10m'});
    const bridge = process.env.MT5_BRIDGE_URL.replace(/\/$/,'');
    const api = `http://127.0.0.1:${process.env.PORT || 4000}/api`;
    async function get(url,authenticated = false,raw = false) {
      const response = await fetch(url,{
        headers:authenticated ? {Authorization:`Bearer ${token}`} : {},
        signal:AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`Source HTTP ${response.status}`);
      return raw ? response.text() : response.json();
    }
    async function siteState() {
      const account = (await get(api+'/account',true)).account;
      const positions = (await get(api+'/positions',true)).positions;
      const quotes = (await get(api+'/quotes')).quotes;
      if (!account || !Array.isArray(positions) || !Array.isArray(quotes) || !quotes.some(q=>q.symbol === 'EURUSDrfd')) {
        throw new Error('Invalid or incomplete source site response');
      }
      return {account,positions,quotes};
    }

    const startedAt = new Date().toISOString();
    const brokerAccount = await get(bridge+'/account');
    if (String(brokerAccount.login) !== sourceLogin) throw new Error('Wrong source broker account');
    const brokerPositions = await get(bridge+'/order/list');
    const before = await siteState();
    const fx = await get(bridge+'/quote?symbol=USDRUBrfd');
    if (fx.symbol !== 'USDRUBrfd' || !fx.time || !Number.isFinite(fx.bid) || !Number.isFinite(fx.ask) || fx.bid <= 0 || fx.ask < fx.bid) {
      throw new Error('Invalid USDRUB quote');
    }
    const symbolText = await get(bridge+'/symbol/info?symbol=EURUSDrfd',false,true);
    // The existing EA sends an unescaped path in this response. Read only the
    // scalar specification fields, never repair/reinterpret arbitrary JSON.
    function field(key) {
      const match = symbolText.match(new RegExp('"'+key+'"\\s*:\\s*("[^"\\r\\n]*"|-?\\d+(?:\\.\\d+)?)'));
      if (!match) throw new Error(`Missing symbol specification: ${key}`);
      return JSON.parse(match[1]);
    }
    if (field('trade_calc_mode') !== 0 || field('currency_profit') !== 'USD' || brokerAccount.currency !== 'RUB') {
      throw new Error('Unsupported contract or account currency');
    }
    specifications = {EURUSDrfd:{
      calculation:'forex',contractSize:field('trade_contract_size'),
      referenceRate:(fx.bid+fx.ask)/2,profitCurrency:'USD',accountCurrency:'RUB',conversionSymbol:'USDRUBrfd',
    }};
    snapshot = {
      version:1,startedAt,completedAt:new Date().toISOString(),
      brokerAccount,brokerPositions,siteAccount:{account:before.account},sitePositions:{positions:before.positions},
      referenceQuotes:{USDRUBrfd:fx},siteQuotes:before.quotes,
    };
    inspectTransferSnapshot(snapshot,sourceLogin,targetLogin);
    prepareTransfer(snapshot,sourceLogin,targetLogin,specifications);
    await mkdir(directory,{mode:0o700});
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    try {
      snapshot.settings = await settings(client);
      const {rows:[exported]} = await client.query('SELECT pg_export_snapshot() AS id');
      const dump = await open(directory+'/terminal.dump','wx',0o600);
      try {
        await run('docker',['exec','mt5-terminal-db','pg_dump','-U','terminal','-d','terminal','-Fc','--snapshot='+exported.id],{stdout:dump.fd});
      } finally { await dump.close(); }
      await client.query('COMMIT');
    } catch(error) {
      await client.query('ROLLBACK');
      throw error;
    }
    const after = await siteState();
    const currentSettings = await settings(client);
    const lastBroker = await get(bridge+'/account');
    if (transferCaptureSignature(before,snapshot.settings) !== transferCaptureSignature(after,currentSettings)
        || String(lastBroker.login) !== sourceLogin) {
      throw new Error('Source changed during capture. Preview was not switched. Retry during a pause in edits/trades.');
    }
    await writeFile(directory+'/snapshot.json',JSON.stringify(snapshot,null,2),{mode:0o600,flag:'wx'});
    await writeFile(directory+'/specifications.json',JSON.stringify(specifications,null,2),{mode:0o600,flag:'wx'});
    const prepared = prepareTransfer(snapshot,sourceLogin,targetLogin,specifications);
    await client.query(`CREATE DATABASE ${database} TEMPLATE template0`);
    const dump = await open(directory+'/terminal.dump','r');
    try {
      await run('docker',['exec','-i','mt5-terminal-db','pg_restore','-U','terminal','-d',database,'--exit-on-error','--no-owner','--no-privileges'],{stdin:dump.fd});
    } finally { await dump.close(); }
    const target = new pg.Client({connectionString:targetUrl.href});
    await target.connect();
    try {
      for (const file of ['014_closed_trade_edits.sql','015_position_override_volume.sql','016_mobile_history_edit_visible.sql','017_transfer_staging.sql']) {
        await target.query(await readFile(new URL('../../database/migrations/'+file,import.meta.url),'utf8'));
      }
      await target.query('BEGIN');
      let imported;
      try {
        imported = await importPreparedTransfer(target,prepared,snapshot);
        await target.query('COMMIT');
      } catch(error) { await target.query('ROLLBACK'); throw error; }
      await run(process.execPath,[fileURLToPath(new URL('./verify-transfer.mjs',import.meta.url)),database,String(imported.id)]);
      await writeFile(directory+'/ready.json',JSON.stringify({database,snapshotId:imported.id,capturedAt:snapshot.completedAt},null,2),{mode:0o600,flag:'wx'});
      await run('pm2',['restart','mt5-transfer-preview','--update-env'],{env:{
        ...process.env,TRANSFER_PREVIEW_DATABASE:database,TRANSFER_PREVIEW_SNAPSHOT_ID:String(imported.id),
      }});
      console.log(JSON.stringify({backupDirectory:directory,testDatabase:database,positions:prepared.positions.length,
        capturedAt:snapshot.completedAt,referenceQuoteTime:fx.time,sourceBalance:before.account.balance},null,2));
      console.log('PREVIEW_REFRESHED — reload the localhost test page and log in again');
    } finally { await target.end(); }
  } finally { await client.end(); }
}

main().catch(error=>{console.error(error.message);process.exitCode=1;});
