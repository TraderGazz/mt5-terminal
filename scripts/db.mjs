// Локальная портативная PostgreSQL — управление из монорепо.
//   node scripts/db.mjs start|stop|status|psql|reset|init
//
// PostgreSQL живёт вне репозитория (большие бинарники). Путь берётся из
// переменной PGDIR, по умолчанию C:\Dev\pgsql. Данные — <PGDIR>\data.
// Аутентификация trust (только localhost), пользователь postgres, БД terminal.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const PGDIR = process.env.PGDIR || 'C:\\Dev\\pgsql';
const DATA = process.env.PGDATA || path.join(PGDIR, 'data');
const LOG = path.join(PGDIR, 'log.txt');
const PORT = process.env.PGPORT || '5432';
const DB = process.env.PGDATABASE || 'terminal';
const bin = (name) => path.join(PGDIR, 'bin', name + (process.platform === 'win32' ? '.exe' : ''));

const repoRoot = path.resolve(import.meta.dirname, '..');
const run = (cmd, args, opts = {}) =>
  spawnSync(cmd, args, { stdio: 'inherit', env: { ...process.env, PGCLIENTENCODING: 'UTF8' }, ...opts });

if (!existsSync(bin('pg_ctl'))) {
  console.error(`PostgreSQL не найден: ${bin('pg_ctl')}\nЗадай PGDIR или установи портативную сборку PostgreSQL 16.`);
  process.exit(1);
}

const cmd = process.argv[2];
switch (cmd) {
  case 'start':
    run(bin('pg_ctl'), ['-D', DATA, '-l', LOG, '-o', `-p ${PORT}`, '-w', 'start']);
    break;
  case 'stop':
    run(bin('pg_ctl'), ['-D', DATA, '-m', 'fast', 'stop']);
    break;
  case 'status':
    run(bin('pg_ctl'), ['-D', DATA, 'status']);
    break;
  case 'psql':
    run(bin('psql'), ['-U', 'postgres', '-h', '127.0.0.1', '-p', PORT, '-d', DB, ...process.argv.slice(3)]);
    break;
  case 'init':
    run(bin('psql'), ['-U', 'postgres', '-h', '127.0.0.1', '-p', PORT, '-c', `CREATE DATABASE ${DB};`]);
    run(bin('psql'), ['-U', 'postgres', '-h', '127.0.0.1', '-p', PORT, '-d', DB, '-v', 'ON_ERROR_STOP=1',
      '-f', path.join(repoRoot, 'database', 'init.sql')]);
    break;
  case 'reset':
    run(bin('psql'), ['-U', 'postgres', '-h', '127.0.0.1', '-p', PORT, '-c',
      `DROP DATABASE IF EXISTS ${DB} WITH (FORCE); CREATE DATABASE ${DB};`]);
    run(bin('psql'), ['-U', 'postgres', '-h', '127.0.0.1', '-p', PORT, '-d', DB, '-v', 'ON_ERROR_STOP=1',
      '-f', path.join(repoRoot, 'database', 'init.sql')]);
    break;
  default:
    console.log('Использование: node scripts/db.mjs start|stop|status|psql|init|reset');
    process.exit(1);
}
