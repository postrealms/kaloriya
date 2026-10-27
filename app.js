"use strict";
/* Калорія — PWA client. Analysis runs on /api/analyze (Claude API key stays on the server).
   History and the daily goal live on this device in IndexedDB. Texts live in i18n.js. */

/* Donation links — empty string hides the button */
const DONATE = {
  mono: "https://send.monobank.ua/jar/2NiaJEbwCC",
  kofi: "https://ko-fi.com/postrealms_creative",
};

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const COLORS = ["--c1","--c2","--c3","--c4","--c5","--c6","--c7","--c8"].map(v=>`var(${v})`);
let file = null, ctl = null, stream = null, lastResult = null, view = "new";

/* ---------- storage helpers ---------- */
const ls = {
  get(k){ try{ return localStorage.getItem(k); }catch{ return null; } },
  set(k,v){ try{ localStorage.setItem(k,v); }catch{} }
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
  renderLangs(); renderDonate(); renderInstall();
  if(lastResult) render(lastResult.d, lastResult.W, false); else render(EXAMPLES[lang], 380, true);
  renderHistory(); renderGoal();
  if(view === "detail" && current) openDetail(current);
}

function setLang(pref){
  langPref = pref; ls.set("kaloriya.lang", pref);
  lang = pref === "auto" || !LANGS[pref] ? deviceLang() : pref;
  setStatus("");
  applyI18n();
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
  if(!$("#gate").hidden){ $("#gateInput").select(); $("#gateInput").setCustomValidity(t("gate.wrong")); $("#gateInput").reportValidity(); }
});
$("#gateInput").addEventListener("input", ()=>$("#gateInput").setCustomValidity(""));

async function analyze(image, W, hint, signal){
  const res = await fetch("/api/analyze", {
    method:"POST", signal,
    headers:{"content-type":"application/json", "x-access-code":accessCode()},
    body: JSON.stringify({image, mediaType:"image/jpeg", weight:W, hint, lang})
  });
  const j = await res.json().catch(()=>({}));
  if(!res.ok){ const e = new Error(j.code || "generic"); e.status = res.status; e.code = j.code; throw e; }
  return j;
}

$("#go").addEventListener("click", async ()=>{
  const W = weight(); if(!file || !W || ctl) return;
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
    else if(e.status === 401){ setStatus(t("err.code"), true); $("#gate").hidden = false; window.scrollTo({top:0}); }
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

async function loadHistory(){
  try{ hist = (await idb.all()).sort((a,b)=>b.createdAt-a.createdAt); }catch{ hist = []; }
  renderHistory(); renderGoal();
}
async function saveAnalysis(d, W, hint, f){
  const c = calc(d, W), r1 = x => Math.round(x*10)/10;
  let thumb = ""; try{ thumb = await toJpeg(f, 520, .72); }catch{}
  const rec = {id: Date.now().toString(36)+Math.random().toString(36).slice(2,6), createdAt:Date.now(),
    dish:String(d.dish||t("dish.default")), weight:W, kcal:Math.round(c.kcal), protein:r1(c.protein), fat:r1(c.fat), carbs:r1(c.carbs),
    hint, lang, analysis:d, thumb};
  try{ await idb.put(rec); await loadHistory(); return true; }catch{ return false; }
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
  $("#histNote").textContent = hist.length ? t("h.local") : "";
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
        ${r.thumb?`<img src="${esc(r.thumb)}" alt="">`:'<span class="ph"></span>'}
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
  try{ await idb.del(current.id); }catch{}
  current = null; await loadHistory(); show("hist");
});

/* ---------- settings: language + support ---------- */
let returnView = "new";
$("#openSettings").addEventListener("click", ()=>{ if(view!=="settings") returnView = view==="detail" ? "hist" : view; show("settings"); });
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
loadHistory(); loadGoal(); checkAccess();
navigator.storage?.persist?.().catch(()=>{});
if("serviceWorker" in navigator){
  window.addEventListener("load", ()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}));
}
