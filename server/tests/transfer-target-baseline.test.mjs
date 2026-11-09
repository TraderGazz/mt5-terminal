import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { prepareTargetBaseline } from '../services/transfer-target-baseline.js';
const connection=process.env.TEST_DATABASE_URL;
test('persistent baseline keeps initial time/balance on restart; active target is rejected without changing site records',{skip:!connection},async()=>{
 const admin=new pg.Client({connectionString:connection});await admin.connect();
 const database='terminal_migration_test_hybrid_unit_'+Date.now();
 let db;
 try{
  await admin.query('CREATE DATABASE '+database);
  const url=new URL(connection);url.pathname='/'+database;
  db=new pg.Client({connectionString:url.href});await db.connect();
  await db.query('CREATE TABLE transfer_snapshots(id BIGINT PRIMARY KEY); INSERT INTO transfer_snapshots VALUES(1),(2)');
  const saved={id:1,target_login:'2000138707',account_view:{currency:'RUB'}};
  const target={account:{login:2000138707,currency:'RUB',balance:900100},opened:[],pending:[],deals:[]};
  await db.query('BEGIN');
  const first=await prepareTargetBaseline(db,{saved,target,now:1794214800123});
  await db.query('COMMIT');
  await db.end();db=new pg.Client({connectionString:url.href});await db.connect();
  await db.query('BEGIN');
  const restart=await prepareTargetBaseline(db,{saved,target:{},now:1794301200123});
  assert.deepEqual(restart.baseline,first.baseline);assert.equal(restart.created,false);
  assert.equal(first.baseline.broker_balance_excluded,'900100.00');
  await db.query('COMMIT');
  await db.query('BEGIN');
  await assert.rejects(prepareTargetBaseline(db,{saved:{...saved,id:2},target:{...target,opened:[{ticket:42}]}}),/must have no/);
  await db.query('ROLLBACK');
  assert.equal((await db.query('SELECT count(*)::int n FROM transfer_target_baselines')).rows[0].n,1);
 }finally{await db?.end();await admin.query('DROP DATABASE '+database);await admin.end();}
});
