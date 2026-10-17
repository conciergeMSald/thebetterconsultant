// POST /api/compass/health  (admin only)
// Phase 1 check: can the server write, read and delete a record in the Compass base,
// and is the token limited to this one base? Returns step results only, never secrets.
import { airtable, configured, TABLES } from "../../_lib/airtable.js";

const json = (b, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function onRequestPost({ request, env }) {
  const code = (request.headers.get("x-access-code") || "").trim();
  const codes = (env.ADMIN_CODES || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!codes.length) return json({ error: "Service is not configured." }, 503);
  if (!code || !codes.includes(code)) return json({ error: "Access code not recognised." }, 401);
  if (!configured(env)) {
    return json({ ok: false, steps: [{ name: "Settings present", ok: false, detail: "Add AIRTABLE_TOKEN and AIRTABLE_BASE_ID in Cloudflare, then retry the deployment." }] });
  }

  const at = airtable(env);
  const steps = [{ name: "Settings present", ok: true, detail: "Token and base ID found." }];
  const step = (name, ok, detail) => steps.push({ name, ok, detail });
  let id = null;

  try {
    const stamp = new Date().toISOString();
    const rec = await at.create(TABLES.activity, { Event: "Health check", "Actor type": "System", Detail: stamp });
    id = rec.id;
    step("Write a test record", true, "Created in the Activity table.");
    const back = await at.get(TABLES.activity, id);
    step("Read it back", back.fields && back.fields.Detail === stamp, back.fields && back.fields.Detail === stamp ? "Values match." : "Values differ.");
  } catch (e) {
    step("Write and read", false, explain(e));
  }
  if (id) {
    try { await at.remove(TABLES.activity, id); step("Delete the test record", true, "Cleaned up."); }
    catch (e) { step("Delete the test record", false, explain(e) + " Delete the 'Health check' row in Activity by hand."); }
  }

  try {
    const b = await at.bases();
    const list = (b && b.bases) || [];
    const only = list.length === 1 && list[0].id === env.AIRTABLE_BASE_ID;
    step("Token limited to this base", only, only ? "The token reaches one base only." : `The token reaches ${list.length} bases. Create a new token limited to the Strategy Compass base.`);
  } catch (e) {
    step("Token limited to this base", false, e.status === 403 || e.status === 401
      ? "Could not check. Add the schema.bases:read permission to the token."
      : explain(e));
  }

  return json({ ok: steps.every((s) => s.ok), steps });
}

function explain(e) {
  if (e.status === 401) return "Airtable rejected the token (401). Check AIRTABLE_TOKEN.";
  if (e.status === 403) return "The token lacks permission (403). It needs read and write on records for this base.";
  if (e.status === 404) return "Base or table not found (404). Check AIRTABLE_BASE_ID.";
  if (e.status === 429) return "Airtable rate limit (429). Try again in a moment.";
  return "Airtable error" + (e.status ? " " + e.status : "") + ".";
}
