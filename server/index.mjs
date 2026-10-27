import http from 'node:http';
import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const port = Number(process.env.PORT || 8080);
const jwtSecret = process.env.SCIF_JWT_SECRET;
const databaseUrl = process.env.DATABASE_URL;
const appOrigins = (process.env.APP_ORIGINS || 'http://localhost:5173,capacitor://localhost,http://localhost').split(',').map((x) => x.trim()).filter(Boolean);
const isProduction = process.env.NODE_ENV === 'production';
if (!jwtSecret || Buffer.byteLength(jwtSecret) < 32) throw new Error('SCIF_JWT_SECRET must contain at least 32 bytes.');
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const pool = new Pool({ connectionString: databaseUrl, max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });
const server = http.createServer();
const requestCounts = new Map();
const MAX_BODY = 64 * 1024;
const USERNAME = /^[a-z0-9_]{3,24}$/;

function json(res, status, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': data.length,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
    'strict-transport-security': isProduction ? 'max-age=31536000; includeSubDomains' : 'max-age=0'
  });
  res.end(data);
}

function requestLimit(req, res) {
  const key = `${req.socket.remoteAddress || 'unknown'}:${req.url?.split('?')[0]}`;
  const now = Date.now();
  const slot = requestCounts.get(key);
  if (!slot || slot.until < now) requestCounts.set(key, { count: 1, until: now + 60000 });
  else slot.count += 1;
  if (requestCounts.get(key).count > 60) {
    json(res, 429, { error: 'Too many requests. Try again shortly.' });
    return false;
  }
  if (requestCounts.size > 5000) for (const [id, value] of requestCounts) if (value.until < now) requestCounts.delete(id);
  return true;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Request body too large.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(Object.assign(new Error('Malformed JSON.'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function validB64(value, min, max) {
  return typeof value === 'string' && value.length <= max && /^[A-Za-z0-9_-]+$/.test(value) && Buffer.from(value, 'base64url').length >= min;
}

function validateWrapped(value) {
  return value && validB64(value.salt, 16, 64) && validB64(value.iv, 12, 32) && validB64(value.ciphertext, 48, 512);
}

function issueToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: user.id, username: user.username, iat: now, exp: now + 86400 })).toString('base64url');
  const input = `${header}.${payload}`;
  const signature = crypto.createHmac('sha256', jwtSecret).update(input).digest('base64url');
  return `${input}.${signature}`;
}

async function authenticate(req) {
  const token = /^Bearer ([A-Za-z0-9_.-]+)$/.exec(req.headers.authorization || '')?.[1];
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const input = `${parts[0]}.${parts[1]}`;
  const expected = crypto.createHmac('sha256', jwtSecret).update(input).digest();
  let claims;
  let supplied;
  try {
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    supplied = Buffer.from(parts[2], 'base64url');
  } catch { return null; }
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected) || !claims.sub || claims.exp < Date.now() / 1000) return null;
  const result = await pool.query('SELECT id, username, public_key FROM users WHERE id = $1', [claims.sub]);
  return result.rows[0] || null;
}

function username(value) {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

async function route(req, res) {
  const origin = req.headers.origin;
  if (origin && appOrigins.includes(origin)) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('vary', 'Origin');
    res.setHeader('access-control-allow-headers', 'authorization,content-type');
    res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  } else if (origin) return json(res, 403, { error: 'Origin not allowed.' });
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (!requestLimit(req, res)) return;
  const url = new URL(req.url || '/', 'http://localhost');
  const path = url.pathname;
  if (req.method === 'GET' && path === '/healthz') return json(res, 200, { ok: true });

  if (req.method === 'POST' && path === '/api/v1/register') {
    const body = await readBody(req);
    const name = username(body.username);
    if (!USERNAME.test(name) || typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 1024 || !validB64(body.publicKey, 65, 1024) || !validateWrapped(body.wrappedPrivateKey)) {
      return json(res, 400, { error: 'Use a 3–24 character username, a 12+ character passphrase, and a valid encrypted key bundle.' });
    }
    const salt = crypto.randomBytes(16);
    const passwordHash = await new Promise((resolve, reject) => crypto.scrypt(body.password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (err, key) => err ? reject(err) : resolve(key)));
    let result;
    try {
      result = await pool.query('INSERT INTO users (username, password_salt, password_hash, public_key, wrapped_private_key) VALUES ($1,$2,$3,$4,$5) RETURNING id, username, public_key, wrapped_private_key', [name, salt, passwordHash, body.publicKey, body.wrappedPrivateKey]);
    } catch (error) {
      if (error.code === '23505') return json(res, 409, { error: 'Username is unavailable.' });
      throw error;
    }
    const user = result.rows[0];
    return json(res, 201, { token: issueToken(user), user: { id: user.id, username: user.username, publicKey: user.public_key, wrappedPrivateKey: user.wrapped_private_key } });
  }

  if (req.method === 'POST' && path === '/api/v1/login') {
    const body = await readBody(req);
    const name = username(body.username);
    if (!USERNAME.test(name) || typeof body.password !== 'string' || body.password.length > 1024) return json(res, 400, { error: 'Invalid credentials.' });
    const result = await pool.query('SELECT id, username, password_salt, password_hash, public_key, wrapped_private_key FROM users WHERE username=$1', [name]);
    const user = result.rows[0];
    const salt = user?.password_salt || Buffer.alloc(16);
    const expected = user?.password_hash || Buffer.alloc(64);
    const actual = await new Promise((resolve, reject) => crypto.scrypt(body.password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (err, key) => err ? reject(err) : resolve(key)));
    if (!crypto.timingSafeEqual(actual, expected) || !user) return json(res, 401, { error: 'Invalid username or passphrase.' });
    return json(res, 200, { token: issueToken(user), user: { id: user.id, username: user.username, publicKey: user.public_key, wrappedPrivateKey: user.wrapped_private_key } });
  }

  const user = await authenticate(req);
  if (!user) return json(res, 401, { error: 'Sign in required.' });

  if (req.method === 'GET' && path === '/api/v1/me') return json(res, 200, { id: user.id, username: user.username, publicKey: user.public_key });

  if (req.method === 'GET' && path === '/api/v1/contacts') {
    const result = await pool.query('SELECT u.id, u.username, u.public_key, c.created_at FROM contacts c JOIN users u ON u.id=c.contact_id WHERE c.user_id=$1 ORDER BY u.username', [user.id]);
    return json(res, 200, { contacts: result.rows.map((x) => ({ id: x.id, username: x.username, publicKey: x.public_key, addedAt: x.created_at })) });
  }

  if (req.method === 'POST' && path === '/api/v1/contacts') {
    const body = await readBody(req);
    const name = username(body.username);
    if (!USERNAME.test(name) || name === user.username) return json(res, 400, { error: 'Enter another valid SCIF username.' });
    const target = await pool.query('SELECT id, username, public_key FROM users WHERE username=$1', [name]);
    if (!target.rows[0]) return json(res, 404, { error: 'No SCIF account found for that username.' });
    const contact = target.rows[0];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO contacts(user_id, contact_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [user.id, contact.id]);
      await client.query('INSERT INTO contacts(user_id, contact_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [contact.id, user.id]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    return json(res, 201, { contact: { id: contact.id, username: contact.username, publicKey: contact.public_key } });
  }

  const conversation = /^\/api\/v1\/messages\/([a-z0-9_]{3,24})$/.exec(path);
  if (conversation && req.method === 'GET') {
    const other = await pool.query('SELECT id, username, public_key FROM users WHERE username=$1', [conversation[1]]);
    if (!other.rows[0]) return json(res, 404, { error: 'Account not found.' });
    const result = await pool.query('SELECT id, sender_id, recipient_id, envelope_sender, envelope_recipient, created_at FROM messages WHERE (sender_id=$1 AND recipient_id=$2) OR (sender_id=$2 AND recipient_id=$1) ORDER BY created_at DESC LIMIT 100', [user.id, other.rows[0].id]);
    return json(res, 200, { peer: { id: other.rows[0].id, username: other.rows[0].username, publicKey: other.rows[0].public_key }, messages: result.rows.reverse().map((x) => ({ id: x.id, senderId: x.sender_id, recipientId: x.recipient_id, envelope: x.sender_id === user.id ? x.envelope_sender : x.envelope_recipient, createdAt: x.created_at })) });
  }

  if (req.method === 'POST' && path === '/api/v1/messages') {
    const body = await readBody(req);
    const recipientName = username(body.recipient);
    const validEnvelope = (x) => x && validB64(x.ephemeralPublicKey, 65, 1024) && validB64(x.salt, 32, 64) && validB64(x.iv, 12, 32) && validB64(x.ciphertext, 16, 10000);
    if (!USERNAME.test(recipientName) || !validEnvelope(body.envelopeSender) || !validEnvelope(body.envelopeRecipient)) return json(res, 400, { error: 'Invalid recipient or encrypted message envelope.' });
    const found = await pool.query('SELECT id FROM users WHERE username=$1', [recipientName]);
    if (!found.rows[0]) return json(res, 404, { error: 'Recipient account not found.' });
    if (found.rows[0].id === user.id) return json(res, 400, { error: 'Choose another account.' });
    const permitted = await pool.query('SELECT 1 FROM contacts WHERE user_id=$1 AND contact_id=$2', [user.id, found.rows[0].id]);
    if (!permitted.rowCount) return json(res, 403, { error: 'Add this account as a contact before messaging.' });
    const result = await pool.query('INSERT INTO messages(sender_id,recipient_id,envelope_sender,envelope_recipient) VALUES($1,$2,$3,$4) RETURNING id,created_at', [user.id, found.rows[0].id, body.envelopeSender, body.envelopeRecipient]);
    return json(res, 201, { message: { id: result.rows[0].id, createdAt: result.rows[0].created_at } });
  }

  return json(res, 404, { error: 'Not found.' });
}

async function start() {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;
  CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(24) NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_]{3,24}$'),
    password_salt BYTEA NOT NULL,
    password_hash BYTEA NOT NULL,
    public_key TEXT NOT NULL,
    wrapped_private_key JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS contacts (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(user_id, contact_id), CHECK(user_id <> contact_id)
  );
  CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    envelope_sender JSONB NOT NULL,
    envelope_recipient JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK(sender_id <> recipient_id)
  );
  CREATE INDEX IF NOT EXISTS messages_pair_created ON messages(sender_id, recipient_id, created_at);`);
  server.on('request', (req, res) => {
    route(req, res).catch((error) => {
      if (res.headersSent || res.destroyed) return;
      console.error('request_failed', req.method, req.url, error.status || 500);
      json(res, error.status || 500, { error: error.status ? error.message : 'Service error.' });
    });
  });
  server.listen(port, '0.0.0.0', () => console.log(`SCIF API listening on ${port}`));
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { server.close(); await pool.end(); process.exit(0); });
start().catch((error) => { console.error('startup_failed', error.message); process.exit(1); });
