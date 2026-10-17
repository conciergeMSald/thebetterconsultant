// Shared Airtable helper for Strategy Compass. Only server functions import this.
// Secrets (Cloudflare Pages): AIRTABLE_TOKEN, AIRTABLE_BASE_ID. Never sent to the browser.
export const TABLES = {
  consultants: "tblo3fotB8si2LP03",
  clients: "tblU2IWUtNGulGu0V",
  plans: "tblnVeHMqUfinzHo8",
  entries: "tbltvteQawWFfmPD9",
  votes: "tblr113bKaioHa69q",
  ratings: "tblV1cDl4ue3y08Gz",
  bets: "tblQji4WSUAU3ss6i",
  moves: "tblEHbVSTVjj6OtXP",
  activity: "tblTI7m9YnViYjViE",
};

const API = "https://api.airtable.com";

export function configured(env) {
  return Boolean(env.AIRTABLE_TOKEN && /^app[A-Za-z0-9]{14}$/.test(env.AIRTABLE_BASE_ID || ""));
}

async function call(env, method, path, body, tries = 2) {
  const r = await fetch(API + path, {
    method,
    headers: { authorization: "Bearer " + env.AIRTABLE_TOKEN, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (r.status === 429 && tries > 1) {
    await new Promise((res) => setTimeout(res, 1200)); // Airtable asks for a pause after a rate limit
    return call(env, method, path, body, tries - 1);
  }
  let data = null;
  try { data = await r.json(); } catch { /* empty body */ }
  if (!r.ok) {
    const e = new Error("Airtable " + r.status);
    e.status = r.status;
    e.type = data && data.error && (data.error.type || data.error);
    throw e;
  }
  return data;
}

export function airtable(env) {
  const base = "/v0/" + env.AIRTABLE_BASE_ID;
  return {
    create: (table, fields) => call(env, "POST", `${base}/${table}`, { fields, typecast: false }),
    get: (table, id) => call(env, "GET", `${base}/${table}/${id}`),
    update: (table, id, fields) => call(env, "PATCH", `${base}/${table}/${id}`, { fields, typecast: false }),
    remove: (table, id) => call(env, "DELETE", `${base}/${table}/${id}`),
    list: (table, params = {}) => {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) q.set(k, v);
      const s = q.toString();
      return call(env, "GET", `${base}/${table}${s ? "?" + s : ""}`);
    },
    bases: () => call(env, "GET", "/v0/meta/bases"),
  };
}
