"use strict";
/* Калорія — PWA client. Analysis runs on /api/analyze (Claude API key stays on the server).
   History and the daily goal live on this device in IndexedDB. */

const $ = s => document.querySelector(s);
const COLORS = ["--c1","--c2","--c3","--c4","--c5","--c6","--c7","--c8"].map(v=>`var(${v})`);
let file = null, ctl = null, stream = null;

/* ---------- helpers ---------- */
const esc = s => String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const n0 = x => Math.round(x).toLocaleString("uk-UA");
const n1 = x => (Math.round(x*10)/10).toLocaleString("uk-UA");
const ls = {
  get(k){ try{ return localStorage.getItem(k); }catch{ return null; } },
  set(k,v){ try{ localStorage.setItem(k,v); }catch{} }
};

/* ---------- IndexedDB ---------- */
const idb = (()=>{
  let dbp;
  const open = () => dbp ||= new Promise((res, rej)=>{
    const r = indexedDB.open("kaloriya", 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore("meals", {keyPath:"id"}); d.createObjectStore("kv"); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const tx = async (store, mode, fn) => {
    const d = await open();
    return new Promise((res, rej)=>{
      const t = d.transaction(store, mode), req = fn(t.objectStore(store));
      t.oncomplete = () => res(req?.result);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  };
  return {
    all: () => tx("meals","readonly", s=>s.getAll()),
    put: r => tx("meals","readwrite", s=>s.put(r)),
    del: id => tx("meals","readwrite", s=>s.delete(id)),
    get: k => tx("kv","readonly", s=>s.get(k)),
    set: (k,v) => tx("kv","readwrite", s=>s.put(v,k)),
  };
})();

/* ---------- example shown before the first analysis ---------- */
const EXAMPLE = {dish:"Гречка з тушкованими грибами та салатом",cooking_method:"тушковане",cooking_note:"Гриби тушковані з цибулею на соняшниковій олії — олія додає помітну частку калорій.",confidence:.74,
ingredients:[
 {name:"Гречка варена",percent:45,hidden:false,confidence:.9,per100:{kcal:110,protein:4.2,fat:1.1,carbs:21.3,fiber:2.7},benefit:"Повільні вуглеводи, магній і рутин — рівна енергія та підтримка судин."},
 {name:"Печериці тушковані",percent:25,hidden:false,confidence:.8,per100:{kcal:35,protein:3.1,fat:.5,carbs:3.3,fiber:2},benefit:"Вітаміни групи B і селен — обмін речовин та антиоксидантний захист."},
 {name:"Цибуля тушкована",percent:8,hidden:false,confidence:.6,per100:{kcal:44,protein:1.2,fat:.1,carbs:10,fiber:1.7},benefit:"Кверцетин і пребіотичні волокна для мікробіому."},
 {name:"Огірок і томат",percent:19,hidden:false,confidence:.85,per100:{kcal:17,protein:.8,fat:.2,carbs:3.4,fiber:1},benefit:"Вода, калій і лікопін — гідратація та серцево-судинна система."},
 {name:"Соняшникова олія",percent:3,hidden:true,confidence:.5,per100:{kcal:884,protein:0,fat:100,carbs:0,fiber:0},benefit:"Вітамін E; але це найкалорійніша складова тарілки."}],
facts:["Гречка — не злак, а псевдозлак, родич щавлю й ревеню, тому не містить глютену.","Печериці, полежавши під сонцем, накопичують вітамін D."],
caveats:"Кількість олії під час тушкування — головне джерело похибки (±60 ккал)."};

/* ---------- maths: the model gives shares + per-100 g values, the app does the grams ---------- */
function calc(d, W){
  const ings = (d.ingredients||[]).filter(i=>i && i.name);
  const sum = ings.reduce((a,i)=>a+(+i.percent||0),0) || 1;
  const rows = ings.map((i,k)=>{
    const pct = (+i.percent||0)/sum*100, g = W*pct/100, p = i.per100||{};
    const f = x => (+x||0)*g/100;
    return {...i, pct, g, kcal:f(p.kcal), protein:f(p.protein), fat:f(p.fat), carbs:f(p.carbs), fiber:f(p.fiber), color:COLORS[k%COLORS.length]};
  });
  const tot = k => rows.reduce((a,r)=>a+r[k],0);
  return {rows, kcal:tot("kcal"), protein:tot("protein"), fat:tot("fat"), carbs:tot("carbs"), fiber:tot("fiber")};
}

function render(d, W, isExample, el){
  el = el || $("#result");
  const c = calc(d, W);
  const kcalSum = c.kcal || 1;
  const bar = (key, total) => c.rows.map(r=>`<i style="flex:${Math.max(r[key],.0001)};background:${r.color}" title="${esc(r.name)}: ${Math.round(r[key]/total*100)}%"></i>`).join("");
  const macroK = c.protein*4 + c.fat*9 + c.carbs*4 || 1;
  el.innerHTML = `
  <div class="top">
    ${isExample?'<span class="example">Приклад розбору</span>':''}
    <h2 class="dish">${esc(d.dish)}</h2>
    <div class="meta">${esc(d.cooking_method)} · ${n0(W)} г · <span class="conf">впевненість ${Math.round((+d.confidence||0)*100)}%</span></div>
    ${d.cooking_note?`<div class="meta">${esc(d.cooking_note)}</div>`:''}
  </div>
  <div class="totals">
    <div class="kcal"><b>${n0(c.kcal)}</b><small>ккал</small></div>
    <div><b>${n1(c.protein)}</b><small>білки г</small></div>
    <div><b>${n1(c.fat)}</b><small>жири г</small></div>
    <div><b>${n1(c.carbs)}</b><small>вугл. г</small></div>
  </div>
  <div class="sect">
    <span class="lbl">Частка ваги</span>
    <div class="bar">${bar("g", W)}</div>
    <span class="lbl">Частка калорій</span>
    <div class="bar">${bar("kcal", kcalSum)}</div>
    <div class="legend">${c.rows.map(r=>`<span><i style="background:${r.color}"></i>${esc(r.name)}</span>`).join("")}</div>
    <div class="note">Енергія з макро: білки ${Math.round(c.protein*4/macroK*100)}% · жири ${Math.round(c.fat*9/macroK*100)}% · вуглеводи ${Math.round(c.carbs*4/macroK*100)}% · клітковина ${n1(c.fiber)} г</div>
  </div>
  <div class="sect">
    <span class="lbl">Інгредієнти</span>
    <div class="tbl"><table>
      <thead><tr><th>Інгредієнт</th><th>%</th><th>г</th><th>ккал</th><th>Б</th><th>Ж</th><th>В</th></tr></thead>
      <tbody>${c.rows.map(r=>`<tr class="${(+r.confidence||1)<.5?'low':''}">
        <td><span class="ing"><i style="background:${r.color}"></i>${esc(r.name)}${r.hidden?'<span class="hidden-tag">прихов.</span>':''}</span></td>
        <td>${Math.round(r.pct)}</td><td>${n0(r.g)}</td><td>${n0(r.kcal)}</td><td>${n1(r.protein)}</td><td>${n1(r.fat)}</td><td>${n1(r.carbs)}</td></tr>`).join("")}</tbody>
    </table></div>
  </div>
  <div class="sect">
    <span class="lbl">На що впливає</span>
    <div class="cards">${c.rows.filter(r=>r.benefit).map(r=>`<div class="card"><i style="background:${r.color}"></i><div><h3>${esc(r.name)}</h3><p>${esc(r.benefit)}</p></div></div>`).join("")}</div>
  </div>
  ${(d.facts||[]).length?`<div class="sect"><span class="lbl">Факти</span><ul class="facts">${d.facts.map(f=>`<li>${esc(f)}</li>`).join("")}</ul></div>`:''}
  <div class="sect"><span class="note">Оцінка орієнтовна. ${esc(d.caveats||"")}</span></div>`;
}

/* ---------- status + form ---------- */
function setStatus(t, err, busy){
  $("#status").className = "status"+(err?" err":"");
  $("#status").innerHTML = (busy?'<span class="dot"></span>':'') + esc(t);
}
function weight(){ const w = +$("#weight").value; return w>0 && w<=5000 ? w : 0; }
function refresh(){ $("#go").disabled = !(file && weight()) || !!ctl; }

function useFile(f){
  if(!f || !(f.type||"").startsWith("image/")) return;
  file = f;
  $("#preview").src = URL.createObjectURL(f); $("#preview").hidden = false; $("#hint").hidden = true;
  refresh();
  if(!weight()) $("#weight").focus({preventScroll:true});
}
$("#photo").addEventListener("change", e=>{ useFile(e.target.files[0]); e.target.value = ""; });
$("#camFallback").addEventListener("change", e=>{ useFile(e.target.files[0]); e.target.value = ""; });
document.addEventListener("paste", e=>{ const it=[...(e.clipboardData?.items||[])].find(i=>i.type.startsWith("image/")); if(it){ e.preventDefault(); useFile(it.getAsFile()); }});
["dragover","drop"].forEach(t=>$("#drop").addEventListener(t, e=>{ e.preventDefault(); if(t==="drop") useFile(e.dataTransfer?.files?.[0]); }));
$("#weight").addEventListener("input", refresh);
$("#presets").addEventListener("click", e=>{ const w=e.target.dataset?.w; if(w){ $("#weight").value=w; refresh(); }});
$("#stop").addEventListener("click", ()=>ctl?.abort());

/* ---------- camera with live viewfinder ---------- */
async function openCamera(){
  if(!navigator.mediaDevices?.getUserMedia){ $("#camFallback").click(); return; }
  try{
    stream = await navigator.mediaDevices.getUserMedia({audio:false, video:{facingMode:{ideal:"environment"}, width:{ideal:1920}, height:{ideal:1440}}});
    const v = $("#camVideo"); v.srcObject = stream;
    $("#cam").hidden = false; document.body.style.overflow = "hidden";
    await v.play().catch(()=>{});
  }catch(e){
    closeCamera();
    if(e && e.name === "NotAllowedError") setStatus("Доступ до камери заборонено. Дозволь камеру в налаштуваннях браузера або вибери фото з галереї.", true);
    else $("#camFallback").click();
  }
}
function closeCamera(){
  stream?.getTracks().forEach(t=>t.stop()); stream = null;
  $("#cam").hidden = true; document.body.style.overflow = "";
}
$("#openCam").addEventListener("click", openCamera);
$("#drop").addEventListener("click", ()=>{ if(!file) openCamera(); });
$("#camClose").addEventListener("click", closeCamera);
$("#camGallery").addEventListener("click", ()=>{ closeCamera(); $("#photo").click(); });
$("#camShot").addEventListener("click", ()=>{
  const v = $("#camVideo"); if(!v.videoWidth) return;
  const cv = document.createElement("canvas"); cv.width = v.videoWidth; cv.height = v.videoHeight;
  cv.getContext("2d").drawImage(v, 0, 0);
  cv.toBlob(b=>{ closeCamera(); if(b) useFile(new File([b], "photo.jpg", {type:"image/jpeg"})); }, "image/jpeg", .9);
});
document.addEventListener("visibilitychange", ()=>{ if(document.hidden && stream) closeCamera(); });

/* ---------- images ---------- */
function loadImg(f){
  return new Promise((res, rej)=>{
    const u = URL.createObjectURL(f), i = new Image();
    i.onload = () => { URL.revokeObjectURL(u); res(i); };
    i.onerror = () => { URL.revokeObjectURL(u); rej(new Error("decode")); };
    i.src = u;
  });
}
async function toJpeg(f, max, q){
  const i = await loadImg(f);
  const s = Math.min(1, max/Math.max(i.naturalWidth, i.naturalHeight));
  const cv = document.createElement("canvas");
  cv.width = Math.round(i.naturalWidth*s); cv.height = Math.round(i.naturalHeight*s);
  cv.getContext("2d").drawImage(i, 0, 0, cv.width, cv.height);
  return cv.toDataURL("image/jpeg", q);
}

/* ---------- access code + API ---------- */
const accessCode = () => ls.get("kaloriya.code") || "";
async function checkAccess(){
  try{
    const r = await fetch("/api/analyze", {headers:{"x-access-code":accessCode()}});
    const j = await r.json();
    $("#gate").hidden = !(j.codeRequired && !j.codeOk);
  }catch{ /* offline: let the user try later */ }
}
$("#gateForm").addEventListener("submit", async e=>{
  e.preventDefault();
  ls.set("kaloriya.code", $("#gateInput").value.trim());
  await checkAccess();
  if(!$("#gate").hidden){ $("#gateInput").select(); $("#gateInput").setCustomValidity("Невірний код"); $("#gateInput").reportValidity(); }
});
$("#gateInput").addEventListener("input", ()=>$("#gateInput").setCustomValidity(""));

async function analyze(image, W, hint, signal){
  const res = await fetch("/api/analyze", {
    method:"POST", signal,
    headers:{"content-type":"application/json", "x-access-code":accessCode()},
    body: JSON.stringify({image, mediaType:"image/jpeg", weight:W, hint})
  });
  const j = await res.json().catch(()=>({}));
  if(!res.ok){ const e = new Error(j.error||"http"); e.status = res.status; throw e; }
  return j;
}

$("#go").addEventListener("click", async ()=>{
  const W = weight(); if(!file || !W || ctl) return;
  ctl = new AbortController(); refresh(); $("#stop").hidden = false;
  setStatus("Розпізнаю інгредієнти… зазвичай 10–30 секунд", false, true);
  const hint = $("#hintText").value.trim();
  try{
    const image = (await toJpeg(file, 1568, .85)).split(",")[1];
    const d = await analyze(image, W, hint, ctl.signal);
    if(d && d.error){ setStatus("На фото не видно їжі: "+d.error, true); }
    else if(!d || !Array.isArray(d.ingredients) || !d.ingredients.length){ setStatus("Не вдалося визначити інгредієнти. Спробуй інше фото.", true); }
    else {
      render(d, W, false);
      $("#result").scrollIntoView({behavior:"smooth", block:"start"});
      const ok = await saveAnalysis(d, W, hint, file);
      setStatus(ok ? "Збережено в історію" : "Не вдалося зберегти в історію", !ok);
    }
  }catch(e){
    if(e.name === "AbortError") setStatus("");
    else if(e.status === 401){ setStatus("Потрібен код доступу.", true); $("#gate").hidden = false; window.scrollTo({top:0}); }
    else if(e.status === 429) setStatus("Забагато запитів. Спробуй за хвилину.", true);
    else if(e.status === 413) setStatus("Фото завелике. Спробуй інше.", true);
    else if(e.message === "decode") setStatus("Не вдалося відкрити це фото. Спробуй JPEG або PNG.", true);
    else if(!navigator.onLine) setStatus("Немає інтернету. Аналіз потребує з'єднання.", true);
    else setStatus(e.message && e.message !== "http" ? e.message : "Збій сервера. Спробуй ще раз.", true);
  }finally{
    ctl = null; $("#stop").hidden = true; refresh();
  }
});

/* ---------- history ---------- */
let hist = [], current = null, delTimer = null, goal = 0, goalEditing = false;

async function loadHistory(){
  try{ hist = (await idb.all()).sort((a,b)=>b.createdAt-a.createdAt); }catch{ hist = []; }
  renderHistory(); renderGoal();
}
async function saveAnalysis(d, W, hint, f){
  const c = calc(d, W), r1 = x => Math.round(x*10)/10;
  let thumb = ""; try{ thumb = await toJpeg(f, 520, .72); }catch{}
  const rec = {id: Date.now().toString(36)+Math.random().toString(36).slice(2,6), createdAt:Date.now(),
    dish:String(d.dish||"Страва"), weight:W, kcal:Math.round(c.kcal), protein:r1(c.protein), fat:r1(c.fat), carbs:r1(c.carbs),
    hint, analysis:d, thumb};
  try{ await idb.put(rec); await loadHistory(); return true; }catch{ return false; }
}

function dayLabel(ts){
  const d = new Date(ts), t = new Date(); t.setHours(0,0,0,0);
  const d0 = new Date(d); d0.setHours(0,0,0,0);
  const diff = Math.round((t-d0)/864e5);
  if(diff===0) return "Сьогодні";
  if(diff===1) return "Вчора";
  return d.toLocaleDateString("uk-UA",{day:"numeric",month:"long", year: d.getFullYear()!==t.getFullYear()?"numeric":undefined});
}
const timeOf = ts => new Date(ts).toLocaleTimeString("uk-UA",{hour:"2-digit",minute:"2-digit"});

function renderHistory(){
  $("#histCount").textContent = hist.length ? hist.length : "";
  $("#histNote").textContent = hist.length ? "Історія зберігається на цьому телефоні." : "";
  if(!hist.length){
    $("#histList").innerHTML = `<div class="empty"><b>Поки порожньо</b>Кожен розбір страви автоматично з'явиться тут.</div>`;
    return;
  }
  const groups = [];
  for(const r of hist){
    const k = dayLabel(r.createdAt);
    let g = groups.find(x=>x.k===k); if(!g){ g={k,items:[],kcal:0}; groups.push(g); }
    g.items.push(r); g.kcal += +r.kcal||0;
  }
  $("#histList").innerHTML = groups.map(g=>`
    <section class="day">
      <div class="dayhead"><b>${esc(g.k)}</b><span class="${goal && g.kcal>goal?'over':''}">${n0(g.kcal)}${goal?' / '+n0(goal):''} ккал</span></div>
      ${g.items.map(r=>`<button class="item" type="button" data-id="${esc(r.id)}">
        ${r.thumb?`<img src="${esc(r.thumb)}" alt="">`:'<span class="ph"></span>'}
        <span class="t"><b>${esc(r.dish)}</b><small>${timeOf(r.createdAt)} · ${n0(r.weight)} г</small></span>
        <span class="k">${n0(r.kcal)}<small>ККАЛ</small></span>
      </button>`).join("")}
    </section>`).join("");
}

/* ---------- daily goal ---------- */
function renderGoal(){
  const today = hist.filter(r=>dayLabel(r.createdAt)==="Сьогодні");
  const sum = k => today.reduce((a,r)=>a+(+r[k]||0),0);
  const eaten = sum("kcal");
  const editing = goalEditing || !goal;
  $("#goalView").hidden = !goal;
  $("#goalForm").hidden = !editing;
  $("#goalCancel").hidden = !goal;
  if(!goal){ $("#goalCard").classList.remove("over"); return; }
  const pct = eaten/goal*100, over = eaten>goal;
  $("#goalCard").classList.toggle("over", over);
  $("#goalEaten").textContent = n0(eaten);
  $("#goalOf").textContent = `/ ${n0(goal)} ккал`;
  $("#goalBar").style.width = Math.min(100, pct)+"%";
  $("#goalMeter").setAttribute("aria-valuenow", Math.round(pct));
  $("#goalLeft").textContent = over ? `Перевищено на ${n0(eaten-goal)} ккал` : `Залишилось ${n0(goal-eaten)} ккал · ${Math.round(pct)}%`;
  $("#goalMacro").textContent = today.length ? `Б ${n0(sum("protein"))} · Ж ${n0(sum("fat"))} · В ${n0(sum("carbs"))} г` : "Ще нічого не з'їдено";
  $("#goalEdit").hidden = goalEditing;
}
$("#goalEdit").addEventListener("click", ()=>{ goalEditing = true; $("#goalInput").value = goal||""; renderGoal(); $("#goalInput").focus(); });
$("#goalCancel").addEventListener("click", ()=>{ goalEditing = false; renderGoal(); });
$("#goalPresets").addEventListener("click", e=>{ const g = e.target.dataset?.g; if(g) $("#goalInput").value = g; });
$("#goalForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const g = Math.round(+$("#goalInput").value);
  if(!(g>=500 && g<=10000)){ $("#goalInput").focus(); return; }
  goal = g; goalEditing = false;
  try{ await idb.set("goal", g); }catch{ ls.set("kaloriya.goal", String(g)); }
  renderGoal(); renderHistory();
});
async function loadGoal(){
  try{ goal = +(await idb.get("goal"))||0; }catch{ goal = 0; }
  if(!goal) goal = +ls.get("kaloriya.goal")||0;
  renderGoal(); renderHistory();
}

/* ---------- navigation ---------- */
function show(view){
  $("#goalCard").hidden = view==="detail";
  $("#viewNew").hidden = view!=="new";
  $("#viewHist").hidden = view!=="hist";
  $("#viewDetail").hidden = view!=="detail";
  $("#tabNew").setAttribute("aria-selected", view==="new");
  $("#tabHist").setAttribute("aria-selected", view!=="new");
  window.scrollTo({top:0});
}
function resetDel(){ clearTimeout(delTimer); $("#del").textContent = "Видалити"; $("#del").dataset.armed = ""; }

$("#tabNew").addEventListener("click", ()=>show("new"));
$("#tabHist").addEventListener("click", ()=>show("hist"));
$("#back").addEventListener("click", ()=>show("hist"));
$("#histList").addEventListener("click", e=>{
  const b = e.target.closest(".item"); if(!b) return;
  const r = hist.find(x=>x.id===b.dataset.id); if(!r) return;
  current = r; resetDel();
  $("#detailImg").hidden = !r.thumb; if(r.thumb) $("#detailImg").src = r.thumb;
  $("#detailWhen").textContent = `${dayLabel(r.createdAt)}, ${timeOf(r.createdAt)}${r.hint?" · підказка: "+r.hint:""}`;
  render(r.analysis, r.weight, false, $("#detailTicket"));
  show("detail");
});
$("#del").addEventListener("click", async ()=>{
  if(!current) return;
  if(!$("#del").dataset.armed){
    $("#del").dataset.armed = "1"; $("#del").textContent = "Точно видалити?";
    delTimer = setTimeout(resetDel, 4000); return;
  }
  resetDel();
  try{ await idb.del(current.id); }catch{}
  current = null; await loadHistory(); show("hist");
});

/* ---------- install prompts (Android button, iPhone instructions) ---------- */
let deferredPrompt = null;
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
function showInstall(html, withButton){
  if(isStandalone() || ls.get("kaloriya.installDismissed")) return;
  $("#installText").innerHTML = html;
  $("#installBtn").hidden = !withButton;
  $("#installBar").hidden = false;
}
window.addEventListener("beforeinstallprompt", e=>{
  e.preventDefault(); deferredPrompt = e;
  showInstall("Встанови «Калорію» на головний екран: відкривається як застосунок.", true);
});
$("#installBtn").addEventListener("click", async ()=>{
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice.catch(()=>{});
  deferredPrompt = null; $("#installBar").hidden = true;
});
$("#installClose").addEventListener("click", ()=>{ $("#installBar").hidden = true; ls.set("kaloriya.installDismissed","1"); });
window.addEventListener("appinstalled", ()=>{ $("#installBar").hidden = true; });
if(isIOS() && !isStandalone()){
  showInstall('Щоб встановити: натисни <span class="ios-share" aria-label="Поділитися"></span> «Поділитися» внизу Safari, потім «На початковий екран».', false);
}

/* ---------- boot ---------- */
render(EXAMPLE, 380, true);
renderHistory(); renderGoal();
loadHistory(); loadGoal(); checkAccess();
navigator.storage?.persist?.().catch(()=>{});
if("serviceWorker" in navigator){
  window.addEventListener("load", ()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}));
}
