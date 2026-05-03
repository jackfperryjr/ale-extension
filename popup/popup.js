async function init() {
  const session = await chrome.runtime.sendMessage({ type: 'GET_SESSION' });
  renderAuth(session);
}

function setStatus(msg) {
  document.getElementById('statusMsg').textContent = msg;
}

function renderAuth(session) {
  const signedOut = document.getElementById('authSignedOut');
  const signedIn  = document.getElementById('authSignedIn');
  if (session) {
    signedOut.style.display = 'none';
    signedIn.style.display  = 'block';
    document.getElementById('authEmail').textContent   = session.email;
    document.getElementById('authCredits').textContent =
      `${session.dailyCredits ?? '?'} / 2`;
  } else {
    signedOut.style.display = 'flex';
    signedIn.style.display  = 'none';
  }
}

document.getElementById('signInBtn').addEventListener('click', async () => {
  const btn = document.getElementById('signInBtn');
  btn.disabled = true;
  const result = await chrome.runtime.sendMessage({ type: 'SIGN_IN' });
  if (result?.error) {
    btn.disabled = false;
    setStatus(result.error);
  } else {
    btn.disabled = false;
    setStatus('');
    renderAuth(result);
  }
});

document.getElementById('signOutBtn').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'SIGN_OUT' });
  renderAuth(null);
});

init();
