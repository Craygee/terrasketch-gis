import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.mjs';
const origin='https://parcels.example';
test('public endpoint blocks writes and unknown paths',async()=>{
 assert.equal((await worker.fetch(new Request(origin+'/texas/current.json',{method:'PUT'}),{})).status,405);
 assert.equal((await worker.fetch(new Request(origin+'/private/secrets'),{})).status,404);
 assert.equal((await worker.fetch(new Request(origin+'/admin/start',{method:'POST'}),{PUBLISH_TOKEN:'test'})).status,401);
});
test('publisher credential is restricted to parcel object paths',async()=>{
 const req=new Request(origin+'/admin/start?key=private/account',{method:'POST',headers:{Authorization:'Bearer test'}});
 assert.equal((await worker.fetch(req,{PUBLISH_TOKEN:'test'})).status,400);
});
test('missing dataset is explicit, and byte ranges preserve CORS and lengths',async()=>{
 assert.equal((await worker.fetch(new Request(origin+'/texas/current.json'),{PARCELS:{get:async()=>null}})).status,404);
 const req=new Request(origin+'/texas/versions/1234567890abcdef/part-0000.fgb',{headers:{Range:'bytes=4-7'}});
 const response=await worker.fetch(req,{PARCELS:{get:async(key,options)=>{
   assert.equal(options.range.get('Range'),'bytes=4-7');
   return {body:new Uint8Array([1,2,3,4]),size:100,range:{offset:4,length:4},httpEtag:'"abc"',writeHttpMetadata(){}};
 }}});
 assert.equal(response.status,206);assert.equal(response.headers.get('Content-Range'),'bytes 4-7/100');
 assert.equal(response.headers.get('Access-Control-Allow-Origin'),'*');
 assert.equal((await response.arrayBuffer()).byteLength,4);
});
