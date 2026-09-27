const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const payload=require('../output/casa-sur-curtain-fix/curtain-recovery-patch.json');
const patch=require.resolve('../output/casa-sur-curtain-fix/patch-curtain-recovery.cjs');
test('offline patch preserves routines and unrelated nodes, updates runtime/source and is idempotent',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'curtain-fix-'));
 try{
  const source=path.join(root,'source');fs.mkdirSync(source);
  const flows=[{id:payload.id,func:payload.before,wires:[['executor']],type:'function'},{id:'custom',func:'return msg;',type:'function'}];
  const config=JSON.stringify({config:{modoAutomatico:false},rutinas:[{id:72,duracion:10}],valvulas:[{id:12}]});
  fs.writeFileSync(path.join(root,'riego.json'),config);
  for(const dir of [root,source])fs.writeFileSync(path.join(dir,'flows.json'),JSON.stringify(flows));
  for(const args of [['--check'],[],[]]){
   const result=spawnSync(process.execPath,[patch,root,source,...args],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
  }
  for(const dir of [root,source]){
   const after=JSON.parse(fs.readFileSync(path.join(dir,'flows.json')));assert.deepEqual(after,[{...flows[0],func:payload.after},flows[1]]);
   assert.equal(fs.readdirSync(dir).filter(n=>n.includes('before-curtain-recovery')).length,1);
  }
  assert.equal(fs.readFileSync(path.join(root,'riego.json'),'utf8'),config);
  fs.writeFileSync(path.join(root,'riego.json'),'{"config":{"modoAutomatico":true}}');
  assert.notEqual(spawnSync(process.execPath,[patch,root,source]).status,0);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('unknown source version refuses before changing runtime',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'curtain-version-'));
 try{
  const source=path.join(root,'source');fs.mkdirSync(source);
  const old=JSON.stringify([{id:payload.id,func:payload.before}]);
  fs.writeFileSync(path.join(root,'riego.json'),'{"config":{"modoAutomatico":false}}');
  fs.writeFileSync(path.join(root,'flows.json'),old);
  fs.writeFileSync(path.join(source,'flows.json'),JSON.stringify([{id:payload.id,func:'unknown'}]));
  assert.notEqual(spawnSync(process.execPath,[patch,root,source]).status,0);
  assert.equal(fs.readFileSync(path.join(root,'flows.json'),'utf8'),old);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
