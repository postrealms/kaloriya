// Vercel serverless function: POST /api/analyze
// Environment variables (Vercel → Project → Settings → Environment Variables):
//   ANTHROPIC_API_KEY  required — key from console.anthropic.com
//   ACCESS_CODE        optional — if set, the app asks testers for this code
//   CLAUDE_MODEL       optional — defaults to claude-sonnet-5-5

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";
const MAX_IMAGE_B64 = 4_000_000;          // ~3 MB image; the client sends ~0.3–0.8 MB
const RATE = { windowMs: 60_000, max: 12 }; // per IP per instance — a light brake, not a wall
const hits = new Map();

const PROMPT = (W, hint) => `Ти — нутриціолог-аналітик. На фото страва. Загальна вага порції без тарілки: ${W} г.
${hint ? "Підказка від користувача: " + hint : ""}
Завдання:
1. Визнач страву і спосіб приготування.
2. Визнач усі видимі інгредієнти та ймовірні приховані (олія, масло, соус, цукор у заправці), оціни частку кожного у відсотках ВІД ЗАГАЛЬНОЇ ВАГИ (сума = 100).
3. Для кожного інгредієнта дай нутрієнти на 100 г У ПРИГОТОВАНОМУ вигляді (наприклад, варена гречка, а не суха), з урахуванням способу приготування.
4. Для кожного — коротко, на що він найкраще впливає в організмі (1 речення, конкретні нутрієнти).
5. 2–3 цікаві факти про страву або її інгредієнти.
Не рахуй грами і калорії порції — це зробить застосунок.
Відповідай українською. Поверни ТІЛЬКИ JSON такої форми, без тексту до чи після:
{"dish":"назва","cooking_method":"смажене|варене|запечене|тушковане|гриль|сире|на пару|змішане","cooking_note":"коротко, як готували і як це впливає на калорійність","confidence":0.0-1.0,
"ingredients":[{"name":"","percent":0,"hidden":false,"confidence":0.0-1.0,"per100":{"kcal":0,"protein":0,"fat":0,"carbs":0,"fiber":0},"benefit":""}],
"facts":[""],"caveats":"що найбільше впливає на похибку оцінки"}
Якщо на фото не їжа — поверни {"error":"коротко, що на фото"}.`;

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

  // Health / access check used by the app on start
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, codeRequired: !!process.env.ACCESS_CODE, codeOk: codeOk(req) });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Метод не підтримується" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "Сервер не налаштований: немає ANTHROPIC_API_KEY" });
  if (!codeOk(req)) return res.status(401).json({ error: "Потрібен код доступу" });
  if (rateLimited(req)) return res.status(429).json({ error: "Забагато запитів. Спробуй за хвилину." });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const W = Math.round(Number(body.weight));
  const image = typeof body.image === "string" ? body.image : "";
  const mediaType = ["image/jpeg", "image/png", "image/webp"].includes(body.mediaType) ? body.mediaType : "image/jpeg";
  const hint = String(body.hint || "").slice(0, 300);

  if (!(W > 0 && W <= 5000)) return res.status(400).json({ error: "Вкажи вагу від 1 до 5000 г" });
  if (!image) return res.status(400).json({ error: "Немає фото" });
  if (image.length > MAX_IMAGE_B64) return res.status(413).json({ error: "Фото завелике" });

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
            { type: "text", text: PROMPT(W, hint) },
          ],
        }],
      }),
    });
  } catch {
    return res.status(502).json({ error: "Не вдалося зв'язатися з Claude. Спробуй ще раз." });
  }

  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error("Claude API error", r.status, JSON.stringify(data).slice(0, 500));
    if (r.status === 429) return res.status(429).json({ error: "Ліміт запитів до Claude. Спробуй за хвилину." });
    if (r.status === 529 || r.status >= 500) return res.status(503).json({ error: "Claude перевантажений. Спробуй ще раз." });
    if (r.status === 401) return res.status(500).json({ error: "Невірний ключ API на сервері" });
    if (r.status === 400 && /credit|balance/i.test(data?.error?.message || "")) return res.status(402).json({ error: "На рахунку Claude API закінчились кошти" });
    return res.status(502).json({ error: "Claude не зміг обробити фото. Спробуй інше." });
  }

  const text = (data.content || []).filter(c => c.type === "text").map(c => c.text).join("\n");
  const json = extractJson(text);
  if (!json) return res.status(502).json({ error: "Відповідь не вдалося розібрати. Спробуй ще раз." });

  return res.status(200).json(json);
}
