const SUPABASE_URL = "https://bpjscmnwyzxyoixvovpz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_32gKegYUNADD80gWbT1yuA_Iuwkc4Im";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = s => document.querySelector(s);
const money = n => `${Number(n || 0).toFixed(2).replace(".",",")} €`;
let state = { session:null, profile:null, page:"order", menu:[], extras:[], openOrder:null, selectedMenu:null, selectedExtras:[] };

async function init(){
  if(SUPABASE_URL.startsWith("PEGA_")) return renderSetup();
  const {data:{session}} = await db.auth.getSession();
  state.session=session;
  db.auth.onAuthStateChange((_e,s)=>{state.session=s; if(!s) renderAuth(); else load();});
  if(!session) return renderAuth();
  await load();
  if("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(()=>{});
}
async function load(){
  const {data:profile} = await db.from("profiles").select("*").eq("id",state.session.user.id).single();
  state.profile=profile;
  const [{data:menu},{data:extras},{data:open}] = await Promise.all([
    db.from("menu_items").select("*").eq("active",true).order("category").order("name"),
    db.from("extras").select("*").eq("active",true).order("name"),
    db.from("order_windows").select("*").eq("open",true).order("closes_at",{ascending:true}).limit(1).maybeSingle()
  ]);
  state.menu=menu||[]; state.extras=extras||[]; state.openOrder=open;
  render();
}
function renderSetup(){document.body.innerHTML=`<div class="auth"><div class="auth-box"><h1>🥪 Bocatas</h1><p>Falta conectar Supabase.</p><p class="small">Abre <b>app.js</b> y pega tu URL y tu Anon Key en las dos primeras líneas.</p></div></div>`}
function renderAuth(){
  document.body.innerHTML=`<div class="auth"><div class="auth-box">
    <h1>🥪 Bocatas</h1><p class="muted">Desayunos de la oficina, sin líos.</p>
    <div id="authMsg"></div>
    <div class="field"><label>Email</label><input id="email" type="email" placeholder="tu@email.com"></div>
    <div class="field"><label>Contraseña</label><input id="password" type="password"></div>
    <button class="primary" id="login">Iniciar sesión</button>
  </div></div>`;
  $("#login").onclick=async()=>{setMsg("");const {error}=await db.auth.signInWithPassword({email:$("#email").value,password:$("#password").value});if(error)setMsg(error.message,true)};
}
function setMsg(t,error=false){$("#authMsg").innerHTML=t?`<div class="${error?"error":"success"}">${t}</div>`:""}
function render(){
  const admin=state.profile?.role==="admin";
  document.body.innerHTML=`<div class="app">
    <header class="top"><div><div class="brand">🥪 Bocatas</div><div class="user">${state.profile?.name||state.session.user.email}</div></div><button class="secondary" id="logout">Salir</button></header>
    <nav class="nav">${nav("order","🥪 Pedir")}${nav("menu","📋 Carta")}${nav("stats","📊 Estadísticas")}${admin?nav("admin","⚙️ Admin"):""}</nav>
    <main id="content"></main>
  </div>`;
  $("#logout").onclick=()=>db.auth.signOut();
  if(state.page==="order") renderOrder();
  if(state.page==="menu") renderMenu();
  if(state.page==="stats") renderStats();
  if(state.page==="admin") renderAdmin();
}
function nav(id,label){return `<button class="${state.page===id?"active":""}" data-page="${id}">${label}</button>`}
document.addEventListener("click",e=>{const b=e.target.closest("[data-page]");if(b){state.page=b.dataset.page;render()}});
function renderOrder(){
  const c=$("#content");
  if(!state.openOrder){c.innerHTML=`<div class="card hero"><h1>No hay pedido abierto</h1><p class="muted">Cuando se abra el próximo desayuno aparecerá aquí.</p></div>`;return}
  c.innerHTML=`<div class="card hero"><h1>Pedido abierto</h1><p class="muted">Cierra: ${new Date(state.openOrder.closes_at).toLocaleString("es-ES",{dateStyle:"short",timeStyle:"short"})}</p></div>
  <div class="card"><div class="row"><h2 style="margin:0">🥖 Bocadillo</h2><button class="secondary" id="clearOrder" type="button">Limpiar</button></div><div class="grid">${state.menu.map(x=>`<div class="product ${state.selectedMenu?.id===x.id?"selected":""}" data-menu="${x.id}" role="button" tabindex="0"><div><div class="product-name">${x.name}</div><div class="small muted">${x.category||""}</div></div><div class="price">${money(x.price)}</div></div>`).join("")}</div></div>
  <div class="card"><h2>➕ Complementos</h2><div class="grid">${state.extras.map(x=>`<div class="product ${state.selectedExtras.includes(String(x.id))?"selected":""}" data-extra="${x.id}" role="button" tabindex="0"><div class="product-name">${x.name}</div><div class="price">${money(x.price)}</div></div>`).join("")}</div></div>
  <div class="card"><div class="row"><span class="total">Total: ${money(totalSelected())}</span><button class="primary" id="confirm" type="button">Confirmar pedido</button></div></div>`;
  c.querySelectorAll("[data-menu]").forEach(el=>{const fn=()=>{const id=String(el.dataset.menu);state.selectedMenu=state.selectedMenu?.id===id?null:(state.menu.find(x=>String(x.id)===id)||null);renderOrder()};el.onclick=fn;el.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();fn()}}});
  c.querySelectorAll("[data-extra]").forEach(el=>{const fn=()=>{const id=String(el.dataset.extra);const current=state.selectedExtras.map(String);state.selectedExtras=current.includes(id)?current.filter(x=>x!==id):[...current,id];renderOrder()};el.onclick=fn;el.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();fn()}}});
  $("#clearOrder").onclick=()=>{state.selectedMenu=null;state.selectedExtras=[];renderOrder()};
  $("#confirm").onclick=confirmOrder;
}
function totalSelected(){return (state.selectedMenu?.price||0)+state.selectedExtras.reduce((s,id)=>s+(state.extras.find(x=>String(x.id)===String(id))?.price||0),0)}
async function confirmOrder(){
  if(!state.selectedMenu)return alert("Elige un bocadillo.");
  const {error}=await db.from("orders").insert({user_id:state.session.user.id,order_window_id:state.openOrder.id,menu_item_id:state.selectedMenu.id,extra_ids:state.selectedExtras,total:totalSelected()});
  if(error)return alert(error.message);
  state.selectedMenu=null;state.selectedExtras=[];
  alert("¡Pedido enviado!");
  await load();
}
function renderMenu(){
  $("#content").innerHTML=`<div class="card"><h1>📋 Carta</h1><h2>Bocadillos</h2><div class="list">${state.menu.map(x=>`<div class="list-item row"><span>${x.name}</span><b>${money(x.price)}</b></div>`).join("")}</div><h2>Complementos</h2><div class="list">${state.extras.map(x=>`<div class="list-item row"><span>${x.name}</span><b>${money(x.price)}</b></div>`).join("")}</div></div>`;
}
async function renderStats(){
  const {data:orders}=await db.from("orders").select("total,user_id,menu_item_id,created_at,profiles(name),menu_items(name)").order("created_at",{ascending:false});
  const rows=orders||[];
  const byMenu={};const byUser={};
  rows.forEach(o=>{byMenu[o.menu_items?.name||"—"]=(byMenu[o.menu_items?.name||"—"]||0)+1;const n=o.profiles?.name||"—";byUser[n]??={n,count:0,total:0};byUser[n].count++;byUser[n].total+=Number(o.total)});
  const top=Object.entries(byMenu).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const people=Object.values(byUser).sort((a,b)=>b.total-a.total);
  $("#content").innerHTML=`<div class="grid"><div class="card"><div class="stat">${rows.length}</div><div class="stat-label">Bocadillos pedidos</div></div><div class="card"><div class="stat">${money(rows.reduce((s,o)=>s+Number(o.total),0))}</div><div class="stat-label">Gastado en total</div></div></div>
  <div class="card"><h2>🏆 Más pedidos</h2>${top.map((x,i)=>`<div class="list-item row"><span>${i+1}. ${x[0]}</span><b>${x[1]}</b></div>`).join("")||"<p class='muted'>Todavía no hay pedidos.</p>"}</div>
  <div class="card"><h2>👤 Gasto por persona</h2><table class="table"><tr><th>Persona</th><th>Bocatas</th><th>Gastado</th></tr>${people.map(x=>`<tr><td>${x.n}</td><td>${x.count}</td><td>${money(x.total)}</td></tr>`).join("")}</table></div>`;
}
function renderAdmin(){
  $("#content").innerHTML=`<div class="card"><h1>⚙️ Administración</h1><div class="tabs"><button class="active" data-admin="orders">Pedidos</button><button data-admin="menu">Carta</button><button data-admin="windows">Abrir pedido</button><button data-admin="users">Usuarios</button></div><div id="adminContent"></div></div>`;
  document.querySelectorAll("[data-admin]").forEach(b=>b.onclick=()=>adminSection(b.dataset.admin));
  adminSection("orders");
}
async function adminSection(section){
  const c=$("#adminContent");
  if(section==="orders"){
    const {data}=await db.from("orders").select("*,profiles(name),menu_items(name)").order("created_at",{ascending:false});
    c.innerHTML=`<h2>Pedidos</h2><div class="list">${(data||[]).map(o=>`<div class="list-item row"><div><b>${o.profiles?.name||"—"}</b><br>${o.menu_items?.name||"—"}<br><span class="small muted">${new Date(o.created_at).toLocaleString("es-ES")}</span></div><b>${money(o.total)}</b></div>`).join("")||"<p class='muted'>No hay pedidos.</p>"}</div>`;
  }
  if(section==="windows"){
    c.innerHTML=`<h2>Abrir pedido</h2><div class="field"><label>Hora de cierre</label><input id="closeTime" type="datetime-local"></div><button class="primary" id="openBtn">Abrir pedido</button>`;
    $("#openBtn").onclick=async()=>{const v=$("#closeTime").value;if(!v)return;await db.from("order_windows").update({open:false}).eq("open",true);const {error}=await db.from("order_windows").insert({open:true,closes_at:new Date(v).toISOString(),opened_by:state.session.user.id});if(error)alert(error.message);else{alert("Pedido abierto");await load();renderAdmin()}};
  }
  if(section==="menu"){
    const {data:items}=await db.from("menu_items").select("*").order("name");
    const {data:ex}=await db.from("extras").select("*").order("name");
    c.innerHTML=`<h2>Bocadillos</h2><div class="list">${(items||[]).map(x=>`<div class="list-item row"><span>${x.name} · ${money(x.price)}</span><button class="danger" data-del-menu="${x.id}">Eliminar</button></div>`).join("")}</div>
    <h2>Complementos</h2><div class="list">${(ex||[]).map(x=>`<div class="list-item row"><span>${x.name} · ${money(x.price)}</span><button class="danger" data-del-extra="${x.id}">Eliminar</button></div>`).join("")}</div>
    <hr><div class="grid"><div><h3>Nuevo bocadillo</h3><input id="mn" placeholder="Nombre"><input id="mp" type="number" step=".01" placeholder="Precio"><button class="primary" id="addM">Añadir</button></div><div><h3>Nuevo complemento</h3><input id="en" placeholder="Nombre"><input id="ep" type="number" step=".01" placeholder="Precio"><button class="primary" id="addE">Añadir</button></div></div>`;
    $("#addM").onclick=async()=>{await db.from("menu_items").insert({name:$("#mn").value,price:Number($("#mp").value)});adminSection("menu");load()};
    $("#addE").onclick=async()=>{await db.from("extras").insert({name:$("#en").value,price:Number($("#ep").value)});adminSection("menu");load()};
    c.querySelectorAll("[data-del-menu]").forEach(b=>b.onclick=async()=>{if(confirm("¿Eliminar?")){await db.from("menu_items").update({active:false}).eq("id",b.dataset.delMenu);adminSection("menu");load()}});
    c.querySelectorAll("[data-del-extra]").forEach(b=>b.onclick=async()=>{if(confirm("¿Eliminar?")){await db.from("extras").update({active:false}).eq("id",b.dataset.delExtra);adminSection("menu");load()}});
  }
  if(section==="users"){
    const {data}=await db.from("profiles").select("*").order("name");
    c.innerHTML=`<h2>Usuarios</h2><p class="muted small">Para crear una cuenta nueva, usa el formulario de abajo. El usuario recibirá sus credenciales.</p><div class="grid"><input id="un" placeholder="Nombre"><input id="ue" type="email" placeholder="Email"><input id="up" type="password" placeholder="Contraseña"><button class="primary" id="createU">Crear usuario</button></div><div class="list" style="margin-top:12px">${(data||[]).map(u=>`<div class="list-item row"><span>${u.name||"—"} · ${u.email||""}</span><span class="badge ${u.role==="admin"?"orange":"green"}">${u.role}</span></div>`).join("")}</div>`;
    $("#createU").onclick=async()=>{const r=await fetch("/api/create-user",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+state.session.access_token},body:JSON.stringify({name:$("#un").value,email:$("#ue").value,password:$("#up").value})});const j=await r.json();alert(j.error||"Usuario creado");if(!j.error)adminSection("users")};
  }
}
init();
