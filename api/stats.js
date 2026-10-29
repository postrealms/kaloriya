// GET /api/stats — testing dashboard data, only for emails listed in ADMIN_EMAILS (comma-separated).
import { SB_URL, authEnabled, adminHeaders, getUser, kyivDay } from "./_sb.js";

const ADMINS = (process.env.ADMIN_EMAILS || "").toLowerCase().split(",").map(s => s.trim()).filter(Boolean);

async function rest(path) {
  const r = await fetch(SB_URL + path, { headers: adminHeaders() });
  if (!r.ok) return null;                       // e.g. feedback tables not created yet
  return r.json();
}
const addDays = (day, n) => { const d = new Date(day + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!authEnabled) return res.status(500).json({ error: "Supabase is not configured" });
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: "Sign-in required" });
  if (!ADMINS.includes((user.email || "").toLowerCase())) return res.status(403).json({ error: "Not an admin. Add your email to ADMIN_EMAILS in Vercel." });

  const [usersRes, usage, meals, ratings, messages] = await Promise.all([
    fetch(`${SB_URL}/auth/v1/admin/users?page=1&per_page=1000`, { headers: adminHeaders() }).then(r => r.ok ? r.json() : { users: [] }),
    rest("/rest/v1/usage?select=user_id,day,count&limit=100000"),
    rest("/rest/v1/meals?select=id,user_id,dish,created_at,edited:analysis->>edited&limit=100000"),
    rest("/rest/v1/meal_ratings?select=user_id,meal_id,rating,comment,updated_at&limit=100000"),
    rest("/rest/v1/feedback_messages?select=user_id,message,lang,app_version,created_at&order=created_at.desc&limit=300"),
  ]);
  const users = (usersRes.users || usersRes || []).map(u => ({ id: u.id, email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at }));
  const emailOf = Object.fromEntries(users.map(u => [u.id, u.email]));
  const U = usage || [], M = meals || [];
  const today = kyivDay();

  // daily series, last 30 days
  const days = [];
  for (let i = 29; i >= 0; i--) days.push(addDays(today, -i));
  const byDay = Object.fromEntries(days.map(d => [d, { day: d, active: 0, analyses: 0 }]));
  for (const u of U) if (byDay[u.day] && u.count > 0) { byDay[u.day].active++; byDay[u.day].analyses += u.count; }

  // per-user activity
  const per = {};
  for (const u of U) {
    if (!(u.count > 0)) continue;
    const p = per[u.user_id] ||= { days: new Set(), analyses: 0 };
    p.days.add(u.day); p.analyses += u.count;
  }
  const activeIn = (from, to) => Object.values(per).filter(p => [...p.days].some(d => d >= from && d <= to)).length;

  // retention: day 1, days 7–13, days 14–20 after the first active day
  const ret = { d1: [0, 0], d7: [0, 0], d14: [0, 0] };
  for (const p of Object.values(per)) {
    const first = [...p.days].sort()[0];
    const check = (key, a, b) => { if (addDays(first, a) <= today) { ret[key][1]++; if ([...p.days].some(d => d >= addDays(first, a) && d <= addDays(first, b))) ret[key][0]++; } };
    check("d1", 1, 1); check("d7", 7, 13); check("d14", 14, 20);
  }

  const R = ratings || [];
  const up = R.filter(r => r.rating > 0).length, down = R.filter(r => r.rating < 0).length;
  const dishOf = Object.fromEntries(M.map(m => [m.id, m.dish]));
  const userDays = Object.values(per).reduce((a, p) => a + p.days.size, 0);
  const analysesTotal = U.reduce((a, u) => a + (u.count || 0), 0);

  const testers = users.map(u => {
    const p = per[u.id];
    const mine = R.filter(r => r.user_id === u.id);
    return { email: u.email, joined: u.created_at, lastActive: p ? [...p.days].sort().pop() : null,
      activeDays: p ? p.days.size : 0, analyses: p ? p.analyses : 0,
      up: mine.filter(r => r.rating > 0).length, down: mine.filter(r => r.rating < 0).length };
  }).sort((a, b) => (b.lastActive || "").localeCompare(a.lastActive || "") || b.analyses - a.analyses);

  res.status(200).json({
    generatedAt: new Date().toISOString(), today,
    totals: {
      testers: users.length,
      activeToday: activeIn(today, today),
      active7: activeIn(addDays(today, -6), today),
      analysesTotal, analysesToday: byDay[today]?.analyses || 0,
      perActiveDay: userDays ? Math.round(analysesTotal / userDays * 10) / 10 : 0,
      meals: M.length, edited: M.filter(m => m.edited === "true").length,
    },
    daily: days.map(d => byDay[d]),
    retention: ret,
    ratings: ratings ? { up, down, negative: R.filter(r => r.rating < 0).sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || "")).slice(0, 100)
      .map(r => ({ email: emailOf[r.user_id] || "", dish: dishOf[r.meal_id] || "", comment: r.comment || "", at: r.updated_at })) } : null,
    messages: messages ? messages.map(m => ({ email: emailOf[m.user_id] || "", message: m.message, lang: m.lang, version: m.app_version, at: m.created_at })) : null,
    testersList: testers,
  });
}
