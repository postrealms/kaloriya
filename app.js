"use strict";
/* Калорія — PWA client. Analysis runs on /api/analyze (Claude API key stays on the server).
   History and the daily goal live on this device in IndexedDB. Texts live in i18n.js. */

/* Donation links — empty string hides the button */
const DONATE = {
  mono: "https://send.monobank.ua/jar/2NiaJEbwCC",
  kofi: "https://ko-fi.com/postrealms_creative",
};

/* Supabase project (publishable key is public by design; data is protected by row-level security) */
const SB = {
  url: "https://fwfngptvjnclngxvknza.supabase.co",
  key: "sb_publishable_sIq7rRUa3wd3s1aEPwiVRw_lbHEAwF6",
};

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const COLORS = ["--c1","--c2","--c3","--c4","--c5","--c6","--c7","--c8"].map(v=>`var(${v})`);
let file = null, ctl = null, stream = null, lastResult = null, view = "new";

/* ---------- storage helpers ---------- */
const ls = {
  get(k){ try{ return localStorage.getItem(k); }catch{ return null; } },
  set(k,v){ try{ localStorage.setItem(k,v); }catch{} },
  del(k){ try{ localStorage.removeItem(k); }catch{} }
};

/* ---------- language ---------- */
function deviceLang(){
  const list = navigator.languages?.length ? navigator.languages : [navigator.language || "en"];
  for(const l of list){ const c = String(l).toLowerCase().split("-")[0]; if(LANGS[c]) return c; }
  return "en";
}
let langPref = ls.get("kaloriya.lang") || "auto";
let lang = langPref === "auto" || !LANGS[langPref] ? deviceLang() : langPref;
const loc = () => LANGS[lang].locale;

function t(key, vars){
  let s = I18N[lang]?.[key] ?? I18N.en[key] ?? I18N.uk[key] ?? key;
  if(vars && typeof s === "string") s = s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
  return s;
}

function applyI18n(){
  document.documentElement.lang = lang;
  document.title = lang === "uk" ? "Калорія" : "Kaloriya";
  $$("[data-i18n]").forEach(el => el.textContent = t(el.dataset.i18n));
  $$("[data-i18n-ph]").forEach(el => el.placeholder = t(el.dataset.i18nPh));
  $$("[data-i18n-aria]").forEach(el => el.setAttribute("aria-label", t(el.dataset.i18nAria)));
  $$("[data-i18n-alt]").forEach(el => el.alt = t(el.dataset.i18nAlt));
  $("#tabs").setAttribute("aria-label", t("tab.new") + " / " + t("tab.hist"));
  renderLangs(); renderDonate(); renderInstall(); if(typeof renderAuthState === "function" && $("#accTitle")) renderAuthState();
  if(lastResult) render(lastResult.d, lastResult.W, false); else render(EXAMPLES[lang], 380, true);
  renderHistory(); renderGoal();
  if(view === "detail" && current) openDetail(current);
}

function setLang(pref){
  langPref = pref; ls.set("kaloriya.lang", pref);
  lang = pref === "auto" || !LANGS[pref] ? deviceLang() : pref;
  setStatus("");
  applyI18n();
  if(session) saveProfile({lang: pref}).catch(()=>{});
}

/* ---------- formatting ---------- */
const esc = s => String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const n0 = x => Math.round(x).toLocaleString(loc());
const n1 = x => (Math.round(x*10)/10).toLocaleString(loc());

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
      const tr = d.transaction(store, mode), req = fn(tr.objectStore(store));
      tr.oncomplete = () => res(req?.result);
      tr.onerror = () => rej(tr.error);
      tr.onabort = () => rej(tr.error);
    });
  };
  return {
    all: () => tx("meals","readonly", s=>s.getAll()),
    put: r => tx("meals","readwrite", s=>s.put(r)),
    del: id => tx("meals","readwrite", s=>s.delete(id)),
    get: k => tx("kv","readonly", s=>s.get(k)),
    set: (k,v) => tx("kv","readwrite", s=>s.put(v,k)),
    delKey: k => tx("kv","readwrite", s=>s.delete(k)),
    clear: () => tx("meals","readwrite", s=>s.clear()),
  };
})();

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
  const th = t("r.th");
  el.innerHTML = `
  <div class="top">
    ${isExample?`<span class="example">${esc(t("r.example"))}</span>`:''}
    <h2 class="dish">${esc(d.dish)}</h2>
    <div class="meta">${esc(d.cooking_method)} · ${n0(W)} ${t("g")} · <span class="conf">${t("r.conf",{n:Math.round((+d.confidence||0)*100)})}</span></div>
    ${d.cooking_note?`<div class="meta">${esc(d.cooking_note)}</div>`:''}
  </div>
  <div class="totals">
    <div class="kcal"><b>${n0(c.kcal)}</b><small>${t("kcal")}</small></div>
    <div><b>${n1(c.protein)}</b><small>${t("r.protein")}</small></div>
    <div><b>${n1(c.fat)}</b><small>${t("r.fat")}</small></div>
    <div><b>${n1(c.carbs)}</b><small>${t("r.carbs")}</small></div>
  </div>
  <div class="sect">
    <span class="lbl">${t("r.shareW")}</span>
    <div class="bar">${bar("g", W)}</div>
    <span class="lbl">${t("r.shareK")}</span>
    <div class="bar">${bar("kcal", kcalSum)}</div>
    <div class="legend">${c.rows.map(r=>`<span><i style="background:${r.color}"></i>${esc(r.name)}</span>`).join("")}</div>
    <div class="note">${t("r.energy",{p:Math.round(c.protein*4/macroK*100), f:Math.round(c.fat*9/macroK*100), c:Math.round(c.carbs*4/macroK*100), fi:n1(c.fiber)})}</div>
  </div>
  <div class="sect">
    <span class="lbl">${t("r.ing")}</span>
    <div class="tbl"><table>
      <thead><tr>${th.map(x=>`<th>${esc(x)}</th>`).join("")}</tr></thead>
      <tbody>${c.rows.map(r=>`<tr class="${(+r.confidence||1)<.5?'low':''}">
        <td><span class="ing"><i style="background:${r.color}"></i>${esc(r.name)}${r.hidden?`<span class="hidden-tag">${t("r.hidden")}</span>`:''}</span></td>
        <td>${Math.round(r.pct)}</td><td>${n0(r.g)}</td><td>${n0(r.kcal)}</td><td>${n1(r.protein)}</td><td>${n1(r.fat)}</td><td>${n1(r.carbs)}</td></tr>`).join("")}</tbody>
    </table></div>
  </div>
  <div class="sect">
    <span class="lbl">${t("r.benefit")}</span>
    <div class="cards">${c.rows.filter(r=>r.benefit).map(r=>`<div class="card"><i style="background:${r.color}"></i><div><h3>${esc(r.name)}</h3><p>${esc(r.benefit)}</p></div></div>`).join("")}</div>
  </div>
  ${(d.facts||[]).length?`<div class="sect"><span class="lbl">${t("r.facts")}</span><ul class="facts">${d.facts.map(f=>`<li>${esc(f)}</li>`).join("")}</ul></div>`:''}
  <div class="sect"><span class="note">${t("r.approx")} ${esc(d.caveats||"")}</span></div>`;
}

/* ---------- status + form ---------- */
function setStatus(text, err, busy){
  $("#status").className = "status"+(err?" err":"");
  $("#status").innerHTML = (busy?'<span class="dot"></span>':'') + esc(text);
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
["dragover","drop"].forEach(ev=>$("#drop").addEventListener(ev, e=>{ e.preventDefault(); if(ev==="drop") useFile(e.dataTransfer?.files?.[0]); }));
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
    if(e && e.name === "NotAllowedError") setStatus(t("st.camDenied"), true);
    else $("#camFallback").click();
  }
}
function closeCamera(){
  stream?.getTracks().forEach(tr=>tr.stop()); stream = null;
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
let authRequired = false, usage = null;
async function apiHeaders(extra){
  const h = {"x-access-code": accessCode(), ...(extra||{})};
  const tok = session ? await accessToken().catch(()=>null) : null;
  if(tok) h.Authorization = "Bearer " + tok;
  return h;
}
async function checkAccess(){
  try{
    const r = await fetch("/api/analyze", {headers: await apiHeaders()});
    const j = await r.json();
    $("#gate").hidden = !(j.codeRequired && !j.codeOk);
    authRequired = !!j.authRequired;
    if(authRequired && session && j.signedIn === false){ saveSession(null); onAuthChange(); }
    usage = j.usage || null;
  }catch{ /* offline: let the user try later */ }
  renderAuthState();
}
$("#gateForm").addEventListener("submit", async e=>{
  e.preventDefault();
  ls.set("kaloriya.code", $("#gateInput").value.trim());
  await checkAccess();
  if(!$("#gate").hidden){ $("#gateInput").select(); $("#gateInput").setCustomValidity(t("gate.wrong")); $("#gateInput").reportValidity(); }
});
$("#gateInput").addEventListener("input", ()=>$("#gateInput").setCustomValidity(""));

async function analyze(image, W, hint, signal){
  const res = await fetch("/api/analyze", {
    method:"POST", signal,
    headers: await apiHeaders({"content-type":"application/json"}),
    body: JSON.stringify({image, mediaType:"image/jpeg", weight:W, hint, lang})
  });
  const j = await res.json().catch(()=>({}));
  if(j.usage) { usage = j.usage; renderAuthState(); }
  if(!res.ok){ const e = new Error(j.code || "generic"); e.status = res.status; e.code = j.code; throw e; }
  if(j._usage){ usage = j._usage; delete j._usage; renderAuthState(); }
  return j;
}

$("#go").addEventListener("click", async ()=>{
  const W = weight(); if(!file || !W || ctl) return;
  if(authRequired && !session){ openAccount(); return; }
  ctl = new AbortController(); refresh(); $("#stop").hidden = false; $("#nudge").hidden = true;
  setStatus(t("st.working"), false, true);
  const hint = $("#hintText").value.trim();
  try{
    const image = (await toJpeg(file, 1568, .85)).split(",")[1];
    const d = await analyze(image, W, hint, ctl.signal);
    if(d && d.error){ setStatus(t("st.notFood",{x:d.error}), true); }
    else if(!d || !Array.isArray(d.ingredients) || !d.ingredients.length){ setStatus(t("st.noIng"), true); }
    else {
      lastResult = {d, W};
      render(d, W, false);
      $("#result").scrollIntoView({behavior:"smooth", block:"start"});
      const ok = await saveAnalysis(d, W, hint, file);
      setStatus(ok ? t("st.saved") : t("st.saveFail"), !ok);
      maybeNudge();
    }
  }catch(e){
    if(e.name === "AbortError") setStatus("");
    else if(e.message === "decode") setStatus(t("st.decode"), true);
    else if(e.status === 401 && e.code === "signin"){ saveSession(null); onAuthChange(); setStatus(t("err.signin"), true); }
    else if(e.status === 401){ setStatus(t("err.code"), true); $("#gate").hidden = false; window.scrollTo({top:0}); }
    else if(e.code === "daily_limit") setStatus(t("err.daily_limit",{n: usage?.limit || ""}), true);
    else if(!e.status && !navigator.onLine) setStatus(t("st.offline"), true);
    else if(!e.status) setStatus(t("err.network"), true);
    else {
      const key = "err." + (e.code || (e.status===429?"rate":e.status===413?"too_big":"generic"));
      setStatus(I18N[lang][key] ? t(key) : t("err.generic"), true);
    }
  }finally{
    ctl = null; $("#stop").hidden = true; refresh();
  }
});

/* ---------- history ---------- */
let hist = [], current = null, delTimer = null, goal = 0, goalEditing = false;

let remote = [], pendingCount = 0;
async function loadHistory(fetchRemote){
  let local = [];
  try{ local = await idb.all(); }catch{}
  pendingCount = local.length;
  if(session && fetchRemote !== false){
    try{ remote = await fetchMeals(); idb.set("remoteCache", remote).catch(()=>{}); }
    catch{ if(!remote.length){ try{ remote = (await idb.get("remoteCache")) || []; }catch{} } }
  }
  if(!session) remote = [];
  const ids = new Set(local.map(x=>x.id));
  hist = [...local.map(x=>({...x, _local:true})), ...remote.filter(x=>!ids.has(x.id))].sort((a,b)=>b.createdAt-a.createdAt);
  renderHistory(); renderGoal();
}
async function saveAnalysis(d, W, hint, f){
  const c = calc(d, W), r1 = x => Math.round(x*10)/10;
  let thumb = ""; try{ thumb = await toJpeg(f, 520, .72); }catch{}
  const rec = {id: Date.now().toString(36)+Math.random().toString(36).slice(2,6), createdAt:Date.now(),
    dish:String(d.dish||t("dish.default")), weight:W, kcal:Math.round(c.kcal), protein:r1(c.protein), fat:r1(c.fat), carbs:r1(c.carbs),
    hint, lang, analysis:d, thumb};
  try{ await idb.put(rec); }catch{ return false; }
  await loadHistory(false);
  if(session) syncPending().catch(()=>{});
  return true;
}

function dayDiff(ts){
  const today = new Date(); today.setHours(0,0,0,0);
  const d0 = new Date(ts); d0.setHours(0,0,0,0);
  return Math.round((today-d0)/864e5);
}
function dayLabel(ts){
  const diff = dayDiff(ts), d = new Date(ts);
  if(diff===0) return t("h.today");
  if(diff===1) return t("h.yesterday");
  return d.toLocaleDateString(loc(),{day:"numeric",month:"long", year: d.getFullYear()!==new Date().getFullYear()?"numeric":undefined});
}
const timeOf = ts => new Date(ts).toLocaleTimeString(loc(),{hour:"2-digit",minute:"2-digit"});

function renderHistory(){
  $("#histCount").textContent = hist.length ? hist.length : "";
  $("#histNote").textContent = !hist.length ? "" : session ? t("h.account") + (pendingCount ? " " + t("h.pending",{n:pendingCount}) : "") : t("h.local");
  if(!hist.length){
    $("#histList").innerHTML = `<div class="empty"><b>${t("h.emptyT")}</b>${t("h.emptyX")}</div>`;
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
      <div class="dayhead"><b>${esc(g.k)}</b><span class="${goal && g.kcal>goal?'over':''}">${n0(g.kcal)}${goal?' / '+n0(goal):''} ${t("kcal")}</span></div>
      ${g.items.map(r=>`<button class="item" type="button" data-id="${esc(r.id)}">
        ${r.thumb?`<img src="${esc(r.thumb)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'ph'}))">`:'<span class="ph"></span>'}
        <span class="t"><b>${esc(r.dish)}</b><small>${timeOf(r.createdAt)} · ${n0(r.weight)} ${t("g")}</small></span>
        <span class="k">${n0(r.kcal)}<small>${t("h.kcalUp")}</small></span>
      </button>`).join("")}
    </section>`).join("");
}

/* ---------- daily goal ---------- */
function renderGoal(){
  const today = hist.filter(r=>dayDiff(r.createdAt)===0);
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
  $("#goalOf").textContent = t("goal.of",{n:n0(goal)});
  $("#goalBar").style.width = Math.min(100, pct)+"%";
  $("#goalMeter").setAttribute("aria-valuenow", Math.round(pct));
  $("#goalLeft").textContent = over ? t("goal.over",{n:n0(eaten-goal)}) : t("goal.left",{n:n0(goal-eaten), p:Math.round(pct)});
  $("#goalMacro").textContent = today.length ? t("goal.macro",{p:n0(sum("protein")), f:n0(sum("fat")), c:n0(sum("carbs"))}) : t("goal.none");
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
  if(session) saveProfile({goal: g}).catch(()=>{});
});
async function loadGoal(){
  try{ goal = +(await idb.get("goal"))||0; }catch{ goal = 0; }
  if(!goal) goal = +ls.get("kaloriya.goal")||0;
  renderGoal(); renderHistory();
}

/* ---------- navigation ---------- */
function show(v){
  view = v;
  const main = v==="new" || v==="hist";
  $("#tabs").hidden = !main;
  $("#goalCard").hidden = !main;
  $("#viewNew").hidden = v!=="new";
  $("#viewHist").hidden = v!=="hist";
  $("#viewDetail").hidden = v!=="detail";
  $("#viewSettings").hidden = v!=="settings";
  $("#viewAccount").hidden = v!=="account";
  $("#tabNew").setAttribute("aria-selected", v==="new");
  $("#tabHist").setAttribute("aria-selected", v==="hist" || v==="detail");
  window.scrollTo({top:0});
}
function resetDel(){ clearTimeout(delTimer); $("#del").textContent = t("del"); $("#del").dataset.armed = ""; }
function openDetail(r){
  current = r; resetDel();
  $("#detailImg").hidden = !r.thumb; if(r.thumb) $("#detailImg").src = r.thumb;
  $("#detailWhen").textContent = `${dayLabel(r.createdAt)}, ${timeOf(r.createdAt)}${r.hint?" · "+t("h.hint")+": "+r.hint:""}`;
  render(r.analysis, r.weight, false, $("#detailTicket"));
}

$("#tabNew").addEventListener("click", ()=>show("new"));
$("#tabHist").addEventListener("click", ()=>show("hist"));
$("#back").addEventListener("click", ()=>show("hist"));
$("#histList").addEventListener("click", e=>{
  const b = e.target.closest(".item"); if(!b) return;
  const r = hist.find(x=>x.id===b.dataset.id); if(!r) return;
  openDetail(r); show("detail");
});
$("#del").addEventListener("click", async ()=>{
  if(!current) return;
  if(!$("#del").dataset.armed){
    $("#del").dataset.armed = "1"; $("#del").textContent = t("del.sure");
    delTimer = setTimeout(resetDel, 4000); return;
  }
  resetDel();
  try{
    if(current._local) await idb.del(current.id);
    else { await deleteMeal(current); remote = remote.filter(x=>x.id!==current.id); }
  }catch{ setStatus(t("err.network"), true); }
  current = null; await loadHistory(false); show("hist");
});

/* ---------- settings: language + support ---------- */
let returnView = "new";
$("#openSettings").addEventListener("click", ()=>{ if(view!=="settings" && view!=="account") returnView = view==="detail" ? "hist" : view; show("settings"); });
$("#settingsBack").addEventListener("click", ()=>show(returnView));

function renderLangs(){
  const opts = [["auto", t("set.auto",{x:LANGS[deviceLang()].name})], ...Object.entries(LANGS).map(([k,v])=>[k, v.name])];
  $("#langs").querySelectorAll(".opt").forEach(n=>n.remove());
  for(const [val, label] of opts){
    const lab = document.createElement("label"); lab.className = "opt";
    const inp = document.createElement("input"); inp.type = "radio"; inp.name = "lang"; inp.value = val; inp.id = "lang-"+val;
    inp.checked = langPref === val;
    inp.addEventListener("change", ()=>setLang(val));
    const span = document.createElement("span"); span.textContent = label;
    lab.append(inp, span); $("#langs").append(lab);
  }
}

function donateLinks(){
  const links = [];
  if(DONATE.mono) links.push({key:"set.mono", url:DONATE.mono});
  if(DONATE.kofi) links.push({key:"set.kofi", url:DONATE.kofi});
  if(lang !== "uk") links.reverse();          // Ko-fi first for non-Ukrainian users
  return links;
}
function renderDonate(){
  const links = donateLinks();
  $("#support").hidden = !links.length;
  $("#donateLinks").innerHTML = links.map((l,i)=>`<a class="btn${i?' ghost':''}" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(t(l.key))}</a>`).join("");
}

/* Gentle reminder: after the 10th saved meal, at most once a month, never during analysis */
function maybeNudge(){
  if(!donateLinks().length || hist.length < 10) return;
  const last = +ls.get("kaloriya.nudgeAt") || 0;
  if(Date.now() - last < 30*864e5) return;
  $("#nudge").hidden = false;
}
function snoozeNudge(){ ls.set("kaloriya.nudgeAt", String(Date.now())); $("#nudge").hidden = true; }
$("#nudgeLater").addEventListener("click", snoozeNudge);
$("#nudgeGo").addEventListener("click", ()=>{ snoozeNudge(); returnView = "new"; show("settings"); $("#support").scrollIntoView({block:"start"}); });

/* ---------- account: Supabase Auth + REST, no SDK ---------- */
let session = null;
try{ session = JSON.parse(ls.get("kaloriya.session") || "null"); }catch{}
function saveSession(s){ session = s; s ? ls.set("kaloriya.session", JSON.stringify(s)) : ls.del("kaloriya.session"); }

async function sbAuth(path, body, token){
  const r = await fetch(SB.url + "/auth/v1/" + path, {
    method:"POST",
    headers:{apikey:SB.key, "content-type":"application/json", ...(token ? {Authorization:"Bearer "+token} : {})},
    body: JSON.stringify(body || {})
  });
  const j = await r.json().catch(()=>({}));
  if(!r.ok){ const e = new Error(j.msg || j.error_description || j.message || "auth"); e.status = r.status; e.code = j.error_code || j.code || j.error; throw e; }
  return j;
}
const toSession = (j, user) => ({access_token:j.access_token, refresh_token:j.refresh_token,
  expires_at: Date.now() + (j.expires_in || 3600)*1000, user: user || {id:j.user?.id, email:j.user?.email}});

let refreshing = null;
async function accessToken(){
  if(!session) return null;
  if(Date.now() < session.expires_at - 60000) return session.access_token;
  refreshing ||= sbAuth("token?grant_type=refresh_token", {refresh_token: session.refresh_token})
    .then(j => saveSession(toSession(j, session.user)))
    .catch(e => { if(e.status === 400 || e.status === 401){ saveSession(null); onAuthChange(); } throw e; })
    .finally(() => { refreshing = null; });
  await refreshing;
  return session?.access_token || null;
}

async function sb(path, {method="GET", json, body, headers={}} = {}){
  const tok = await accessToken();
  if(!tok){ const e = new Error("signin"); e.status = 401; throw e; }
  const r = await fetch(SB.url + path, {method,
    headers:{apikey:SB.key, Authorization:"Bearer "+tok, ...(json!==undefined ? {"content-type":"application/json"} : {}), ...headers},
    body: json!==undefined ? JSON.stringify(json) : body});
  const text = await r.text();
  if(!r.ok){ const e = new Error(text.slice(0,200) || "sb"); e.status = r.status; throw e; }
  return text ? JSON.parse(text) : null;
}

const uid = () => session?.user?.id;
const thumbPath = id => `${uid()}/${id}.jpg`;
async function dataUrlToBlob(u){ return (await fetch(u)).blob(); }

async function fetchMeals(){
  const rows = await sb("/rest/v1/meals?select=id,created_at,dish,weight,kcal,protein,fat,carbs,hint,lang,analysis,thumb_path&order=created_at.desc&limit=1000");
  const paths = rows.map(r=>r.thumb_path).filter(Boolean);
  const urls = {};
  for(let i=0; i<paths.length; i+=200){
    try{
      const signed = await sb("/storage/v1/object/sign/thumbs", {method:"POST", json:{expiresIn: 60*60*24, paths: paths.slice(i, i+200)}});
      for(const x of signed || []) if(x.signedURL) urls[x.path] = SB.url + "/storage/v1" + x.signedURL;
    }catch{}
  }
  return rows.map(r=>({id:r.id, createdAt:Date.parse(r.created_at), dish:r.dish, weight:r.weight, kcal:r.kcal,
    protein:r.protein, fat:r.fat, carbs:r.carbs, hint:r.hint||"", lang:r.lang, analysis:r.analysis,
    thumb_path:r.thumb_path, thumb: urls[r.thumb_path] || ""}));
}

let syncing = null;
async function syncPending(){
  if(!session || !navigator.onLine) return 0;
  syncing ||= (async ()=>{
    const local = await idb.all().catch(()=>[]);
    let moved = 0;
    for(const m of local.sort((a,b)=>a.createdAt-b.createdAt)){
      try{
        let path = null;
        if(m.thumb && m.thumb.startsWith("data:")){
          path = thumbPath(m.id);
          await sb("/storage/v1/object/thumbs/" + path, {method:"POST", body: await dataUrlToBlob(m.thumb),
            headers:{"content-type":"image/jpeg", "x-upsert":"true"}});
        }
        await sb("/rest/v1/meals", {method:"POST", headers:{Prefer:"resolution=merge-duplicates,return=minimal"},
          json:{id:m.id, created_at:new Date(m.createdAt).toISOString(), dish:m.dish, weight:m.weight, kcal:m.kcal,
            protein:m.protein, fat:m.fat, carbs:m.carbs, hint:m.hint||null, lang:m.lang||lang, analysis:m.analysis, thumb_path:path}});
        await idb.del(m.id); moved++;
      }catch(e){ if(e.status === 401) break; }
    }
    if(moved) await loadHistory();
    return moved;
  })().finally(()=>{ syncing = null; });
  return syncing;
}

async function deleteMeal(m){
  await sb("/rest/v1/meals?id=eq." + encodeURIComponent(m.id), {method:"DELETE"});
  if(m.thumb_path) await sb("/storage/v1/object/thumbs", {method:"DELETE", json:{prefixes:[m.thumb_path]}}).catch(()=>{});
}

async function saveProfile(fields){
  if(!session) return;
  await sb("/rest/v1/profiles", {method:"POST", headers:{Prefer:"resolution=merge-duplicates,return=minimal"},
    json:{id: uid(), ...fields, updated_at: new Date().toISOString()}});
}
async function loadProfile(){
  const rows = await sb("/rest/v1/profiles?select=goal,lang&id=eq." + uid());
  const p = rows?.[0];
  const patch = {};
  if(p?.goal){ goal = p.goal; idb.set("goal", goal).catch(()=>{}); }
  else if(goal) patch.goal = goal;
  if(p?.lang && p.lang !== langPref){ langPref = p.lang; ls.set("kaloriya.lang", p.lang); lang = p.lang==="auto"||!LANGS[p.lang] ? deviceLang() : p.lang; applyI18n(); }
  else if(!p?.lang) patch.lang = langPref;
  if(Object.keys(patch).length) await saveProfile(patch);
  renderGoal(); renderHistory();
}

/* sign-in flow: email → 6-digit code from the email */
let pendingEmail = "", resendTimer = null;
function authError(e){
  const c = String(e.code || "") + " " + String(e.message || "");
  if(e.status === 429 || /rate.?limit/i.test(c)) return t("err.too_many_emails");
  if(/otp|token|expired|invalid.*(code|token)/i.test(c) || e.status === 403) return t("err.bad_code");
  if(/email/i.test(c)) return t("err.email");
  return navigator.onLine ? t("err.generic") : t("st.offline");
}
function accStatus(text, err){ $("#accStatus").textContent = text || ""; $("#accStatus").className = "status" + (err ? " err" : ""); }
function startResendCooldown(){
  let n = 60; clearInterval(resendTimer);
  const tick = () => { $("#accResend").disabled = n > 0; $("#accResend").textContent = n > 0 ? t("acc.resendIn",{n}) : t("acc.resend"); n--; if(n < -1) clearInterval(resendTimer); };
  tick(); resendTimer = setInterval(tick, 1000);
}
async function requestCode(email){
  accStatus(""); $("#accSend").disabled = true;
  try{
    await sbAuth("otp", {email, create_user:true});
    pendingEmail = email;
    $("#accStep1").hidden = true; $("#accStep2").hidden = false;
    $("#accSentTo").textContent = t("acc.codeSent",{e:email});
    $("#accCode").value = ""; $("#accCode").focus();
    startResendCooldown();
  }catch(e){ accStatus(authError(e), true); }
  finally{ $("#accSend").disabled = false; }
}
$("#accEmailForm").addEventListener("submit", e=>{ e.preventDefault(); const v = $("#accEmail").value.trim().toLowerCase(); if(v) requestCode(v); });
$("#accResend").addEventListener("click", ()=>{ if(pendingEmail) requestCode(pendingEmail); });
$("#accOther").addEventListener("click", ()=>{ $("#accStep2").hidden = true; $("#accStep1").hidden = false; accStatus(""); $("#accEmail").focus(); });
$("#accCodeForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const code = $("#accCode").value.replace(/\D/g, "");
  if(code.length < 6) return;
  $("#accVerify").disabled = true; accStatus("");
  try{
    const j = await sbAuth("verify", {type:"email", email: pendingEmail, token: code});
    saveSession(toSession(j));
    const hadLocal = (await idb.all().catch(()=>[])).length;
    await onAuthChange(true);
    setStatus(t("acc.welcome") + (hadLocal ? " " + t("acc.migrated") : ""));
    show(returnView === "account" || returnView === "settings" ? "new" : returnView);
  }catch(err){ accStatus(authError(err), true); }
  finally{ $("#accVerify").disabled = false; }
});
$("#accCode").addEventListener("input", e=>{ const v = e.target.value.replace(/\D/g, ""); if(v !== e.target.value) e.target.value = v; });

$("#accSignout").addEventListener("click", async ()=>{
  const tok = session?.access_token;
  saveSession(null);
  if(tok) sbAuth("logout", {}, tok).catch(()=>{});
  remote = []; idb.delKey("remoteCache").catch(()=>{});
  await onAuthChange();
  show("settings");
});
let delArmed = false, delAccTimer = null;
$("#accDelete").addEventListener("click", async ()=>{
  if(!delArmed){
    delArmed = true; $("#accDelete").textContent = t("acc.deleteSure");
    delAccTimer = setTimeout(()=>{ delArmed = false; $("#accDelete").textContent = t("acc.delete"); }, 5000);
    return;
  }
  clearTimeout(delAccTimer); delArmed = false; $("#accDelete").disabled = true;
  try{
    const r = await fetch("/api/account", {method:"DELETE", headers: await apiHeaders()});
    if(!r.ok) throw new Error("delete");
    saveSession(null); remote = [];
    await Promise.all([idb.clear(), idb.delKey("remoteCache"), idb.delKey("goal")]).catch(()=>{});
    goal = 0; ls.del("kaloriya.goal");
    await onAuthChange();
    show("settings"); setStatus(t("acc.deleted"));
    accStatus(t("acc.deleted"));
  }catch{ accStatus(t("err.generic"), true); }
  finally{ $("#accDelete").disabled = false; $("#accDelete").textContent = t("acc.delete"); }
});

function openAccount(){ if(view !== "account" && view !== "settings") returnView = view === "detail" ? "hist" : view; show("account"); }
$("#accountBack").addEventListener("click", ()=>show(returnView === "account" ? "new" : returnView));
$("#signinCardBtn").addEventListener("click", openAccount);
$("#settingsAccountBtn").addEventListener("click", openAccount);

function renderAuthState(){
  const signedIn = !!session;
  $("#signinCard").hidden = !(authRequired && !signedIn);
  $("#accOut").hidden = signedIn;
  $("#accIn").hidden = !signedIn;
  $("#accTitle").textContent = signedIn ? t("acc.title") : t("acc.signinTitle");
  if(signedIn){
    $("#accWho").textContent = t("acc.signedAs",{e: session.user?.email || ""});
    $("#accUsage").textContent = usage ? t("acc.usage",{u:usage.used, l:usage.limit}) : "";
  }
  $("#settingsAccountText").textContent = signedIn ? (session.user?.email || "") : t("acc.guest");
  $("#settingsAccountBtn").textContent = signedIn ? t("acc.manage") : t("acc.signin");
  $("#usageLine").textContent = signedIn && usage ? t("acc.usage",{u:usage.used, l:usage.limit}) : "";
  $("#usageLine").hidden = !(signedIn && usage);
}

async function onAuthChange(justSignedIn){
  renderAuthState();
  if(session){
    if(justSignedIn) await syncPending().catch(()=>{});
    await Promise.all([loadProfile().catch(()=>{}), loadHistory()]);
    checkAccess();
  }else{
    remote = [];
    await loadHistory(false);
  }
}
window.addEventListener("online", ()=>{ if(session) syncPending().catch(()=>{}); });

/* ---------- install prompts (Android button, iPhone instructions) ---------- */
let deferredPrompt = null, installMode = null;
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
function renderInstall(){
  if(!installMode || isStandalone() || ls.get("kaloriya.installDismissed")){ $("#installBar").hidden = true; return; }
  $("#installText").innerHTML = t(installMode === "ios" ? "install.ios" : "install.android");  // trusted strings from i18n.js
  $("#installBtn").hidden = installMode !== "android";
  $("#installBar").hidden = false;
}
window.addEventListener("beforeinstallprompt", e=>{ e.preventDefault(); deferredPrompt = e; installMode = "android"; renderInstall(); });
$("#installBtn").addEventListener("click", async ()=>{
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice.catch(()=>{});
  deferredPrompt = null; installMode = null; renderInstall();
});
$("#installClose").addEventListener("click", ()=>{ ls.set("kaloriya.installDismissed","1"); renderInstall(); });
window.addEventListener("appinstalled", ()=>{ installMode = null; renderInstall(); });
if(isIOS() && !isStandalone()) installMode = "ios";
window.addEventListener("languagechange", ()=>{ if(langPref === "auto") setLang("auto"); });

/* ---------- boot ---------- */
applyI18n();
loadGoal().then(()=>onAuthChange(!!session)); checkAccess();
navigator.storage?.persist?.().catch(()=>{});
if("serviceWorker" in navigator){
  window.addEventListener("load", ()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}));
}
