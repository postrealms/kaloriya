"use strict";
/* Калорія — feedback module (accuracy rating per analysis + message to the developer).
   Self-contained on purpose so it can be switched off or removed in one step:
     • quick:  Vercel env FEEDBACK=off → Redeploy (buttons and form disappear)
     • full:   delete this file and its <script> tag in index.html, run supabase/feedback_rollback.sql
   Depends only on globals from app.js: $, esc, lang, session, sb, uid. Data: tables meal_ratings, feedback_messages. */

window.Feedback = (() => {
  const TEXT = {
    uk: {
      q: "Наскільки точний розбір?", good: "Точно", bad: "Неточно",
      thanks: "Дякуємо! Це допомагає покращувати розпізнавання.",
      whatWrong: "Що не так? (необов'язково)", whatPh: "Напр.: це був рис, а не кускус; олії було більше",
      send: "Надіслати", sent: "Дякуємо, записали.", change: "Змінити",
      msgTitle: "Написати розробнику", msgText: "Ідея, помилка чи щось незручне? Пиши як є, кожне повідомлення читаю.",
      msgPh: "Твоє повідомлення", msgSent: "Надіслано. Дякуємо!", err: "Не вдалося надіслати. Спробуй ще раз.",
      needSignin: "Увійди в акаунт, щоб надіслати відгук.",
    },
    en: {
      q: "How accurate is this analysis?", good: "Accurate", bad: "Not accurate",
      thanks: "Thanks! This helps improve recognition.",
      whatWrong: "What's wrong? (optional)", whatPh: "E.g. it was rice, not couscous; there was more oil",
      send: "Send", sent: "Thanks, noted.", change: "Change",
      msgTitle: "Message the developer", msgText: "An idea, a bug or something awkward? Write it as it is — I read every message.",
      msgPh: "Your message", msgSent: "Sent. Thank you!", err: "Couldn't send. Try again.",
      needSignin: "Sign in to send feedback.",
    },
  };
  const tx = k => (TEXT[lang] || TEXT.en)[k];
  const APP_VERSION = (document.querySelector(".tag")?.textContent || "").trim();

  let enabled = false;
  let ratings = null;            // Map meal_id -> {rating, comment}; null = not loaded yet
  let loading = null;
  const mounted = new Map();     // container element -> meal id

  async function loadRatings(){
    if(ratings || !session) return;
    loading ||= sb("/rest/v1/meal_ratings?select=meal_id,rating,comment&limit=2000")
      .then(rows => { ratings = new Map((rows || []).map(r => [r.meal_id, {rating:r.rating, comment:r.comment || ""}])); })
      .catch(() => { ratings = new Map(); })
      .finally(() => { loading = null; });
    await loading;
  }

  async function saveRating(mealId, rating, comment){
    await sb("/rest/v1/meal_ratings", {method:"POST", headers:{Prefer:"resolution=merge-duplicates,return=minimal"},
      json:{user_id: uid(), meal_id: mealId, rating, comment: comment || null, lang, updated_at: new Date().toISOString()}});
    ratings?.set(mealId, {rating, comment: comment || ""});
  }

  const thumb = up => `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" style="${up ? "" : "transform:rotate(180deg)"}"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M7 10v11H3V10h4Zm0 0 4-8a3 3 0 0 1 3 3v4h5.5a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 18.1 21H7"/></svg>`;

  function draw(el){
    const mealId = mounted.get(el);
    if(!enabled || !mealId || !session){ el.innerHTML = ""; el.hidden = true; return; }
    el.hidden = false;
    const cur = ratings?.get(mealId);
    const editing = el.dataset.editing === "1";
    if(cur && !editing){
      el.innerHTML = `<div class="fb-done"><span>${esc(cur.rating > 0 ? tx("thanks") : tx("sent"))}</span>
        <span class="fb-chip ${cur.rating > 0 ? "up" : "down"}">${thumb(cur.rating > 0)} ${esc(cur.rating > 0 ? tx("good") : tx("bad"))}</span>
        <button type="button" class="link" data-fb="change">${esc(tx("change"))}</button></div>`;
      return;
    }
    const pickedBad = el.dataset.pick === "-1";
    el.innerHTML = `<div class="fb-q">${esc(tx("q"))}</div>
      <div class="fb-btns">
        <button type="button" class="fb-btn" data-fb="1" aria-pressed="${cur?.rating > 0 && !pickedBad}">${thumb(true)} ${esc(tx("good"))}</button>
        <button type="button" class="fb-btn" data-fb="-1" aria-pressed="${pickedBad}">${thumb(false)} ${esc(tx("bad"))}</button>
      </div>
      <form class="fb-why" ${pickedBad ? "" : "hidden"}>
        <label class="lbl" for="fbWhy-${el.id}">${esc(tx("whatWrong"))}</label>
        <textarea id="fbWhy-${el.id}" rows="2" maxlength="1000" placeholder="${esc(tx("whatPh"))}">${esc(cur?.comment || "")}</textarea>
        <button class="btn" type="submit">${esc(tx("send"))}</button>
      </form>
      <div class="status" role="status" aria-live="polite"></div>`;
  }

  async function onClick(e){
    const el = e.currentTarget, b = e.target.closest("[data-fb]");
    if(!b) return;
    const mealId = mounted.get(el), v = b.dataset.fb;
    if(v === "change"){ el.dataset.editing = "1"; el.dataset.pick = ""; draw(el); return; }
    if(v === "-1"){ el.dataset.pick = "-1"; draw(el); el.querySelector("textarea")?.focus(); return; }
    if(v === "1"){
      b.disabled = true;
      try{ await saveRating(mealId, 1, ""); el.dataset.editing = ""; el.dataset.pick = ""; draw(el); }
      catch{ b.disabled = false; el.querySelector(".status").textContent = tx("err"); el.querySelector(".status").className = "status err"; }
    }
  }
  async function onSubmit(e){
    e.preventDefault();
    const el = e.currentTarget, form = e.target, btn = form.querySelector("button");
    btn.disabled = true;
    try{
      await saveRating(mounted.get(el), -1, form.querySelector("textarea").value.trim().slice(0, 1000));
      el.dataset.editing = ""; el.dataset.pick = ""; draw(el);
    }catch{ btn.disabled = false; const st = el.querySelector(".status"); st.textContent = tx("err"); st.className = "status err"; }
  }

  async function mount(el, mealId){
    if(!el) return;
    if(!mounted.has(el)){ el.addEventListener("click", onClick); el.addEventListener("submit", onSubmit); }
    mounted.set(el, mealId); el.dataset.editing = ""; el.dataset.pick = "";
    draw(el);
    if(enabled && session && !ratings){ await loadRatings(); draw(el); }
  }
  function clear(el){ if(el){ mounted.delete(el); el.innerHTML = ""; el.hidden = true; } }

  /* message to the developer, in Settings */
  function drawSettings(){
    const box = $("#fbSettings"); if(!box) return;
    box.hidden = !enabled;
    if(!enabled) { box.innerHTML = ""; return; }
    box.innerHTML = `<span class="lbl">${esc(tx("msgTitle"))}</span>
      <p class="support-text">${esc(tx("msgText"))}</p>
      <form class="gate" id="fbMsgForm">
        <textarea id="fbMsg" rows="4" maxlength="2000" placeholder="${esc(tx("msgPh"))}" required></textarea>
        <button class="btn ghost" type="submit">${esc(tx("send"))}</button>
      </form>
      <div class="status" id="fbMsgStatus" role="status" aria-live="polite"></div>`;
  }
  document.addEventListener("submit", async e => {
    if(e.target.id !== "fbMsgForm") return;
    e.preventDefault();
    const st = $("#fbMsgStatus"), btn = e.target.querySelector("button"), msg = $("#fbMsg").value.trim();
    if(!msg) return;
    if(!session){ st.className = "status err"; st.textContent = tx("needSignin"); return; }
    btn.disabled = true;
    try{
      await sb("/rest/v1/feedback_messages", {method:"POST", headers:{Prefer:"return=minimal"},
        json:{user_id: uid(), message: msg.slice(0, 2000), lang, app_version: APP_VERSION}});
      $("#fbMsg").value = ""; st.className = "status"; st.textContent = tx("msgSent");
    }catch{ st.className = "status err"; st.textContent = tx("err"); }
    finally{ btn.disabled = false; }
  });

  return {
    setEnabled(on){ enabled = !!on; drawSettings(); mounted.forEach((_, el) => draw(el)); if(on && session) loadRatings().then(() => mounted.forEach((_, el) => draw(el))); },
    mount, clear,
    reset(){ ratings = null; mounted.forEach((_, el) => draw(el)); },
    relabel(){ drawSettings(); mounted.forEach((_, el) => draw(el)); },
  };
})();
if(window.appFeatures) window.Feedback.setEnabled(!!window.appFeatures.feedback);
