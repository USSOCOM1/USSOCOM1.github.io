// USSOCOM members Worker.
//   GET  /login?return=<site url>   -> Discord sign-in (scope: identify)
//   GET  /callback                  -> back from Discord; issues a session, returns to the site
//   GET  /api/members               -> members document, rostered members only (Bearer session)
//   PUT  /api/ingest                -> SEC WAR uploads the members document (Bearer INGEST_SECRET)
//   GET  /health
// Secrets (wrangler secret put): DISCORD_CLIENT_SECRET, SESSION_SECRET, INGEST_SECRET
// Vars (wrangler.toml): DISCORD_CLIENT_ID, ALLOWED_ORIGINS (comma separated site origins)
// KV binding: MEMBERS

const SESSION_DAYS = 7;
const STATE_MINUTES = 10;
const MAX_INGEST_BYTES = 2_000_000;

const enc = new TextEncoder();
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const encodeJson = (o) => b64url(enc.encode(JSON.stringify(o)));
const decodeJson = (s) => JSON.parse(new TextDecoder().decode(fromB64url(s)));

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
}

function safeEqual(a, b) {
  const x = enc.encode(String(a));
  const y = enc.encode(String(b));
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function sign(secret, payload) {
  const body = encodeJson(payload);
  return `${body}.${await hmac(secret, body)}`;
}

async function verify(secret, token) {
  const [body, mac] = String(token || '').split('.');
  if (!body || !mac || !safeEqual(mac, await hmac(secret, body))) return null;
  try {
    const payload = decodeJson(body);
    return payload.exp && payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

const origins = (env) => String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);

function cors(env, request) {
  const origin = request.headers.get('origin');
  if (!origin || !origins(env).includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-max-age': '600',
    vary: 'origin',
  };
}

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
});

/** A return URL is only accepted on one of the site's own origins. */
function allowedReturn(env, value) {
  try {
    const u = new URL(value);
    return origins(env).includes(u.origin) ? `${u.origin}${u.pathname}` : null;
  } catch {
    return null;
  }
}

function backToSite(returnUrl, params) {
  const q = new URLSearchParams(params).toString();
  return Response.redirect(`${returnUrl}#/members?${q}`, 302);
}

async function login(request, env) {
  const url = new URL(request.url);
  const back = allowedReturn(env, url.searchParams.get('return'));
  if (!back) return json({ error: 'return URL not allowed' }, 400);
  const state = await sign(env.SESSION_SECRET, { r: back, n: crypto.randomUUID(), exp: Date.now() + STATE_MINUTES * 60_000 });
  const auth = new URL('https://discord.com/oauth2/authorize');
  auth.search = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    response_type: 'code',
    redirect_uri: `${url.origin}/callback`,
    scope: 'identify',
    state,
    prompt: 'none',
  }).toString();
  return Response.redirect(auth.toString(), 302);
}

async function callback(request, env) {
  const url = new URL(request.url);
  const state = await verify(env.SESSION_SECRET, url.searchParams.get('state'));
  if (!state) return json({ error: 'sign-in expired, start again from the website' }, 400);
  const back = allowedReturn(env, state.r);
  if (!back) return json({ error: 'return URL not allowed' }, 400);
  const code = url.searchParams.get('code');
  if (!code) return backToSite(back, { error: 'cancelled' });

  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${url.origin}/callback`,
    }),
  });
  if (!tokenRes.ok) return backToSite(back, { error: 'discord' });
  const { access_token: access } = await tokenRes.json();
  const meRes = await fetch('https://discord.com/api/users/@me', { headers: { authorization: `Bearer ${access}` } });
  if (!meRes.ok) return backToSite(back, { error: 'discord' });
  const me = await meRes.json();
  const session = await sign(env.SESSION_SECRET, {
    id: String(me.id), name: me.global_name || me.username || 'Member', exp: Date.now() + SESSION_DAYS * 86_400_000,
  });
  return backToSite(back, { session });
}

async function devLogin(request, env) {
  // Local testing only: enabled solely by DEV_LOGIN=1 in .dev.vars.
  if (env.DEV_LOGIN !== '1') return json({ error: 'not found' }, 404);
  const url = new URL(request.url);
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) return json({ error: 'not found' }, 404);
  const back = allowedReturn(env, url.searchParams.get('return'));
  if (!back) return json({ error: 'return URL not allowed' }, 400);
  const session = await sign(env.SESSION_SECRET, { id: url.searchParams.get('id') || '0', name: 'Dev', exp: Date.now() + 3_600_000 });
  return backToSite(back, { session });
}

async function members(request, env) {
  const headers = cors(env, request);
  const auth = request.headers.get('authorization') || '';
  const session = await verify(env.SESSION_SECRET, auth.replace(/^Bearer\s+/i, ''));
  if (!session) return json({ error: 'sign in' }, 401, headers);
  const doc = await env.MEMBERS.get('members', 'json');
  if (!doc) return json({ error: 'no data yet' }, 503, headers);
  if (!Array.isArray(doc.allow) || !doc.allow.includes(session.id)) return json({ error: 'not on the roster' }, 403, headers);
  const me = (doc.roster || []).find((p) => p.id === session.id);
  const { allow, ...data } = doc;
  return json({ viewer: { id: session.id, name: me?.name || session.name }, data }, 200, headers);
}

async function ingest(request, env) {
  const auth = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!env.INGEST_SECRET || !safeEqual(auth, env.INGEST_SECRET)) return json({ error: 'forbidden' }, 403);
  const text = await request.text();
  if (text.length > MAX_INGEST_BYTES) return json({ error: 'too large' }, 413);
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    return json({ error: 'not JSON' }, 400);
  }
  if (!doc || doc.version !== 1 || !Array.isArray(doc.allow) || !Array.isArray(doc.roster)) return json({ error: 'not a members document' }, 400);
  await env.MEMBERS.put('members', JSON.stringify(doc));
  return json({ ok: true, rostered: doc.allow.length });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env, request) });
    try {
      if (request.method === 'GET' && pathname === '/login') return await login(request, env);
      if (request.method === 'GET' && pathname === '/callback') return await callback(request, env);
      if (request.method === 'GET' && pathname === '/dev-login') return await devLogin(request, env);
      if (request.method === 'GET' && pathname === '/api/members') return await members(request, env);
      if (request.method === 'PUT' && pathname === '/api/ingest') return await ingest(request, env);
      if (request.method === 'GET' && pathname === '/health') return json({ ok: true });
      return json({ error: 'not found' }, 404);
    } catch (err) {
      return json({ error: 'server error' }, 500, cors(env, request));
    }
  },
};
