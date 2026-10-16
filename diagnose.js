// Cloudflare Pages Function: POST /api/diagnose  (consultant console)
// Separate admin codes (ADMIN_CODES), so client codes can never open the console.
// Uses the same WORKER_KEY; the diagnose worker address is derived from WORKER_URL (…/issue -> …/diagnose).
const json = (b, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function onRequestPost({ request, env }) {
  const code = (request.headers.get("x-access-code") || "").trim();
  const codes = (env.ADMIN_CODES || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!codes.length || !env.WORKER_KEY || !env.WORKER_URL) return json({ error: "Service is not configured." }, 503);
  if (!code || !codes.includes(code)) return json({ error: "Access code not recognised." }, 401);

  const raw = await request.text();
  if (raw.length > 12000) return json({ error: "Input is too long." }, 413);
  let b;
  try { b = JSON.parse(raw); } catch { return json({ error: "Bad request." }, 400); }
  if (!b || typeof b.situation !== "string" || !b.situation.trim()) return json({ error: "Describe the situation first." }, 400);

  if (env.RUNS) {
    const day = new Date().toISOString().slice(0, 10);
    const key = `admin:${code}:${day}`;
    const n = parseInt((await env.RUNS.get(key)) || "0", 10);
    const max = parseInt(env.ADMIN_DAILY_LIMIT || "100", 10);
    if (n >= max) return json({ error: "Daily limit reached." }, 429);
    await env.RUNS.put(key, String(n + 1), { expirationTtl: 172800 });
  }

  const intake = {};
  if (b.intake && typeof b.intake === "object") {
    for (const k of ["industry", "company_size", "growth_stage", "leadership_team"]) {
      if (typeof b.intake[k] === "string" && b.intake[k].trim()) intake[k] = b.intake[k].trim().slice(0, 300);
    }
  }
  const url = env.WORKER_URL.replace(/\/issue\/?$/, "/diagnose");
  let r;
  try {
    r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": env.WORKER_KEY },
      body: JSON.stringify({ situation: b.situation.trim().slice(0, 4000), intake }),
    });
  } catch {
    return json({ error: "The analysis service did not answer. Try again." }, 502);
  }
  let out;
  try { out = await r.json(); } catch { return json({ error: "Unexpected reply from the analysis service." }, 502); }
  if (!r.ok) return json({ error: "The analysis could not be completed. Try again." }, 502);
  return json({ analysis: out.analysis });
}
