// POST /api/nutrients — nutrients per 100 g for one ingredient the user adds while editing a meal.
// Text-only, fast model, does not count towards the daily photo-analysis limit.
//   CLAUDE_FAST_MODEL  optional — defaults to claude-haiku-5-5
import { authEnabled, getUser } from "./_sb.js";

const MODEL = process.env.CLAUDE_FAST_MODEL || "claude-haiku-5-5";
const RATE = { windowMs: 60_000, max: 20 };
const hits = new Map();

const PROMPTS = {
  uk: (name, ctx) => `Дай харчову цінність на 100 г для інгредієнта «${name}»${ctx ? ` у страві: ${ctx}` : ""}, у тому вигляді, в якому його зазвичай їдять у такій страві (приготований, якщо це доречно).
Поверни ТІЛЬКИ JSON: {"name":"коротка назва українською","per100":{"kcal":0,"protein":0,"fat":0,"carbs":0,"fiber":0},"benefit":"1 речення: на що найкраще впливає, конкретні нутрієнти"}
Якщо це не їжа — поверни {"error":"not_food"}.`,
  en: (name, ctx) => `Give the nutrition per 100 g for the ingredient "${name}"${ctx ? ` in this dish: ${ctx}` : ""}, in the form it is usually eaten in such a dish (cooked, if relevant).
Return ONLY JSON: {"name":"short name in English","per100":{"kcal":0,"protein":0,"fat":0,"carbs":0,"fiber":0},"benefit":"1 sentence: what it is best for, specific nutrients"}
If it is not food, return {"error":"not_food"}.`,
};

function codeOk(req) {
  const need = process.env.ACCESS_CODE;
  return !need || (req.headers["x-access-code"] || "") === need;
}
function rateLimited(req) {
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "anon";
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < RATE.windowMs);
  list.push(now); hits.set(ip, list);
  return list.length > RATE.max;
}
function extractJson(text) {
  try { return JSON.parse(text); } catch {}
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch {} }
  return null;
}
const num = (x, max) => Math.min(max, Math.max(0, Math.round((Number(x) || 0) * 10) / 10));

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ code: "generic", error: "Method not allowed" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ code: "server_config", error: "ANTHROPIC_API_KEY is not set" });
  if (!codeOk(req)) return res.status(401).json({ code: "code", error: "Access code required" });
  if (authEnabled && !(await getUser(req))) return res.status(401).json({ code: "signin", error: "Sign-in required" });
  if (rateLimited(req)) return res.status(429).json({ code: "rate", error: "Too many requests" });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const name = String(body.name || "").trim().slice(0, 80);
  const ctx = String(body.context || "").trim().slice(0, 160);
  const lang = PROMPTS[body.lang] ? body.lang : "en";
  if (!name) return res.status(400).json({ code: "generic", error: "No ingredient name" });

  let r;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 400, messages: [{ role: "user", content: PROMPTS[lang](name, ctx) }] }),
    });
  } catch { return res.status(502).json({ code: "network", error: "Could not reach Claude" }); }

  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error("Claude API error (nutrients)", r.status, JSON.stringify(data).slice(0, 300));
    return res.status(r.status === 429 ? 429 : 503).json({ code: r.status === 429 ? "rate" : "overloaded", error: "Claude error" });
  }
  const text = (data.content || []).filter(c => c.type === "text").map(c => c.text).join("\n");
  const j = extractJson(text);
  if (!j) return res.status(502).json({ code: "parse", error: "Could not parse the response" });
  if (j.error) return res.status(422).json({ code: "not_food", error: "Not food" });

  const p = j.per100 || {};
  return res.status(200).json({
    name: String(j.name || name).slice(0, 80),
    per100: { kcal: num(p.kcal, 900), protein: num(p.protein, 100), fat: num(p.fat, 100), carbs: num(p.carbs, 100), fiber: num(p.fiber, 100) },
    benefit: String(j.benefit || "").slice(0, 240),
  });
}
