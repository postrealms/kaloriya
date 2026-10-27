// DELETE /api/account — deletes the signed-in user, their photos and (by cascade) all their rows.
import { SB_URL, authEnabled, adminHeaders, getUser } from "./_sb.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "DELETE") return res.status(405).json({ code: "generic", error: "Method not allowed" });
  if (!authEnabled) return res.status(500).json({ code: "server_config", error: "Supabase is not configured" });
  const user = await getUser(req);
  if (!user) return res.status(401).json({ code: "signin", error: "Sign-in required" });

  // 1. Photos in storage (not covered by the database cascade)
  try {
    for (let round = 0; round < 50; round++) {
      const list = await fetch(`${SB_URL}/storage/v1/object/list/thumbs`, {
        method: "POST", headers: adminHeaders(),
        body: JSON.stringify({ prefix: user.id + "/", limit: 1000, offset: 0 }),
      }).then(r => r.ok ? r.json() : []);
      const paths = (list || []).filter(o => o.name).map(o => `${user.id}/${o.name}`);
      if (!paths.length) break;
      await fetch(`${SB_URL}/storage/v1/object/thumbs`, { method: "DELETE", headers: adminHeaders(), body: JSON.stringify({ prefixes: paths }) });
      if (paths.length < 1000) break;
    }
  } catch (e) { console.error("photo cleanup failed", e.message); }

  // 2. The user; profiles, meals and usage go with it (on delete cascade)
  const r = await fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, { method: "DELETE", headers: adminHeaders() });
  if (!r.ok) {
    console.error("delete user failed", r.status, (await r.text()).slice(0, 300));
    return res.status(500).json({ code: "generic", error: "Could not delete the account" });
  }
  return res.status(200).json({ ok: true });
}
