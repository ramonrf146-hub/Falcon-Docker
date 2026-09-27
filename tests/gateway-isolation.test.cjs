// Run in the gateway image; all DB/Hub/Edges here are isolated fakes.
const {test}=require('node:test'),assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),net=require('node:net');
const {createRequire}=require('node:module');
const req=createRequire('/app/server.js');
const {probeArea,shell}=req('./dashboard-shell');
test('one failed probe does not fail other areas or disclose internal URLs',async()=>{
 const result=await Promise.all([{id:'a',internal_url:'http://a'},{id:'b',internal_url:'http://b'}].map(a=>probeArea(a,async url=>{if(url.includes('//a'))throw Error('asleep');return {status:200};})));
 assert.deepEqual(result.map(x=>x.status),['offline','online']);assert(!JSON.stringify(result).includes('internal_url'));
 const html=shell([{id:'a',name:'<unsafe>'}],'a','https://evil.test');
 assert(html.includes('&lt;unsafe&gt;'));assert(!html.includes('https://evil.test'));assert(html.includes('iframe'));
 new Function(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
});
test('gateway serves shell with Edge down, switches area, recovers and restricts membership',async t=>{
 const edge=http.createServer((request,response)=>{
  if(request.url==='/riego-auth/login'){response.setHeader('set-cookie','edge=fake; Path=/');response.end('{}');return;}
  response.setHeader('content-type','text/html');response.end('<html><head></head><body>EDGE_OK</body></html>');
 });
 await new Promise(r=>edge.listen(0,'127.0.0.1',r));t.after(()=>edge.close());
 const rows=[{id:'good',name:'Good',internal_url:'http://127.0.0.1:'+edge.address().port},{id:'down',name:'Down',internal_url:'http://127.0.0.1:1'}];
 const session=req('express-session');let server;let userRole='admin';
 const fakeHttp={...http,createServer:app=>{server=http.createServer(app);return server;}};
 const fakeRequire=name=>name==='http'?fakeHttp:name==='pg'?{Pool:class{async query(sql,args){return {rows:sql.includes('must_change_password')?[{must_change_password:false,role:userRole}]:sql.includes('ANY')?rows:rows.filter(a=>a.id===args[0])};}}}:name==='connect-pg-simple'?()=>class extends session.MemoryStore{}:req(name);
 const context={require:fakeRequire,process:{env:{PORT:'0',HUB_URL:rows[0].internal_url,GATEWAY_SHARED_SECRET:'fake',GATEWAY_SESSION_SECRET:'test-secret'}},console:{log:()=>{},warn:()=>{}},setTimeout,Buffer,URL,AbortSignal,fetch:async(url,options)=>String(url).includes('/api/users/login-direct')?new Response(JSON.stringify({ok:true,user:{id:1,username:'test',role:'admin'},areas:rows}),{status:200}):fetch(url,options)};
 new Function(...Object.keys(context),fs.readFileSync('/app/server.js','utf8'))(...Object.values(context));
 if(!server.listening)await new Promise(r=>server.once('listening',r));t.after(()=>{server.closeAllConnections();server.close();});
 const base='http://127.0.0.1:'+server.address().port;
 const login=await fetch(base+'/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'username=test&password=fake',redirect:'manual'});
 assert.equal(login.status,302);const cookie=login.headers.get('set-cookie').split(';')[0];const headers={cookie};
 const select=async area=>fetch(base+'/gateway/select-area',{method:'POST',headers:{...headers,'content-type':'application/x-www-form-urlencoded'},body:'area='+area,redirect:'manual'});
 for(const method of ['GET','POST']){
  userRole='estandar';assert.equal((await fetch(base+'/hub/areas',{method,headers})).status,403);
 }
 userRole='admin';assert.equal((await fetch(base+'/hub/areas',{headers})).status,200);
 await select('down');
 let response=await fetch(base+'/dashboard/',{headers});assert.equal(response.status,200);assert((await response.text()).includes('Panel principal conectado'));
 response=await fetch(base+'/dashboard/riego',{headers});assert.equal(response.status,503);assert((await response.text()).includes('Volver al panel principal'));
 await new Promise((resolve,reject)=>{
  const socket=net.connect(server.address().port,'127.0.0.1',()=>socket.write('GET /dashboard/socket.io/?EIO=4&transport=websocket HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nCookie: '+cookie+'\r\n\r\n'));
  socket.setTimeout(5000,()=>{socket.destroy();reject(Error('WebSocket failure did not close'));});socket.on('error',()=>{});socket.on('close',resolve);socket.resume();
 });
 const status=await (await fetch(base+'/gateway/areas-status',{headers})).json();assert.deepEqual(status.areas.map(a=>a.status),['online','offline']);
 await select('good');response=await fetch(base+'/dashboard/riego',{headers});assert.equal(response.status,200);assert((await response.text()).includes('EDGE_OK'));
 await select('not-assigned');response=await fetch(base+'/dashboard/riego',{headers});assert.equal(response.status,200);
 await new Promise(r=>edge.close(r));
 response=await fetch(base+'/gateway/areas-status',{headers});assert.equal((await response.json()).areas[0].status,'offline');
 response=await fetch(base+'/dashboard/',{headers});assert.equal(response.status,200);
 await new Promise(r=>edge.listen(Number(rows[0].internal_url.split(':').at(-1)),'127.0.0.1',r));
 response=await fetch(base+'/dashboard/riego',{headers});assert.equal(response.status,200);
});
test('sleeping Edge times out independently',async t=>{
 const edge=http.createServer(()=>{});await new Promise(r=>edge.listen(0,'127.0.0.1',r));t.after(()=>{edge.closeAllConnections();edge.close();});
 const start=Date.now();const result=await probeArea({id:'sleep',internal_url:'http://127.0.0.1:'+edge.address().port});
 assert.equal(result.status,'offline');assert(Date.now()-start<5000);
});
