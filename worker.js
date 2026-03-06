const GIST_ID   = ‘34b07d80bdef2668f86076a3e85aa13b’;
const GIST_FILE = ‘links.json’;

const CORS = {
‘Access-Control-Allow-Origin’: ‘*’,
‘Access-Control-Allow-Methods’: ‘GET, POST, DELETE, OPTIONS’,
‘Access-Control-Allow-Headers’: ‘Content-Type, X-Pin-Hash’,
};

export default {
async fetch(request, env) {
if (request.method === ‘OPTIONS’) return new Response(null, { status: 204, headers: CORS });

```
const url = new URL(request.url);

// ── POST /auth — verify PIN hash ──
if (url.pathname === '/auth' && request.method === 'POST') {
  const { hash } = await request.json();
  if (!hash) return json({ ok: false, error: 'No hash' }, 400);
  return json({ ok: hash === env.PIN_HASH });
}

// All routes below require valid PIN hash header
const pinHash = request.headers.get('X-Pin-Hash');
if (!pinHash || pinHash !== env.PIN_HASH) return json({ ok: false, error: 'Unauthorized' }, 401);

// ── GET /links ──
if (url.pathname === '/links' && request.method === 'GET') {
  const r = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    headers: {
      Authorization: `token ${env.GH_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'intelqong-admin',
    },
  });
  if (!r.ok) return json({ ok: false, error: 'Gist fetch failed' }, 502);
  const data = await r.json();
  const content = data.files[GIST_FILE]?.content || '[]';
  return json({ ok: true, links: JSON.parse(content) });
}

// ── POST /links ──
if (url.pathname === '/links' && request.method === 'POST') {
  const { links } = await request.json();
  if (!Array.isArray(links)) return json({ ok: false, error: 'Invalid payload' }, 400);
  const r = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: 'PATCH',
    headers: {
      Authorization: `token ${env.GH_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'intelqong-admin',
    },
    body: JSON.stringify({ files: { [GIST_FILE]: { content: JSON.stringify(links, null, 2) } } }),
  });
  if (!r.ok) return json({ ok: false, error: 'Gist save failed' }, 502);
  return json({ ok: true });
}

// ── POST /reset-pin ──
if (url.pathname === '/reset-pin' && request.method === 'POST') {
  const { newHash } = await request.json();
  if (!newHash) return json({ ok: false, error: 'No hash provided' }, 400);
  // Note: PIN_HASH is an env secret — update it via Cloudflare dashboard or wrangler secret put
  return json({ ok: false, error: 'PIN reset must be done via Cloudflare dashboard' }, 501);
}

return json({ ok: false, error: 'Not found' }, 404);
```

},
};

function json(data, status = 200) {
return new Response(JSON.stringify(data), {
status,
headers: { …CORS, ‘Content-Type’: ‘application/json’ },
});
}
