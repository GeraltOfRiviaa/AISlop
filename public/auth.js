async function checkSession() {
  try {
    const res = await fetch('/api/session');
    const data = await res.json();
    if (data && data.authenticated) {
      location.replace('/');
      return true;
    }
  } catch {}
  return false;
}

function $(id) { return document.getElementById(id); }

const tabLogin = $('tab-login');
const tabRegister = $('tab-register');
const formLogin = $('form-login');
const formRegister = $('form-register');
const loginError = $('login-error');
const regError = $('reg-error');

function setTab(which) {
  const login = which === 'login';
  tabLogin.classList.toggle('active', login);
  tabRegister.classList.toggle('active', !login);
  formLogin.style.display = login ? '' : 'none';
  formRegister.style.display = login ? 'none' : '';
}

tabLogin.addEventListener('click', () => setTab('login'));
tabRegister.addEventListener('click', () => setTab('register'));

formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const nickname = (document.getElementById('login-nick').value || '').trim();
  const password = document.getElementById('login-pass').value || '';
  try {
    const res = await fetch('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data && data.error || 'Chyba přihlášení');
    location.replace('/');
  } catch (err) {
    loginError.textContent = err.message || 'Chyba přihlášení';
  }
});

formRegister.addEventListener('submit', async (e) => {
  e.preventDefault();
  regError.textContent = '';
  const nickname = (document.getElementById('reg-nick').value || '').trim();
  const password = document.getElementById('reg-pass').value || '';
  try {
    const res = await fetch('/api/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data && data.error || 'Chyba registrace');
    location.replace('/');
  } catch (err) {
    regError.textContent = err.message || 'Chyba registrace';
  }
});

// If already authenticated, skip auth page
checkSession();
