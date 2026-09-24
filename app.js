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
async function renderOrder(){
  const c=$("#content");
  if(!state.openOrder){
    c.innerHTML=`<div class="card hero"><h1>No hay pedido abierto</h1><p class="muted">Cuando se abra el próximo desayuno aparecerá aquí.</p></div>`;
    return;
  }

  const productsRaw = [
    ...state.menu.map(x=>({id:String(x.id),name:x.name,price:x.price,type:"menu",category:x.category||""})),
    ...state.extras.map(x=>({id:String(x.id),name:x.name,price:x.price,type:"extra",category:"Complemento"}))
  ];
  const seenProductKeys = new Set();
  const products = productsRaw.filter(p=>{
    const key = `${p.type}:${p.id}`;
    if(seenProductKeys.has(key)) return false;
    seenProductKeys.add(key);
    return true;
  });

  const selectedKeys = new Set();
  if(state.selectedMenu) selectedKeys.add(`menu:${String(state.selectedMenu.id)}`);
  state.selectedExtras.forEach(id=>selectedKeys.add(`extra:${String(id)}`));

  const {data:currentOrders=[]} = await db.from("orders")
    .select("*,profiles(name),menu_items(name)")
    .eq("order_window_id",state.openOrder.id)
    .order("created_at",{ascending:true});

  const extraMap=new Map(state.extras.map(x=>[String(x.id),x]));
  const people=(currentOrders||[]).map(o=>({
    name:o.profiles?.name||"—",
    detail:[o.menu_items?.name||"—",...(o.extra_ids||[]).map(id=>extraMap.get(String(id))?.name).filter(Boolean)].join(" + ")
  }));
  const summary={};
  (currentOrders||[]).forEach(o=>{
    const menuName=o.menu_items?.name||"—";
    summary[menuName]=(summary[menuName]||0)+1;
    (o.extra_ids||[]).forEach(id=>{
      const n=extraMap.get(String(id))?.name;
      if(n) summary[n]=(summary[n]||0)+1;
    });
  });

  c.innerHTML=`
    <div class="card hero">
      <h1>${state.openOrder.name||"Pedido abierto"}</h1>
      <p class="muted">Cierra: ${new Date(state.openOrder.closes_at).toLocaleString("es-ES",{dateStyle:"short",timeStyle:"short"})}</p>
    </div>
    <div class="card">
      <div class="row">
        <h2 style="margin:0">🥪 Tu pedido</h2>
        <button type="button" class="secondary" id="clearOrder">Limpiar</button>
      </div>
      <p class="small muted">Elige 1 bocadillo y los complementos que quieras.</p>
      <div class="grid">
        ${products.map(p=>{
          const key = `${p.type}:${p.id}`;
          const selected = selectedKeys.has(key);
          return `<button type="button" class="product ${selected?"selected":""}" aria-pressed="${selected}" data-product-key="${key}" data-product-id="${p.id}" data-product-type="${p.type}">
            <div><div class="product-name">${p.name}</div><div class="small muted">${p.category}</div></div>
            <div class="price">${money(p.price)}</div>
          </button>`;
        }).join("")}
      </div>
    </div>
    <div class="card">
      <div class="row">
        <span class="total">Total: ${money(totalSelected())}</span>
        <button class="primary" id="confirm">Confirmar pedido</button>
      </div>
    </div>
    <div class="card">
      <div class="row"><h2 style="margin:0">👥 Pedido en curso</h2><b>${people.length} persona${people.length===1?"":"s"}</b></div>
      ${people.length?`<div class="list" style="margin-top:10px">${people.map(p=>`<div class="list-item row"><b>${p.name}</b><span>${p.detail}</span></div>`).join("")}</div>`:`<p class="muted">Todavía no ha pedido nadie.</p>`}
      ${Object.keys(summary).length?`<h3>📊 Resumen</h3><div class="list">${Object.entries(summary).map(([name,count])=>`<div class="list-item row"><span>${name}</span><b>${count}x</b></div>`).join("")}</div>`:""}
    </div>`;

  c.querySelectorAll("[data-product-id]").forEach(el=>{
    el.onclick=()=>{
      const id=String(el.dataset.productId);
      if(el.dataset.productType==="menu"){
        state.selectedMenu=state.menu.find(x=>String(x.id)===id)||null;
      }else{
        const current=state.selectedExtras.map(String);
        state.selectedExtras=current.includes(id)
          ? state.selectedExtras.filter(x=>String(x)!==id)
          : [...state.selectedExtras,el.dataset.productId];
      }
      renderOrder();
    };
  });

  $("#clearOrder").onclick=()=>{
    state.selectedMenu=null;
    state.selectedExtras=[];
    renderOrder();
  };
  $("#confirm").onclick=confirmOrder;
}

async function confirmOrder(){
  if(!state.selectedMenu)return alert("Elige un bocadillo.");
  const {error}=await db.from("orders").insert({
    user_id:state.session.user.id,
    order_window_id:state.openOrder.id,
    menu_item_id:state.selectedMenu.id,
    extra_ids:state.selectedExtras,
    total:totalSelected()
  });
  if(error)return alert(error.message);
  state.selectedMenu=null;
  state.selectedExtras=[];
  alert("¡Pedido enviado!");
  await load();
}
function totalSelected(){
  return (state.selectedMenu?.price||0)+state.selectedExtras.reduce(
    (s,id)=>s+(state.extras.find(x=>String(x.id)===String(id))?.price||0),0
  );
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
    const [{data:orders,error:ordersError},{data:windows,error:windowsError},{data:extras,error:extrasError}]=await Promise.all([
      db.from("orders").select("*,profiles(name),menu_items(name)").order("created_at",{ascending:false}),
      db.from("order_windows").select("*").order("created_at",{ascending:false}),
      db.from("extras").select("*")
    ]);
    if(ordersError||windowsError||extrasError){
      c.innerHTML=`<p class="error">No se han podido cargar los pedidos.</p>`;
      return;
    }
    const extraMap=new Map((extras||[]).map(x=>[String(x.id),x]));
    const windowMap=new Map((windows||[]).map(w=>[String(w.id),w]));
    const grouped=new Map();
    (orders||[]).forEach(o=>{
      const key=String(o.order_window_id||"sin-ventana");
      if(!grouped.has(key)) grouped.set(key,[]);
      grouped.get(key).push(o);
    });
    const groups=[...grouped.entries()].map(([key,rows])=>({key,window:windowMap.get(key)||null,rows}));

    c.innerHTML=`<h2>Pedidos</h2>
      ${groups.map(g=>{
        const w=g.window;
        const title=w?.name||"Pedido sin nombre";
        const total=g.rows.reduce((s,o)=>s+Number(o.total||0),0);
        const count=g.rows.length;
        return `<div class="card" style="margin-top:12px">
          <div class="row">
            <div>
              <h3 style="margin:0">${title}</h3>
              <span class="small muted">${count} pedido${count===1?"":"s"}${w?.closes_at?` · Cierra: ${new Date(w.closes_at).toLocaleString("es-ES")}`:""}</span>
            </div>
            <div class="row" style="gap:10px">
              <b>${money(total)}</b>
              <div class="row" style="gap:8px">
                <button class="primary" type="button" data-view-order="${g.key}">Entrar</button>
                <button class="secondary" type="button" data-export-order="${g.key}">📤 Exportar pedido</button>
                <button class="danger" type="button" data-delete-order="${g.key}">Eliminar</button>
              </div>
            </div>
          </div>
          <div id="order-detail-${g.key}" style="display:none;margin-top:12px"></div>
        </div>`;
      }).join("")||"<p class='muted'>No hay pedidos.</p>"}`;

    c.querySelectorAll("[data-delete-order]").forEach(btn=>{
      btn.onclick=async()=>{
        const key=btn.dataset.deleteOrder;
        const group=groups.find(g=>g.key===key);
        if(!group)return;
        const name=group.window?.name||"este pedido";
        if(!confirm(`¿Eliminar "${name}" y todos los pedidos que contiene?`))return;
        btn.disabled=true;
        const orderIds=group.rows.map(o=>o.id).filter(Boolean);
        if(orderIds.length){
          const {error}=await db.from("orders").delete().in("id",orderIds);
          if(error){btn.disabled=false;alert(error.message);return;}
        }
        if(group.window?.id){
          const {error}=await db.from("order_windows").delete().eq("id",group.window.id);
          if(error){alert(error.message);return;}
        }
        await adminSection("orders");
      };
    });

    c.querySelectorAll("[data-export-order]").forEach(btn=>{
      btn.onclick=async()=>{
        const key=btn.dataset.exportOrder;
        const group=groups.find(g=>g.key===key);
        if(!group)return;
        const extraNames=new Map((extras||[]).map(x=>[String(x.id),x.name]));
        const counts={};
        const lines=(group.rows||[]).map(o=>{
          const extrasList=(o.extra_ids||[]).map(id=>extraNames.get(String(id))).filter(Boolean);
          const detail=[o.menu_items?.name||"—",...extrasList].join(" + ");
          counts[o.menu_items?.name||"—"]=(counts[o.menu_items?.name||"—"]||0)+1;
          extrasList.forEach(n=>counts[n]=(counts[n]||0)+1);
          return `• ${o.profiles?.name||"—"}: ${detail}`;
        });
        const summaryLines=Object.entries(counts).map(([name,n])=>`• ${n}x ${name}`);
        const personTotals={};
        (group.rows||[]).forEach(o=>{
          const name=o.profiles?.name||"—";
          personTotals[name]=(personTotals[name]||0)+Number(o.total||0);
        });
        const personTotalLines=Object.entries(personTotals).map(([name,total])=>`• ${name}: ${money(total)}`);
        const groupTotal=(group.rows||[]).reduce((s,o)=>s+Number(o.total||0),0);
        const text=`🥖 LOBO CHICO X BIKEOCASION — ${group.window?.name||"Pedido"}\n\n${lines.map((line,i)=>line+` → ${money(group.rows[i]?.total||0)}`).join("\n")}\n\n💰 GASTO POR PERSONA\n${personTotalLines.join("\n")}\n\n📊 RESUMEN\n${summaryLines.join("\n")}\n\n💰 TOTAL: ${money(groupTotal)}\n\n👥 ${group.rows.length} persona${group.rows.length===1?"":"s"}`;
        try{
          await navigator.clipboard.writeText(text);
          const old=btn.textContent;
          btn.textContent="✅ Copiado";
          setTimeout(()=>btn.textContent=old,1500);
        }catch(e){
          window.prompt("Copia este pedido para WhatsApp:",text);
        }
      };
    });

    c.querySelectorAll("[data-view-order]").forEach(btn=>{
      btn.onclick=()=>{
        const key=btn.dataset.viewOrder;
        const group=groups.find(g=>g.key===key);
        if(!group)return;
        const detail=c.querySelector(`#order-detail-${CSS.escape(key)}`);
        if(!detail)return;
        if(detail.style.display!=="none"){
          detail.style.display="none";
          btn.textContent="Entrar";
          return;
        }
        detail.innerHTML=`<div class="list">
          ${group.rows.map(o=>{
            const extrasNames=(o.extra_ids||[]).map(id=>extraMap.get(String(id))?.name).filter(Boolean);
            const detailText=[o.menu_items?.name||"—",...extrasNames].join(" + ");
            return `<div class="list-item row">
              <div>
                <b>${o.profiles?.name||"—"}</b><br>
                <span>${detailText}</span><br>
                <span class="small muted">${new Date(o.created_at).toLocaleString("es-ES")}</span>
              </div>
              <b>${money(o.total)}</b>
            </div>`;
          }).join("")}
        </div>`;
        detail.style.display="block";
        btn.textContent="Cerrar";
      };
    });
  }
  if(section==="windows"){
    c.innerHTML=`<h2>Abrir pedido</h2>
      <div class="field"><label>Nombre del pedido</label><input id="orderName" placeholder="Ej. Desayuno viernes"></div>
      <div class="field"><label>Hora de cierre</label><input id="closeTime" type="datetime-local"></div>
      <button class="primary" id="openBtn">Abrir pedido</button>`;
    $("#openBtn").onclick=async()=>{
      const name=$("#orderName").value.trim();
      const v=$("#closeTime").value;
      if(!name)return alert("Pon un nombre al pedido.");
      if(!v)return alert("Elige la hora de cierre.");
      await db.from("order_windows").update({open:false}).eq("open",true);
      const {error}=await db.from("order_windows").insert({name,open:true,closes_at:new Date(v).toISOString(),opened_by:state.session.user.id});
      if(error)alert(error.message);
      else{alert("Pedido abierto");await load();renderAdmin()}
    };
  }
  if(section==="menu"){
    const {data:items}=await db.from("menu_items").select("*").eq("active",true).order("name");
    const {data:ex}=await db.from("extras").select("*").eq("active",true).order("name");
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
