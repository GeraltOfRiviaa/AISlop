/* global io */
const socket = io();

let username = '';
let myUid = '';
let myAccountId = '';

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (typeof text === 'string') e.textContent = text;
  return e;
}

const messages = document.getElementById('messages');
const usersEl = document.getElementById('users');
const form = document.getElementById('form');
const input = document.getElementById('input');

function addSystem(msg) {
  const m = el('div', 'system', msg);
  messages.appendChild(m);
  messages.scrollTop = messages.scrollHeight;
}

function addMessage({ from, text, at, uid, accountId }) {
  const wrap = el('div', 'message');
  const isSelf = (accountId && myAccountId && accountId === myAccountId);
  if (isSelf) wrap.classList.add('self');

  const meta = el('div', 'meta', `${from} • ${new Date(at).toLocaleString()}`);
  const body = el('div', 'body', text);
  wrap.appendChild(meta);
  wrap.appendChild(body);
  messages.appendChild(wrap);
  messages.scrollTop = messages.scrollHeight;
}

async function bootstrap() {
  try {
    const res = await fetch('/api/bootstrap');
    const data = await res.json();
    // Require authenticated session
    if (!data.username) {
      // Není přihlášen – přesměruj na auth stránku
      location.replace('/auth.html');
      return;
    }
    // Set identity BEFORE rendering history so alignment works
    myUid = data.uid || '';
    myAccountId = data.accountId || '';
    username = data.username;

    messages.innerHTML = '';  // Clear old messages
    if (Array.isArray(data.history)) {
      for (const m of data.history) addMessage(m);
    }
    if (typeof data.usersOnline === 'number') {
      usersEl.textContent = data.usersOnline;
    }
    socket.emit('join', username);
  } catch (e) {
    // Bootstrap selhal – zkus auth stránku
    location.replace('/auth.html');
    return;
  }
}

socket.on('connect', () => {
  if (!username) bootstrap();
});

socket.on('system', (msg) => addSystem(msg));

socket.on('chat', (payload) => addMessage(payload));

socket.on('users', (count) => {
  usersEl.textContent = count;
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = (input.value || '').trim();
  if (!text) return;
  socket.emit('chat', text);
  input.value = '';
});

// Auto-focus input for quick typing
input.focus();
