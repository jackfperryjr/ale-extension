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

  const res = await fetchWithRetry(`${API_BASE}/auth/google`, {
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
    credits: data.credits ?? 0,
  };
  await saveSession(session);
  return session;
}

async function signOut() {
  await chrome.storage.local.remove('ale_session');
}

async function refreshSession() {
  try {
    const session = await getSession();
    if (!session) return null;
    const res = await fetch(`${API_BASE}/me?session_id=${encodeURIComponent(session.sessionId)}`);
    if (!res.ok) return session;
    const data = await res.json();
    const updated = { ...session, dailyCredits: data.daily_credits, credits: data.credits ?? 0 };
    await saveSession(updated);
    return updated;
  } catch {
    return null;
  }
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
    analyzeUrl(msg.url, msg.videoId, msg.videoDuration, msg.trigger, msg.contentType).then(sendResponse);
    return true;
  }

  if (msg.type === 'DISAGREE') {
    markDisagreement(msg.analysisId).then(sendResponse);
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

  if (msg.type === 'REFRESH_SESSION') {
    refreshSession().then(sendResponse);
    return true;
  }
});

// ── API helpers ───────────────────────────────────────────────────────────────

async function fetchWithRetry(url, options, retries = 3, delayMs = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

function checkStatus(res) {
  if (res.status === 402) return { error: "You're out of ALE. Come back tomorrow for 2 more." };
  if (res.status === 413) return { error: 'Video is too long. Max 15 minutes per pour.' };
  if (res.status === 422) return { error: "Media format not supported. Try a direct image URL." };
  if (res.status === 429) return { error: 'Too many requests. Give it a moment.' };
  if (!res.ok)            return { error: `API error (${res.status}).` };
  return null;
}

async function analyzeUrl(url, videoId, videoDuration, trigger, contentType) {
  try {
    const session = await getSession();
    if (!session) return { error: 'Sign in to pour. Click the ALE icon in your toolbar.' };
    const res = await fetch(`${API_BASE}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        video_id: videoId ?? null,
        session_id: session.sessionId,
        video_duration_seconds: videoDuration ?? null,
        trigger: trigger ?? null,
        content_type: contentType ?? null,
      }),
    });
    const data = checkStatus(res) ?? await res.json();
    // Keep stored session credits in sync
    if (data.daily_credits != null) {
      const session = await getSession();
      if (session) await saveSession({
        ...session,
        dailyCredits: data.daily_credits,
        credits: data.credits ?? session.credits,
      });
    }
    return data;
  } catch (err) {
    console.error('[ALE] /analyze failed:', err);
    return { error: 'Could not reach ALE API.' };
  }
}

async function markDisagreement(analysisId) {
  try {
    const session = await getSession();
    await fetch(`${API_BASE}/analyze/${analysisId}/disagree`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: session?.sessionId ?? null }),
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

async function queueBrewmaster(url, videoId, analysisId) {
  try {
    const session = await getSession();
    if (!session) return { error: 'Sign in to request human verification.' };
    const res = await fetch(`${API_BASE}/queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        video_id: videoId ?? null,
        analysis_id: analysisId ?? null,
        session_id: session.sessionId,
      }),
    });
    return checkStatus(res) ?? await res.json();
  } catch (err) {
    console.error('[ALE] /queue failed:', err);
    return { error: 'Could not reach ALE API.' };
  }
}
