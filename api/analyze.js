// Vercel serverless function: POST /api/analyze
// Environment variables (Vercel → Project → Settings → Environment Variables):
//   ANTHROPIC_API_KEY  required — key from console.anthropic.com
//   ACCESS_CODE        optional — if set, the app asks testers for this code
//   CLAUDE_MODEL       optional — defaults to claude-sonnet-5-5
//   SUPABASE_URL, SUPABASE_SECRET_KEY  — when both are set, analysis needs a signed-in user
//   DAILY_LIMIT        optional — analyses per user per day, defaults to 15

import { authEnabled, DAILY_LIMIT, getUser, rpc, usedToday } from "./_sb.js";

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";
const MAX_IMAGE_B64 = 4_000_000;          // ~3 MB image; the client sends ~0.3–0.8 MB
const RATE = { windowMs: 60_000, max: 12 }; // per IP per instance — a light brake, not a wall
const hits = new Map();

const PROMPTS = {
  uk: (W, hint) => `Ти — нутриціолог-аналітик. На фото страва. Загальна вага порції без тарілки: ${W} г.
${hint ? "Підказка від користувача: " + hint : ""}
Завдання:
1. Визнач страву і спосіб приготування.
2. Визнач усі видимі інгредієнти та ймовірні приховані (олія, масло, соус, цукор у заправці), оціни частку кожного у відсотках ВІД ЗАГАЛЬНОЇ ВАГИ (сума = 100).
3. Для кожного інгредієнта дай нутрієнти на 100 г У ПРИГОТОВАНОМУ вигляді (наприклад, варена гречка, а не суха), з урахуванням способу приготування.
4. Для кожного — коротко, на що він найкраще впливає в організмі (1 речення, конкретні нутрієнти).
5. 2–3 цікаві факти про страву або її інгредієнти.
Не рахуй грами і калорії порції — це зробить застосунок.
Усі текстові значення пиши українською. Поверни ТІЛЬКИ JSON такої форми, без тексту до чи після:
{"dish":"назва","cooking_method":"смажене|варене|запечене|тушковане|гриль|сире|на пару|змішане","cooking_note":"коротко, як готували і як це впливає на калорійність","confidence":0.0-1.0,
"ingredients":[{"name":"","percent":0,"hidden":false,"confidence":0.0-1.0,"per100":{"kcal":0,"protein":0,"fat":0,"carbs":0,"fiber":0},"benefit":""}],
"facts":[""],"caveats":"що найбільше впливає на похибку оцінки"}
Якщо на фото не їжа — поверни {"error":"коротко, що на фото"}.`,

  en: (W, hint) => `You are a nutrition analyst. The photo shows a meal. Total portion weight without the plate: ${W} g.
${hint ? "Hint from the user: " + hint : ""}
Tasks:
1. Identify the dish and how it was cooked.
2. Identify every visible ingredient and the likely hidden ones (oil, butter, sauce, sugar in dressing); estimate each one's share as a percentage OF THE TOTAL WEIGHT (sum = 100).
3. For each ingredient give nutrients per 100 g AS COOKED (e.g. boiled buckwheat, not dry), taking the cooking method into account.
4. For each, say briefly what it is best for in the body (1 sentence, specific nutrients).
5. 2–3 interesting facts about the dish or its ingredients.
Do not compute grams or calories for the portion — the app does that.
Write every text value in English. Return ONLY JSON of this shape, with no text before or after:
{"dish":"name","cooking_method":"fried|boiled|baked|stewed|grilled|raw|steamed|mixed","cooking_note":"briefly, how it was cooked and how that affects calories","confidence":0.0-1.0,
"ingredients":[{"name":"","percent":0,"hidden":false,"confidence":0.0-1.0,"per100":{"kcal":0,"protein":0,"fat":0,"carbs":0,"fiber":0},"benefit":""}],
"facts":[""],"caveats":"what affects the accuracy of this estimate most"}
If the photo shows no food, return {"error":"briefly, what the photo shows"}.`,
};

function codeOk(req) {
  const need = process.env.ACCESS_CODE;
  return !need || (req.headers["x-access-code"] || "") === need;
}

function rateLimited(req) {
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "anon";
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < RATE.windowMs);
  list.push(now);
  hits.set(ip, list);
  return list.length > RATE.max;
}

function extractJson(text) {
  try { return JSON.parse(text); } catch {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch {} }
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch {} }
  return null;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  // Health / access check used by the app on start; with a token it also reports today's usage
  if (req.method === "GET") {
    const out = { ok: true, codeRequired: !!process.env.ACCESS_CODE, codeOk: codeOk(req), authRequired: authEnabled };
    if (authEnabled) {
      const user = await getUser(req);
      out.signedIn = !!user;
      if (user) out.usage = { used: await usedToday(user.id).catch(() => 0), limit: DAILY_LIMIT };
    }
    return res.status(200).json(out);
  }
  if (req.method !== "POST") return res.status(405).json({ code: "generic", error: "Method not allowed" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ code: "server_config", error: "ANTHROPIC_API_KEY is not set" });
  if (!codeOk(req)) return res.status(401).json({ code: "code", error: "Access code required" });

  let user = null;
  if (authEnabled) {
    user = await getUser(req);
    if (!user) return res.status(401).json({ code: "signin", error: "Sign-in required" });
  }
  if (rateLimited(req)) return res.status(429).json({ code: "rate", error: "Too many requests" });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const W = Math.round(Number(body.weight));
  const image = typeof body.image === "string" ? body.image : "";
  const mediaType = ["image/jpeg", "image/png", "image/webp"].includes(body.mediaType) ? body.mediaType : "image/jpeg";
  const hint = String(body.hint || "").slice(0, 300);
  const lang = PROMPTS[body.lang] ? body.lang : "en";

  if (!(W > 0 && W <= 5000)) return res.status(400).json({ code: "weight", error: "Weight must be 1–5000 g" });
  if (!image) return res.status(400).json({ code: "no_image", error: "No image" });
  if (image.length > MAX_IMAGE_B64) return res.status(413).json({ code: "too_big", error: "Image too large" });

  // Daily limit: take one analysis now, give it back if Claude fails
  let used = null;
  if (user) {
    try { used = await rpc("use_analysis", { p_user: user.id, p_limit: DAILY_LIMIT }); }
    catch (e) {
      console.error("usage rpc failed", e.message);
      return res.status(500).json({ code: "server_config", error: "Usage tracking failed — has supabase/schema.sql been run?" });
    }
    if (used === null) return res.status(429).json({ code: "daily_limit", error: "Daily limit reached", usage: { used: DAILY_LIMIT, limit: DAILY_LIMIT } });
  }
  const fail = async (status, payload) => {
    if (user) await rpc("refund_analysis", { p_user: user.id }).catch(() => {});
    return res.status(status).json(payload);
  };

  let r;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 3000,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
            { type: "text", text: PROMPTS[lang](W, hint) },
          ],
        }],
      }),
    });
  } catch {
    return fail(502, { code: "network", error: "Could not reach Claude" });
  }

  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error("Claude API error", r.status, JSON.stringify(data).slice(0, 500));
    if (r.status === 429) return fail(429, { code: "rate", error: "Claude rate limit" });
    if (r.status === 529 || r.status >= 500) return fail(503, { code: "overloaded", error: "Claude overloaded" });
    if (r.status === 401) return fail(500, { code: "server_config", error: "Invalid API key" });
    if (r.status === 400 && /credit|balance/i.test(data?.error?.message || "")) return fail(402, { code: "no_credit", error: "Out of API credit" });
    return fail(502, { code: "bad_image", error: "Claude could not process the image" });
  }

  const text = (data.content || []).filter(c => c.type === "text").map(c => c.text).join("\n");
  const json = extractJson(text);
  if (!json) return fail(502, { code: "parse", error: "Could not parse the response" });
  if (json.error) { if (user) await rpc("refund_analysis", { p_user: user.id }).catch(() => {}); used = used && used - 1; }

  if (user) json._usage = { used, limit: DAILY_LIMIT };
  return res.status(200).json(json);
}
