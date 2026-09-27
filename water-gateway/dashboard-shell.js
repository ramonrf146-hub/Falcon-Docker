const escape = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function probeArea(area, fetcher=fetch) {
    if (!area.internal_url) return {id:area.id,name:area.name,status:'unconfigured'};
    try {
        const r=await fetcher(area.internal_url.replace(/\/$/,'')+'/dashboard/',{redirect:'manual',signal:AbortSignal.timeout(3500)});
        await r.body?.cancel();
        return {id:area.id,name:area.name,status:r.status<500?'online':'offline'};
    } catch { return {id:area.id,name:area.name,status:'offline'}; }
}
function shell(areas,selected,requestedView,admin=false) {
    const view=['/dashboard/riego','/dashboard/riego-config','/dashboard/riego-rutinas','/dashboard/sensores'].includes(requestedView)?requestedView:'/dashboard/riego';
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Control</title>
<style>*{box-sizing:border-box}html{height:100%;overflow:hidden}body{height:100vh;height:100dvh;display:flex;flex-direction:column;overflow:hidden;margin:0;background:#F4F7F8;color:#22303F;font:14px system-ui,sans-serif}header{padding:14px 20px;background:white;display:flex;gap:16px;align-items:center;flex-wrap:wrap;border-bottom:1px solid #E4ECED}h1{font-size:20px;margin:0}select,button{font:inherit;padding:9px;border:1px solid #d5e1e3;border-radius:9px;background:white}a{color:#0E7C86}.areas{display:flex;flex:0 0 auto;gap:8px;padding:10px 20px;flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch}.status{flex-shrink:0}header{flex:0 0 auto}.status{display:inline-flex;align-items:center;gap:7px;background:white;border:1px solid #E4ECED;border-radius:20px;padding:6px 10px;font-size:12px}.status-dot{width:8px;height:8px;flex:0 0 8px;border-radius:50%;background:#87939e}.status-dot.online{background:#16854b}.status-dot.offline{background:#d13b3b}#panel{position:relative;flex:1 1 0;min-height:0;overflow:hidden}iframe{display:block;border:0;width:100%;height:100%;background:white}#notice{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#F4F7F8;padding:25px;text-align:center}#notice[hidden]{display:none}.card{max-width:480px;padding:28px;background:white;border-radius:16px}#connection{font-size:12px;color:#5C6B78}form{margin:0}header>a{margin-left:auto}@media(max-width:600px){header{padding:8px 12px;gap:8px}h1{font-size:18px}header>a{margin-left:0}#connection{flex-basis:100%}.areas{padding:6px 12px}header select{max-width:180px}}@media(max-height:450px){header{padding:4px 8px;gap:6px}#connection{display:none}.areas{padding:3px 8px}}</style></head><body>
<header><h1>Control</h1><form action="/gateway/select-area" method="POST"><label>Área <select name="area" onchange="this.form.submit()">${areas.map(a=>`<option value="${escape(a.id)}" ${a.id===selected?'selected':''}>${escape(a.name)}</option>`).join('')}</select></label></form><span id="connection" role="status">Comprobando conexión…</span>${admin?'<a href="/hub/areas">Hub / Áreas</a><a href="/hub/usuarios">Usuarios</a>':''}<a href="/gateway/logout">Salir</a></header>
<div class="areas" id="areas" aria-live="polite"></div><main id="panel"><iframe id="edge" title="Control del área seleccionada" src="about:blank"></iframe><div id="notice"><div class="card"><h2 id="heading">Comprobando área</h2><p id="detail">La navegación permanece disponible.</p><button id="retry" type="button">Reintentar</button></div></div></main>
<script>
const selected=${JSON.stringify(selected).replace(/</g,'\\u003c')};
const frame=document.getElementById('edge'),notice=document.getElementById('notice');let loaded=false,busy=false;
function show(title,detail){document.getElementById('heading').textContent=title;document.getElementById('detail').textContent=detail;notice.hidden=false;}
async function refresh(){if(busy)return;busy=true;try{
 const response=await fetch('/gateway/areas-status',{cache:'no-store',signal:AbortSignal.timeout(6000)});
 if(response.redirected){location.href=response.url;return;}if(!response.ok)throw Error('gateway');
 const data=await response.json();const list=document.getElementById('areas');list.replaceChildren();
 for(const a of data.areas){const el=document.createElement('span');el.className='status';const label=a.name+' · '+({online:'En línea',offline:'Sin conexión',unconfigured:'Sin configurar'}[a.status]||'Estado desconocido');el.title=label;el.setAttribute('aria-label',label);const dot=document.createElement('span');dot.className='status-dot '+(['online','offline'].includes(a.status)?a.status:'unconfigured');dot.setAttribute('aria-hidden','true');el.append(dot,document.createTextNode(a.name));list.append(el);}
 const area=data.areas.find(a=>a.id===selected);document.getElementById('connection').textContent='Panel principal conectado';
 if(area&&area.status==='online'){notice.hidden=true;if(!loaded){frame.src=${JSON.stringify(view)}+'?gatewayFrame=1';loaded=true;}}
 else {if(loaded){frame.src='about:blank';loaded=false;}show(area?.name||'Área','Esta área no está disponible. Puedes seleccionar otra; se reintentará automáticamente.');}
 }catch{document.getElementById('connection').textContent='No se pudo actualizar la conexión';show('Conexión interrumpida','No se puede confirmar el estado del área. La navegación sigue disponible; reintentando.');}finally{busy=false;}}
document.getElementById('retry').onclick=()=>{loaded=false;refresh();};refresh();setInterval(refresh,10000);
</script></body></html>`;
}
module.exports={probeArea,shell};
