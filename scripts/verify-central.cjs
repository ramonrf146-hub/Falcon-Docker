const {Pool}=require('pg'),crypto=require('crypto');
const pool=new Pool({host:process.env.POSTGRES_HOST,port:Number(process.env.POSTGRES_PORT||5432),user:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD,database:process.env.POSTGRES_DB});
(async()=>{
 const {rows}=await pool.query('SELECT id, role FROM riego_hub.users ORDER BY id');
 for(const role of ['admin','estandar']){
  const user=rows.find(u=>u.role===role);if(!user)throw Error('Missing role fixture '+role);
  const actor=String(user.id),stamp=String(Date.now());
  const signature=crypto.createHmac('sha256',process.env.GATEWAY_SHARED_SECRET).update(actor+':'+stamp).digest('hex');
  const response=await fetch(process.env.HUB_URL+'/hub/usuarios',{headers:{'x-hub-actor':actor,'x-hub-time':stamp,'x-hub-signature':signature}});
  const expected=role==='admin'?200:403;if(response.status!==expected)throw Error(role+' returned '+response.status);
  console.log(role+': '+response.status);
 }
 const anonymous=await fetch(process.env.HUB_URL+'/hub/areas');if(anonymous.status!==401)throw Error('Anonymous Hub access');
 const counts=await pool.query('SELECT (SELECT count(*) FROM riego_hub.users) AS users,(SELECT count(*) FROM riego_hub.areas) AS areas,(SELECT count(*) FROM riego_hub.user_areas) AS assignments');
 console.log(counts.rows[0]);
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());
