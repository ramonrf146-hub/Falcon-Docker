// Offline, narrowly scoped patch. Run only with Node-RED stopped, in Manual.
const fs=require('node:fs'), assert=require('node:assert/strict'), path=require('node:path');
function prepare(file,payload){
 const raw=fs.readFileSync(file,'utf8'), flows=JSON.parse(raw);
 const nodes=flows.filter(n=>n.id===payload.id);assert.equal(nodes.length,1,'Scheduler missing or duplicated: '+file);
 const node=nodes[0];assert([payload.before,payload.after].includes(node.func),'Unknown scheduler version: '+file);
 new Function('msg','node','flow','global','context',payload.after);
 const changed=node.func!==payload.after;node.func=payload.after;
 return {file,raw,changed,next:JSON.stringify(flows,null,2)+'\n'};
}
function main(args){
 const root=args[0]||'/data', source=args[1]||'/source';
 const payload=JSON.parse(fs.readFileSync(path.join(__dirname,'curtain-recovery-patch.json'),'utf8'));
 const configFile=path.join(root,'riego.json'), stored=fs.readFileSync(configFile,'utf8');
 assert.equal(JSON.parse(stored).config?.modoAutomatico,false,'Pon Casa Sur en Manual y espera a que los motores esten detenidos.');
 const jobs=[prepare(path.join(root,'flows.json'),payload)];
 if(fs.existsSync(path.join(source,'flows.json')))jobs.push(prepare(path.join(source,'flows.json'),payload));
 if(args.includes('--check')){console.log('PRECHECK_OK: modo Manual y version compatible.');return;}
 const stamp=Date.now(), written=[];
 try{
  for(const job of jobs.filter(j=>j.changed)){
   fs.copyFileSync(job.file,job.file+'.before-curtain-recovery-'+stamp);
   fs.writeFileSync(job.file+'.curtain-fix.tmp',job.next);
   fs.renameSync(job.file+'.curtain-fix.tmp',job.file);written.push(job);
  }
  assert.equal(fs.readFileSync(configFile,'utf8'),stored,'Configuration changed unexpectedly');
  for(const job of jobs)assert.equal(JSON.parse(fs.readFileSync(job.file)).find(n=>n.id===payload.id).func,payload.after);
 }catch(error){for(const job of written)fs.writeFileSync(job.file,job.raw);throw error;}
 console.log('PATCH_OK: solo scheduler actualizado; rutinas/configuracion conservadas; Manual permanece activo.');
}
if(require.main===module){try{main(process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={prepare,main};
