// Cloudflare Pages Function: POST /api/run
// Checks an access code, applies an optional daily limit, then calls the worker with a key the browser never sees.
// Settings (Pages > Settings > Variables and secrets):
//   ACCESS_CODES  comma-separated codes, e.g. "acme-2026,beta-guest"   (secret)
//   WORKER_KEY    the worker's x-api-key value                         (secret)
//   WORKER_URL    https://xtkhzicrloqwgxdsfwvc.supabase.co/functions/v1/issue
//   DAILY_LIMIT   optional, runs per code per day (default 20; needs the RUNS KV binding)
//   RUNS          optional KV namespace binding used for the daily limit
const json = (b, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function onRequestPost({ request, env }) {
  const code = (request.headers.get("x-access-code") || "").trim();
  const codes = (env.ACCESS_CODES || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!code || !codes.includes(code)) return json({ error: "Access code not recognised." }, 401);
  if (!env.WORKER_KEY || !env.WORKER_URL) return json({ error: "Service is not configured." }, 503);

  const raw = await request.text();
  if (raw.length > 20000) return json({ error: "Input is too long." }, 413);
  let b;
  try { b = JSON.parse(raw); } catch { return json({ error: "Bad request." }, 400); }
  if (!b || typeof b.how !== "string" || !b.how.trim()) return json({ error: "Add the issue statement first." }, 400);

  if (env.RUNS) {
    const day = new Date().toISOString().slice(0, 10);
    const key = `${code}:${day}`;
    const n = parseInt((await env.RUNS.get(key)) || "0", 10);
    const max = parseInt(env.DAILY_LIMIT || "20", 10);
    if (n >= max) return json({ error: "Daily run limit reached. Please try again tomorrow." }, 429);
    await env.RUNS.put(key, String(n + 1), { expirationTtl: 172800 });
  }

  // forward only the fields the worker understands
  const pick = ["how", "important", "done", "want", "focus", "stage", "company", "industry", "role", "scores", "seats", "ownership"];
  const body = {};
  for (const k of pick) if (b[k] !== undefined) body[k] = b[k];

  let r;
  try {
    r = await fetch(env.WORKER_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": env.WORKER_KEY },
      body: JSON.stringify(body),
    });
  } catch {
    return json({ error: "The analysis service did not answer. Try again." }, 502);
  }
  let out;
  try { out = await r.json(); } catch { return json({ error: "Unexpected reply from the analysis service." }, 502); }
  if (!r.ok) return json({ error: "The analysis could not be completed. Try again." }, 502);
  // return the analysis only; library source listings stay private
  return json({ analysis: out.analysis });
}
