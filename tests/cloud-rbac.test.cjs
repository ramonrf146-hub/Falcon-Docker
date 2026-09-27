const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
function harness(role){
 const module={exports:{}};
 new Function('require','process','module',fs.readFileSync('nodered/hub-settings.js','utf8'))(name=>name==='pg'?{Pool:class{async query(){return {rows:role?[{role}]:[]};}}}:require(name),{env:{GATEWAY_SHARED_SECRET:'test-secret'}},module);
 return module.exports.httpNodeMiddleware;
}
for(const role of ['admin','estandar',null])test('Hub checks fresh role '+role,async()=>{
 const actor='1',stamp=String(Date.now()),signature=crypto.createHmac('sha256','test-secret').update(actor+':'+stamp).digest('hex');
 let next=false,status;
 await harness(role)({path:'/hub/usuarios',headers:{'x-hub-actor':actor,'x-hub-time':stamp,'x-hub-signature':signature}}, {status:s=>{status=s;return {send:()=>{}};},set:()=>{}},()=>next=true);
 assert.equal(next,role==='admin');if(role!=='admin')assert.equal(status,403);
});
test('forged and expired signed identities rejected',async()=>{
 for(const stamp of ['0',String(Date.now())]){
  let status,next=false;
  await harness('admin')({path:'/hub/areas',headers:{'x-hub-actor':'1','x-hub-time':stamp,'x-hub-signature':'0'.repeat(64)}},{status:s=>{status=s;return {send:()=>{}};},set:()=>{}},()=>next=true);
  assert.equal(status,401);assert.equal(next,false);
 }
});
test('Edge heartbeat cannot provision central structure',async()=>{
 const flows=require('../nodered/hub-flow-backup/flows.json'),queries=[];
 const area={name:'Test',key_hash:crypto.createHash('sha256').update('key').digest('hex'),status:'active',structure_version:1,structure:{}};
 let resolve;const answer=new Promise(r=>resolve=r);
 const pool={query:async(sql)=>{queries.push(sql);return {rows:[area]};}};
 new Function('msg','global','crypto','node',flows.find(n=>n.id==='hub_n17').func)({payload:{area_id:'a',area_key:'key',seed_structure:{zonas:[{id:99}]}},req:{headers:{}}},{get:k=>{assert.equal(k,'pgPool');return pool;}},crypto,{send:resolve});
 assert.equal((await answer).statusCode,200);assert.equal(queries.length,2);assert(queries[1].startsWith('UPDATE riego_hub.areas SET last_heartbeat_at'));
});
