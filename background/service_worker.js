const API_BASE = 'https://api.getale.io';

// Your Google OAuth client ID (Web application type).
// The redirect URI https://<ext-id>.chromiumapp.org/ must be in your Google OAuth client.
const GOOGLE_CLIENT_ID = '831658468381-7ad35ufpi8q3fidq7r9n9lt7qeajju3r.apps.googleusercontent.com';

// ── Session ───────────────────────────────────────────────────────────────────

async function getSession() {
  const stored = await chrome.storage.local.get('ale_session');
  return stored.ale_session ?? null;
}

async function saveSession(session) {
  await chrome.storage.local.set({ ale_session: session });
}

async function getSessionId() {
  const session = await getSession();
  if (session) return session.sessionId;
  // Anonymous fallback: stable per browser install
  const stored = await chrome.storage.local.get('ale_session_id');
  if (stored.ale_session_id) return stored.ale_session_id;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ ale_session_id: id });
  return id;
}

// ── Google OAuth ──────────────────────────────────────────────────────────────

async function signInWithGoogle() {
  const redirectUri = chrome.identity.getRedirectURL();
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', 'openid email profile');

  const responseUrl = await new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl.toString(), interactive: true },
      (url) => {
        if (chrome.runtime.lastError || !url) {
          reject(new Error(chrome.runtime.lastError?.message ?? 'Sign-in cancelled'));
        } else {
          resolve(url);
        }
      }
    );
  });

  const params = new URLSearchParams(new URL(responseUrl).hash.slice(1));
  const accessToken = params.get('access_token');
  if (!accessToken) throw new Error('No access token returned');

  const res = await fetch(`${API_BASE}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: accessToken }),
  });
  if (!res.ok) throw new Error(`Auth failed (${res.status})`);

  const data = await res.json();
  const session = {
    sessionId: data.session_id,
    email: data.email,
    dailyCredits: data.daily_credits,
  };
  await saveSession(session);
  return session;
}

async function signOut() {
  await chrome.storage.local.remove('ale_session');
}

// ── Message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'QUICK_ANALYZE') {
    analyzeUrl(msg.url, msg.videoId).then((data) => {
      if (sender.tab?.id && data && !data.error) {
        chrome.tabs.sendMessage(sender.tab.id, {
          type: 'ANALYZE_RESULT',
          score: data.reality_score,
          label: data.label,
          analysisId: data.id,
        });
      }
    });
    return false;
  }

  if (msg.type === 'ANALYZE') {
    analyzeUrl(msg.url, msg.videoId).then(sendResponse);
    return true;
  }

  if (msg.type === 'QUEUE_BREWMASTER') {
    queueBrewmaster(msg.url, msg.videoId, msg.analysisId).then(sendResponse);
    return true;
  }

  if (msg.type === 'SIGN_IN') {
    signInWithGoogle().then(sendResponse).catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (msg.type === 'SIGN_OUT') {
    signOut().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === 'GET_SESSION') {
    getSession().then(sendResponse);
    return true;
  }
});

// ── API helpers ───────────────────────────────────────────────────────────────

function checkStatus(res) {
  if (res.status === 402) return { error: "You're out of ALE. Come back tomorrow for 2 more." };
  if (res.status === 429) return { error: 'Too many requests. Give it a moment.' };
  if (!res.ok)            return { error: `API error (${res.status}).` };
  return null;
}

async function analyzeUrl(url, videoId) {
  try {
    const sessionId = await getSessionId();
    const res = await fetch(`${API_BASE}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, video_id: videoId ?? null, session_id: sessionId }),
    });
    const data = checkStatus(res) ?? await res.json();
    // Keep stored session credits in sync
    if (data.daily_credits != null) {
      const session = await getSession();
      if (session) await saveSession({ ...session, dailyCredits: data.daily_credits });
    }
    return data;
  } catch (err) {
    console.error('[ALE] /analyze failed:', err);
    return { error: 'Could not reach ALE API.' };
  }
}

async function queueBrewmaster(url, videoId, analysisId) {
  try {
    const sessionId = await getSessionId();
    const res = await fetch(`${API_BASE}/queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        video_id: videoId ?? null,
        analysis_id: analysisId ?? null,
        session_id: sessionId,
      }),
    });
    return checkStatus(res) ?? await res.json();
  } catch (err) {
    console.error('[ALE] /queue failed:', err);
    return { error: 'Could not reach ALE API.' };
  }
}
