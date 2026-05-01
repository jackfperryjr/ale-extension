const API_BASE = 'http://localhost:8000';

// Generate a session ID once per browser install and persist it.
// Lets the Brewery tie submissions to a browser without requiring a login.
async function getSessionId() {
  const stored = await chrome.storage.local.get('ale_session_id');
  if (stored.ale_session_id) return stored.ale_session_id;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ ale_session_id: id });
  return id;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'QUICK_ANALYZE') {
    analyzeUrl(msg.url, msg.videoId).then((data) => {
      if (sender.tab?.id && data && !data.error) {
        chrome.tabs.sendMessage(sender.tab.id, {
          type: 'ANALYZE_RESULT',
          score: data.reality_score,
          label: data.label,
          analysisId: data.id
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
});

function checkStatus(res) {
  if (res.status === 402) return { error: "You're out of ALE. Want to pour a fresh batch?" };
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
      body: JSON.stringify({ url, video_id: videoId ?? null, session_id: sessionId })
    });
    return checkStatus(res) ?? await res.json();
  } catch (err) {
    console.error('[ALE] /analyze failed:', err);
    return { error: 'Could not reach ALE API. Is it running?' };
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
        session_id: sessionId
      })
    });
    return checkStatus(res) ?? await res.json();
  } catch (err) {
    console.error('[ALE] /queue failed:', err);
    return { error: 'Could not reach ALE API. Is it running?' };
  }
}
