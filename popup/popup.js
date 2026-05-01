const CIRCUMFERENCE = 2 * Math.PI * 40; // SVG circle r=40

let currentUrl = '';
let currentVideoId = null;
let lastAnalysisId = null;

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;

  currentUrl = tab.url;
  currentVideoId = extractVideoId(currentUrl);

  const urlEl = document.getElementById('currentUrl');
  urlEl.textContent = currentUrl.length > 52 ? currentUrl.slice(0, 49) + '…' : currentUrl;

  // Any page can be analyzed — Hive accepts any media URL
  const isInternalPage = currentUrl.startsWith('chrome://') || currentUrl.startsWith('chrome-extension://');
  document.getElementById('verifyBtn').disabled = isInternalPage;
  if (isInternalPage) {
    setStatus('Cannot verify browser internal pages.');
    return;
  }

  // Show cached result immediately if available
  const cache = await chrome.storage.local.get(currentUrl);
  if (cache[currentUrl]) {
    renderScore(cache[currentUrl]);
  }
}

function extractVideoId(url) {
  const yt = new URL(url).searchParams.get('v');
  if (yt) return yt;
  const xm = url.match(/\/status\/(\d+)/);
  return xm ? xm[1] : null;
}

function setStatus(msg) {
  document.getElementById('statusMsg').textContent = msg;
}

function showPour() {
  document.getElementById('scoreWrap').style.display = 'none';
  document.getElementById('pourWrap').style.display = 'flex';

  const liquid = document.getElementById('pourLiquid');
  liquid.style.height = '0%';
  let pct = 0;
  const interval = setInterval(() => {
    pct = Math.min(pct + 1.5, 85);
    liquid.style.height = `${pct}%`;
    if (pct >= 85) clearInterval(interval);
  }, 40);
}

function renderScore(data) {
  document.getElementById('pourWrap').style.display = 'none';

  const score = data.reality_score;
  const ring = document.getElementById('scoreRing');
  const offset = CIRCUMFERENCE * (1 - score / 100);
  ring.style.strokeDasharray = CIRCUMFERENCE;
  ring.style.strokeDashoffset = offset;
  ring.style.stroke = score >= 70 ? '#2D8A4E' : score >= 40 ? '#C8860A' : '#8B2020';

  document.getElementById('scoreValue').textContent = `${Math.round(score)}%`;

  const labelEl = document.getElementById('scoreLabel');
  if (score >= 70) {
    labelEl.textContent = '✓ Pure ALE';
    labelEl.className = 'ale-score-label real';
  } else if (score >= 40) {
    labelEl.textContent = '⚠ Mixed Pour';
    labelEl.className = 'ale-score-label mixed';
  } else {
    labelEl.textContent = '✗ Skunked';
    labelEl.className = 'ale-score-label skunked';
  }

  document.getElementById('scoreWrap').style.display = 'flex';

  // Offer human brewmaster for anything below "confident real"
  if (score < 85) {
    document.getElementById('brewmasterBtn').style.display = 'block';
  }
}

document.getElementById('verifyBtn').addEventListener('click', async () => {
  document.getElementById('verifyBtn').disabled = true;
  document.getElementById('brewmasterBtn').style.display = 'none';
  setStatus('');
  showPour();

  const result = await chrome.runtime.sendMessage({
    type: 'ANALYZE',
    url: currentUrl,
    videoId: currentVideoId
  });

  if (!result || result.error) {
    document.getElementById('pourWrap').style.display = 'none';
    setStatus(result?.error ?? 'Unknown error. Is the ALE API running?');
    document.getElementById('verifyBtn').disabled = false;
    return;
  }

  lastAnalysisId = result.id;
  await chrome.storage.local.set({ [currentUrl]: result });
  renderScore(result);
  document.getElementById('verifyBtn').disabled = false;
});

document.getElementById('brewmasterBtn').addEventListener('click', async () => {
  const btn = document.getElementById('brewmasterBtn');
  btn.disabled = true;
  setStatus('Sending to queue…');

  const result = await chrome.runtime.sendMessage({
    type: 'QUEUE_BREWMASTER',
    url: currentUrl,
    videoId: currentVideoId,
    analysisId: lastAnalysisId
  });

  if (!result || result.error) {
    setStatus(result?.error ?? 'Failed to queue.');
    btn.disabled = false;
    return;
  }

  setStatus('✓ Queued for review. A human will verify this shortly.');
  btn.style.display = 'none';
});

init();
