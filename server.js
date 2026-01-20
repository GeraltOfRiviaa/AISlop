const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const { Server } = require('socket.io');
const io = new Server(http);

// --- Persistence setup ---
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const HISTORY_LIMIT = 100;

fs.mkdirSync(DATA_DIR, { recursive: true });

function readJsonSafe(file, fallback) {
  try {
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf8');
      return JSON.parse(raw || 'null') ?? fallback;
    }
  } catch (_) {}
  return fallback;
}

function writeJsonSafe(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to write file:', file, err);
  }
}

const users = readJsonSafe(USERS_FILE, {}); // { uid: username }
let history = readJsonSafe(HISTORY_FILE, []); // [{ from, text, at }]
// Migrate old messages to ensure they have required fields
// Use a base timestamp for messages missing 'at' to preserve relative ordering
const baseTimestamp = Date.now() - (history.length * 60000); // 1 minute per message back in time
history = history.map((msg, idx) => ({
  from: msg.from || 'Unknown',
  text: msg.text || '',
  at: msg.at || (baseTimestamp + idx * 60000),
  uid: msg.uid || null,
  accountId: msg.accountId || null
}));

// Accounts store: { [nickLower]: { nickname, pw: "salt:hash", createdAt } }
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const accounts = readJsonSafe(ACCOUNTS_FILE, {});

function normNick(n) {
  return String(n || '').trim();
}

function normKey(n) {
  return normNick(n).toLowerCase();
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(String(password), salt, 64).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(check, 'hex'), Buffer.from(hash, 'hex'));
  } catch {
    return false;
  }
}

function ensureAccountId(key) {
  const acc = accounts[key];
  if (!acc) return null;
  if (!acc.id) {
    acc.id = genUid();
    writeJsonSafe(ACCOUNTS_FILE, accounts);
  }
  return acc.id;
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  const parts = header.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

function genUid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return crypto.randomBytes(16).toString('hex');
}

// Attach UID cookie if missing and expose on req
app.use((req, res, next) => {
  const cookies = parseCookies(req.headers.cookie);
  let uid = cookies.uid;
  if (!uid) {
    uid = genUid();
    // 1 year
    res.cookie('uid', uid, {
      maxAge: 1000 * 60 * 60 * 24 * 365,
      httpOnly: true,
      sameSite: 'lax',
    });
  }
  req.uid = uid;
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Bootstrap endpoint for client to get username and history
app.get('/api/bootstrap', (req, res) => {
  const uid = req.uid;
  let username = users[uid] || null;
  let accountId = null;
  if (username) {
    const key = normKey(username);
    // If account no longer exists, clear stale session binding
    if (!accounts[key]) {
      delete users[uid];
      writeJsonSafe(USERS_FILE, users);
      username = null;
    } else {
      accountId = ensureAccountId(key);
    }
  }
  res.json({ uid, username, accountId, usersOnline: io.engine.clientsCount, history });
});

// Friendly routes for auth
app.get(['/auth', '/login', '/register'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'auth.html'));
});

// Session status
app.get('/api/session', (req, res) => {
  const uid = req.uid;
  const username = users[uid] || null;
  res.json({ authenticated: !!username, username });
});

// Register new account
app.post('/api/register', (req, res) => {
  const { nickname, password } = req.body || {};
  const nick = normNick(nickname).slice(0, 32);
  if (!nick) return res.status(400).json({ error: 'Chybí přezdívka' });
  if (!password || String(password).length < 6) {
    return res.status(400).json({ error: 'Heslo musí mít alespoň 6 znaků' });
  }
  const key = normKey(nick);
  if (accounts[key]) {
    return res.status(409).json({ error: 'Přezdívka už existuje' });
  }
  accounts[key] = {
    nickname: nick,
    pw: hashPassword(password),
    createdAt: Date.now(),
    id: genUid(),
  };
  writeJsonSafe(ACCOUNTS_FILE, accounts);
  // Bind this browser (uid) to the new nickname
  if (req.uid) {
    users[req.uid] = nick;
    writeJsonSafe(USERS_FILE, users);
  }
  res.json({ ok: true, nickname: nick });
});

// Login to existing account
app.post('/api/login', (req, res) => {
  const { nickname, password } = req.body || {};
  const nick = normNick(nickname).slice(0, 32);
  const key = normKey(nick);
  const acc = accounts[key];
  if (!acc) return res.status(404).json({ error: 'Účet neexistuje' });
  if (!verifyPassword(password, acc.pw)) {
    return res.status(401).json({ error: 'Neplatné přihlášení' });
  }
  if (req.uid) {
    users[req.uid] = acc.nickname;
    writeJsonSafe(USERS_FILE, users);
  }
  res.json({ ok: true, nickname: acc.nickname });
});

// Logout current session
app.post('/api/logout', (req, res) => {
  if (req.uid && users[req.uid]) {
    delete users[req.uid];
    writeJsonSafe(USERS_FILE, users);
  }
  res.clearCookie('uid');  // Clear the cookie
  res.json({ ok: true });
});

// Change nickname (requires current password)
app.post('/api/change-nick', (req, res) => {
  const uid = req.uid;
  const currentNick = users[uid];
  if (!uid || !currentNick) return res.status(401).json({ error: 'Nepřihlášen' });

  const { newNickname, password } = req.body || {};
  const key = normKey(currentNick);
  const acc = accounts[key];
  if (!acc) return res.status(400).json({ error: 'Účet nenalezen' });
  if (!verifyPassword(password, acc.pw)) return res.status(401).json({ error: 'Neplatné heslo' });

  const newNick = normNick(newNickname).slice(0, 32);
  if (!newNick) return res.status(400).json({ error: 'Chybí nová přezdívka' });
  const newKey = normKey(newNick);
  if (accounts[newKey]) return res.status(409).json({ error: 'Přezdívka už existuje' });

  // Update accounts map (rename key)
  accounts[newKey] = { ...acc, nickname: newNick };
  delete accounts[key];
  writeJsonSafe(ACCOUNTS_FILE, accounts);

  // Update session binding
  users[uid] = newNick;
  writeJsonSafe(USERS_FILE, users);

  res.json({ ok: true, nickname: newNick });
});

// Change password (requires current password)
app.post('/api/change-password', (req, res) => {
  const uid = req.uid;
  const currentNick = users[uid];
  if (!uid || !currentNick) return res.status(401).json({ error: 'Nepřihlášen' });

  const { password, newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ error: 'Nové heslo musí mít alespoň 6 znaků' });
  }
  const key = normKey(currentNick);
  const acc = accounts[key];
  if (!acc) return res.status(400).json({ error: 'Účet nenalezen' });
  if (!verifyPassword(password, acc.pw)) return res.status(401).json({ error: 'Neplatné heslo' });

  acc.pw = hashPassword(newPassword);
  writeJsonSafe(ACCOUNTS_FILE, accounts);
  res.json({ ok: true });
});

io.on('connection', (socket) => {
  const cookies = parseCookies(socket.handshake.headers.cookie);
  const uid = cookies.uid;
  let username = users[uid] || 'Anonym';
  let accountId = username ? ensureAccountId(normKey(username)) : null;

  socket.on('join', (name) => {
    // Join is for presence only; session binding happens on login/register
    username = String(name || 'Anonym').slice(0, 32);
    const accKey = normKey(username);
    if (accounts[accKey]) {
      accountId = ensureAccountId(accKey) || accountId;
    }
    socket.broadcast.emit('system', `${username} se připojil/a`);
    io.emit('users', io.engine.clientsCount);
  });

  socket.on('chat', (msg) => {
    const text = String(msg || '').trim().slice(0, 500);  // Enforce 500 char limit
    if (!text) return;
    const payload = { from: username, text, at: Date.now(), uid, accountId };
    history.push(payload);
    if (history.length > HISTORY_LIMIT) history = history.slice(-HISTORY_LIMIT);
    writeJsonSafe(HISTORY_FILE, history);
    io.emit('chat', payload);
  });

  socket.on('disconnect', () => {
    socket.broadcast.emit('system', `${username} se odpojil/a`);
    io.emit('users', io.engine.clientsCount);
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server běží na http://localhost:${PORT}`);
});
