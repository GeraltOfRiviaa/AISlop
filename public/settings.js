(function(){
  const qs = (s)=>document.querySelector(s);
  const modal = qs('#settings-modal');
  const openBtn = qs('#btn-settings');
  const closeBtn = qs('#btn-close-settings');
  const logoutBtn = qs('#btn-logout');
  const changeNickBtn = qs('#btn-change-nick');
  const changePassBtn = qs('#btn-change-pass');
  const errEl = qs('#set-error');

  function open(){ modal.style.display='flex'; errEl.textContent=''; }
  function close(){ modal.style.display='none'; errEl.textContent='';
    qs('#set-current-pass').value=''; qs('#set-new-nick').value=''; qs('#set-new-pass').value=''; }

  if (openBtn) openBtn.addEventListener('click', open);
  if (closeBtn) closeBtn.addEventListener('click', close);
  if (modal) modal.addEventListener('click', (e)=>{ if(e.target===modal) close(); });

  if (logoutBtn) logoutBtn.addEventListener('click', async ()=>{
    try { await fetch('/api/logout', { method:'POST' }); location.replace('/auth.html'); } catch{}
  });

  if (changeNickBtn) changeNickBtn.addEventListener('click', async ()=>{
    errEl.textContent='';
    const password = (qs('#set-current-pass').value||'');
    const newNickname = (qs('#set-new-nick').value||'').trim();
    if(!newNickname) { errEl.textContent='Zadej novou přezdívku'; return; }
    try {
      const res = await fetch('/api/change-nick', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ password, newNickname }) });
      const data = await res.json();
      if(!res.ok) throw new Error(data && data.error || 'Chyba změny přezdívky');
      close(); location.reload();
    } catch(err){ errEl.textContent = err.message || 'Chyba změny přezdívky'; }
  });

  if (changePassBtn) changePassBtn.addEventListener('click', async ()=>{
    errEl.textContent='';
    const password = (qs('#set-current-pass').value||'');
    const newPassword = (qs('#set-new-pass').value||'');
    if(!newPassword || newPassword.length < 6) { errEl.textContent='Nové heslo musí mít alespoň 6 znaků'; return; }
    try {
      const res = await fetch('/api/change-password', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ password, newPassword }) });
      const data = await res.json();
      if(!res.ok) throw new Error(data && data.error || 'Chyba změny hesla');
      errEl.classList.remove('error');
      errEl.classList.add('success');
      errEl.textContent = 'Heslo změněno';
      setTimeout(()=>{ errEl.classList.remove('success'); errEl.classList.add('error'); errEl.textContent=''; }, 1500);
      qs('#set-new-pass').value='';
    } catch(err){ errEl.textContent = err.message || 'Chyba změny hesla'; }
  });
})();
