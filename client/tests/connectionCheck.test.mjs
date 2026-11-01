import test from 'node:test';
import assert from 'node:assert/strict';
import { checkConnection } from '../src/lib/connectionCheck.ts';

test('diagnostics distinguish HTTP/session problems without revealing private data', async () => {
  const requests=[];
  const report=await checkConnection({origin:'https://example.test',apiBase:'/api',token:'secret-token',fetcher:async(url,options)=>{
    requests.push({url:String(url),options});
    if(String(url).endsWith('/auth/me')) return new Response(JSON.stringify({tradeMaintenanceMode:true,user:{login:'private-login'}}),{status:200});
    if(String(url).endsWith('/positions')) return new Response('{}',{status:401});
    return new Response(JSON.stringify({account:{balance:123456789},token:'secret-token'}),{status:200});
  }});
  assert.ok(report.includes('account: HTTP 200'));
  assert.ok(report.includes('positions: HTTP 401'));
  assert.ok(report.includes('обслуживание: включено'));
  assert.ok(!report.includes('secret-token')); assert.ok(!report.includes('123456789')); assert.ok(!report.includes('private-login'));
  assert.deepEqual(requests.find(r=>r.url.endsWith('/health')).options.headers,{});
  assert.equal(requests.find(r=>r.url.endsWith('/account')).options.headers.Authorization,'Bearer secret-token');
});
test('network failures are reported rather than thrown', async()=>{
  const report=await checkConnection({origin:'https://example.test',apiBase:'/api',token:null,fetcher:async()=>{throw new TypeError('network');}});
  assert.ok(report.includes('Сессия: нет'));
  assert.equal((report.match(/ошибка сети/g)||[]).length,4);
});
