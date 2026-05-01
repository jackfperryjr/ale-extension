const ALE_CAP_ID     = 'ale-bottle-cap';
const ALE_IMG_CAP_ID = 'ale-img-cap';
const ALE_PANEL_ID   = 'ale-panel';
const CIRCUMFERENCE = 2 * Math.PI * 40;

let currentUrl     = window.location.href; // tracks page URL for navigation detection
let analyzeUrl     = window.location.href; // what actually gets sent to the API (may be img.src)
let currentVideoId = null;
let lastAnalysisId = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

function getVideoId() {
  const host = window.location.hostname;
  if (host === 'www.youtube.com') {
    return new URLSearchParams(window.location.search).get('v');
  }
  if (host === 'x.com' || host === 'twitter.com') {
    const m = window.location.pathname.match(/\/status\/(\d+)/);
    return m ? m[1] : null;
  }
  return null;
}

function truncateUrl(url, n = 36) {
  try {
    const { hostname, pathname } = new URL(url);
    const short = hostname.replace('www.', '') + pathname;
    return short.length > n ? short.slice(0, n) + '…' : short;
  } catch {
    return url.length > n ? url.slice(0, n) + '…' : url;
  }
}

// ── Panel ─────────────────────────────────────────────────────────────────────

function buildPanel() {
  const panel = document.createElement('div');
  panel.id = ALE_PANEL_ID;
  panel.innerHTML = `
    <div class="alep-header">
      <span class="alep-logo">ALE</span>
      <span class="alep-tagline">Authenticity Logic Engine</span>
      <button class="alep-close" id="alep-close">✕</button>
    </div>
    <div class="alep-url" id="alep-url"></div>
    <div class="alep-body">
      <div id="alep-idle" class="alep-idle">
        <span>Starting analysis…</span>
      </div>
      <div id="alep-pour" class="alep-pour" style="display:none">
        <div class="alep-glass">
          <div class="alep-liquid" id="alep-liquid"></div>
          <div class="alep-foam"></div>
        </div>
        <span class="alep-pour-label">Analyzing…</span>
      </div>
      <div id="alep-score" class="alep-score" style="display:none">
        <div class="alep-ring-wrap">
          <svg viewBox="0 0 100 100" class="alep-ring-svg">
            <circle class="alep-ring-bg" cx="50" cy="50" r="40"/>
            <circle class="alep-ring-fill" id="alep-ring-fill" cx="50" cy="50" r="40"
              stroke-dasharray="${CIRCUMFERENCE}" stroke-dashoffset="${CIRCUMFERENCE}"/>
          </svg>
          <div class="alep-score-val" id="alep-score-val">—</div>
        </div>
        <div class="alep-score-label" id="alep-score-label">—</div>
      </div>
    </div>
    <div class="alep-actions">
      <button id="alep-verify" class="alep-btn-verify" style="display:none">Re-analyze</button>
      <button id="alep-brewmaster" class="alep-btn-brewmaster" style="display:none">Request Human Verification</button>
    </div>
    <div class="alep-status" id="alep-status"></div>
  `;

  panel.querySelector('#alep-close').addEventListener('click', (e) => {
    e.stopPropagation();
    closePanel();
  });

  panel.querySelector('#alep-verify').addEventListener('click', (e) => {
    e.stopPropagation();
    runAnalysis();
  });

  panel.querySelector('#alep-brewmaster').addEventListener('click', (e) => {
    e.stopPropagation();
    requestBrewmaster();
  });

  // Swallow all clicks so they don't reach the video player underneath
  panel.addEventListener('click', (e) => e.stopPropagation());

  return panel;
}

function openPanel(anchorEl, { imageUrl = null } = {}) {
  // Capture rect before closePanel hides the element (hidden elements return zeros)
  const anchorRect = anchorEl.getBoundingClientRect();
  closePanel();
  if (imageUrl) {
    analyzeUrl     = imageUrl; // analyze the image URL, not the page URL
    currentVideoId = null;
  } else {
    analyzeUrl     = currentUrl;
    currentVideoId = getVideoId();
  }
  lastAnalysisId = null;

  const panel = buildPanel();
  panel.querySelector('#alep-url').textContent = truncateUrl(analyzeUrl);

  if (imageUrl) {
    panel.style.position = 'fixed';
    panel.style.zIndex   = '2147483647';
    panel.style.top      = Math.min(anchorRect.bottom + 8, window.innerHeight - 420) + 'px';
    panel.style.right    = Math.max(window.innerWidth - anchorRect.right, 8) + 'px';
    document.body.appendChild(panel);
  } else {
    anchorEl.appendChild(panel);
  }

  // Show cached result instantly; otherwise kick off a fresh analysis
  chrome.storage.local.get(analyzeUrl, (cache) => {
    if (cache[analyzeUrl]) {
      lastAnalysisId = cache[analyzeUrl].id ?? null;
      renderScore(cache[analyzeUrl]);
      const reBtn = document.getElementById('alep-verify');
      if (reBtn) reBtn.style.display = 'block';
    } else {
      runAnalysis();
    }
  });
}

function closePanel() {
  const panel = document.getElementById(ALE_PANEL_ID);
  panel?.remove();
  // Only hide the image cap when a panel was actually open (not during openPanel's pre-close)
  if (panel) {
    const imgCap = document.getElementById(ALE_IMG_CAP_ID);
    if (imgCap) imgCap.style.display = 'none';
  }
}

// ── Panel state ───────────────────────────────────────────────────────────────

function panelEl(id) {
  return document.getElementById(id);
}

function setStatus(msg) {
  const el = panelEl('alep-status');
  if (el) el.textContent = msg;
}

function showIdle(msg) {
  const idle  = panelEl('alep-idle');
  const pour  = panelEl('alep-pour');
  const score = panelEl('alep-score');
  if (pour)  pour.style.display  = 'none';
  if (score) score.style.display = 'none';
  if (idle)  { idle.style.display = 'flex'; idle.querySelector('span').textContent = msg; }
}

function showPour() {
  const idle  = panelEl('alep-idle');
  const pour  = panelEl('alep-pour');
  const score = panelEl('alep-score');
  if (idle)  idle.style.display  = 'none';
  if (score) score.style.display = 'none';
  if (pour)  pour.style.display  = 'flex';

  const liquid = panelEl('alep-liquid');
  if (!liquid) return;
  liquid.style.height = '0%';
  let pct = 0;
  const iv = setInterval(() => {
    pct = Math.min(pct + 1.5, 85);
    liquid.style.height = `${pct}%`;
    if (pct >= 85) clearInterval(iv);
  }, 40);
}

function renderScore(data) {
  const idle  = panelEl('alep-idle');
  const pour  = panelEl('alep-pour');
  const score = panelEl('alep-score');
  if (idle)  idle.style.display  = 'none';
  if (pour)  pour.style.display  = 'none';
  if (score) score.style.display = 'flex';

  const val   = data.reality_score;
  const color = val >= 70 ? '#00C875' : val >= 40 ? '#F0A020' : '#E03050';
  const label = val >= 70 ? '✓ Pure ALE' : val >= 40 ? '⚠ Mixed Pour' : '✗ Skunked';

  const ring = panelEl('alep-ring-fill');
  if (ring) {
    ring.style.strokeDashoffset = CIRCUMFERENCE * (1 - val / 100);
    ring.style.stroke = color;
  }

  const valEl = panelEl('alep-score-val');
  if (valEl) valEl.textContent = `${Math.round(val)}%`;

  const labelEl = panelEl('alep-score-label');
  if (labelEl) { labelEl.textContent = label; labelEl.style.color = color; }

  // Update bottle cap ring color (video or image cap)
  const cap = document.getElementById(ALE_CAP_ID) || document.getElementById(ALE_IMG_CAP_ID);
  if (cap) {
    cap.classList.remove('ale-analyzing');
    const ring = cap.querySelector('.ale-cap-ring');
    if (ring) ring.setAttribute('stroke', color);
    cap.dataset.tooltip = `${Math.round(val)}% — ${data.label}`;
  }

  // Show brewmaster option for anything not confidently real
  const brewmasterBtn = panelEl('alep-brewmaster');
  if (brewmasterBtn && val < 85) brewmasterBtn.style.display = 'block';
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function runAnalysis() {
  const verifyBtn = panelEl('alep-verify');
  const brewmasterBtn = panelEl('alep-brewmaster');
  if (verifyBtn) verifyBtn.disabled = true;
  if (brewmasterBtn) brewmasterBtn.style.display = 'none';
  setStatus('');
  showPour();

  const result = await chrome.runtime.sendMessage({
    type: 'ANALYZE',
    url: analyzeUrl,
    videoId: currentVideoId,
  });

  if (!result || result.error) {
    showIdle('');
    setStatus(result?.error ?? 'Unknown error. Is the ALE API running?');
    if (verifyBtn) { verifyBtn.disabled = false; verifyBtn.style.display = 'block'; }
    return;
  }

  lastAnalysisId = result.id;
  chrome.storage.local.set({ [analyzeUrl]: result });
  renderScore(result);
  if (verifyBtn) { verifyBtn.disabled = false; verifyBtn.style.display = 'block'; }
}

async function requestBrewmaster() {
  const brewmasterBtn = panelEl('alep-brewmaster');
  if (brewmasterBtn) brewmasterBtn.disabled = true;
  setStatus('Sending to brewmaster queue…');

  const result = await chrome.runtime.sendMessage({
    type: 'QUEUE_BREWMASTER',
    url: analyzeUrl,
    videoId: currentVideoId,
    analysisId: lastAnalysisId,
  });

  if (!result || result.error) {
    setStatus(result?.error ?? 'Failed to queue.');
    if (brewmasterBtn) brewmasterBtn.disabled = false;
    return;
  }

  setStatus('✓ Queued for human review. A brewmaster will verify this shortly.');
  if (brewmasterBtn) brewmasterBtn.style.display = 'none';
}

// ── Bottle cap ────────────────────────────────────────────────────────────────

function buildCap() {
  const cap = document.createElement('div');
  cap.id = ALE_CAP_ID;
  cap.dataset.tooltip = 'ALE — Click to analyze';
  const iconUrl = chrome.runtime.getURL('icons/android-chrome-192x192.png');
  cap.innerHTML = `
    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="ale-cap-clip">
          <circle cx="16" cy="16" r="12"/>
        </clipPath>
      </defs>
      <circle class="ale-cap-ring" cx="16" cy="16" r="14" fill="#0D1A22" stroke="#E8A020" stroke-width="2"/>
      <image href="${iconUrl}" x="4" y="4" width="24" height="24" clip-path="url(#ale-cap-clip)"/>
    </svg>
  `;

  // Block pointer/mouse events from bubbling to site handlers (e.g. Facebook feed navigation)
  ['pointerdown', 'mousedown', 'pointerup', 'mouseup'].forEach((evt) => {
    cap.addEventListener(evt, (e) => { e.stopPropagation(); e.preventDefault(); });
  });

  cap.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (document.getElementById(ALE_PANEL_ID)) {
      closePanel();
    } else {
      openPanel(cap.parentElement);
    }
  });

  return cap;
}

function resetCap() {
  closePanel();
  document.getElementById(ALE_CAP_ID)?.remove();
}

function injectBottleCap(player) {
  if (document.getElementById(ALE_CAP_ID)) return;
  player.style.position = 'relative';
  player.appendChild(buildCap());
}

// ── Image analysis ────────────────────────────────────────────────────────────

const taggedImages = new WeakSet();
let imgCapTimer = null;

function isQualifyingImage(img) {
  return (
    img instanceof HTMLImageElement &&
    img.naturalWidth  >= 200 &&
    img.naturalHeight >= 200 &&
    !img.closest(`#${ALE_IMG_CAP_ID}, #${ALE_PANEL_ID}`)
  );
}

function buildImgCap() {
  const cap = document.createElement('div');
  cap.id = ALE_IMG_CAP_ID;
  cap.dataset.tooltip = 'ALE — Click to analyze';
  const iconUrl = chrome.runtime.getURL('icons/android-chrome-192x192.png');
  cap.innerHTML = `
    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="ale-img-clip">
          <circle cx="16" cy="16" r="12"/>
        </clipPath>
      </defs>
      <circle class="ale-cap-ring" cx="16" cy="16" r="14" fill="#0D1A22" stroke="#E8A020" stroke-width="2"/>
      <image href="${iconUrl}" x="4" y="4" width="24" height="24" clip-path="url(#ale-img-clip)"/>
    </svg>
  `;

  // stopPropagation only — preventDefault suppresses click on body-level fixed elements
  ['pointerdown', 'mousedown', 'pointerup', 'mouseup'].forEach((evt) => {
    cap.addEventListener(evt, (e) => e.stopPropagation());
  });

  cap.addEventListener('click', (e) => {
    e.stopPropagation();
    if (document.getElementById(ALE_PANEL_ID)) {
      closePanel();
    } else if (cap._targetImg) {
      openPanel(cap, { imageUrl: cap._targetImg.src });
    }
  });

  cap.addEventListener('mouseleave', (e) => {
    clearTimeout(imgCapTimer);
    if (e.relatedTarget?.closest(`#${ALE_PANEL_ID}`)) return;
    imgCapTimer = setTimeout(() => {
      if (!document.getElementById(ALE_PANEL_ID)) cap.style.display = 'none';
    }, 250);
  });

  document.body.appendChild(cap);
  return cap;
}

function getImgCap() {
  return document.getElementById(ALE_IMG_CAP_ID) || buildImgCap();
}

function showImgCap(img) {
  const cap = getImgCap();
  const rect = img.getBoundingClientRect();
  cap.style.top   = (rect.top  + 10) + 'px';
  cap.style.right = (window.innerWidth - rect.right + 10) + 'px';
  cap.style.display = 'block';

  // Reset ring and tooltip when moving to a different image
  if (cap._targetImg !== img) {
    cap._targetImg = img;
    const ring = cap.querySelector('.ale-cap-ring');
    if (ring) ring.setAttribute('stroke', '#E8A020');
    cap.dataset.tooltip = 'ALE — Click to analyze';
  }
}

function tagImage(img) {
  if (taggedImages.has(img)) return;
  taggedImages.add(img);

  img.addEventListener('mouseenter', () => {
    clearTimeout(imgCapTimer);
    // Debounce: only show cap if the mouse lingers — prevents bouncing while scrolling
    imgCapTimer = setTimeout(() => {
      if (isQualifyingImage(img)) showImgCap(img);
    }, 350);
  });

  img.addEventListener('mouseleave', (e) => {
    clearTimeout(imgCapTimer);
    if (e.relatedTarget?.closest(`#${ALE_IMG_CAP_ID}`)) return;
    // Grace period: keep cap visible briefly so user can move their mouse to it
    imgCapTimer = setTimeout(() => {
      if (!document.getElementById(ALE_PANEL_ID)) {
        const cap = document.getElementById(ALE_IMG_CAP_ID);
        if (cap) cap.style.display = 'none';
      }
    }, 250);
  });
}

function tagImages() {
  document.querySelectorAll('img').forEach((img) => {
    if (taggedImages.has(img)) return;
    if (isQualifyingImage(img)) {
      tagImage(img);
    } else if (!img.complete) {
      img.addEventListener('load', () => {
        if (isQualifyingImage(img)) tagImage(img);
      }, { once: true });
    }
  });
}

// Walk up from a video element to the nearest ancestor that's large enough to host the cap
function findVideoContainer(video) {
  let el = video.parentElement;
  while (el && el !== document.body) {
    const { width, height } = el.getBoundingClientRect();
    if (width >= 200 && height >= 150) return el;
    el = el.parentElement;
  }
  return video.parentElement;
}

function injectFacebookReel() {
  if (document.getElementById(ALE_CAP_ID)) return;
  let attempts = 0;
  const poll = setInterval(() => {
    // Stop if cap appeared, URL left the reel, or we've exceeded ~6s
    if (document.getElementById(ALE_CAP_ID) ||
        !window.location.pathname.includes('/reel/') ||
        ++attempts > 20) {
      clearInterval(poll);
      return;
    }
    const v = document.querySelector(
      '[data-pagelet*="Reel"] video, [data-pagelet*="Stories"] video, video'
    );
    if (!v?.parentElement) return;
    const { width, height } = v.parentElement.getBoundingClientRect();
    if (width > 0 && height > 0) {
      clearInterval(poll);
      injectBottleCap(v.parentElement);
    }
  }, 300);
}

function tryInject() {
  const host = window.location.hostname;
  if (host === 'www.youtube.com') {
    const player = document.querySelector('#movie_player, ytd-player');
    if (player) injectBottleCap(player);
  } else if (host === 'x.com' || host === 'twitter.com') {
    document.querySelectorAll('[data-testid="videoPlayer"]').forEach(injectBottleCap);
  } else if (host === 'www.facebook.com' || host === 'facebook.com') {
    if (!window.location.pathname.includes('/reel/')) return;
    injectFacebookReel();
  } else if (host === 'www.tiktok.com') {
    const player = document.querySelector('[class*="DivVideoWrapper"], video');
    if (player?.parentElement) injectBottleCap(player.parentElement);
  } else if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const player = document.querySelector('.vp-player-layout, #player');
    if (player) injectBottleCap(player);
  } else {
    const video = document.querySelector('video');
    if (video?.parentElement) injectBottleCap(video.parentElement);
  }
}

tryInject();
tagImages();

const observer = new MutationObserver((mutations) => {
  const newUrl = window.location.href;
  if (newUrl !== currentUrl) {
    currentUrl = newUrl;
    analyzeUrl = newUrl;
    resetCap();
    tryInject();
    tagImages();
  } else {
    if (!document.getElementById(ALE_CAP_ID)) tryInject();
    if (mutations.some((m) => m.addedNodes.length > 0)) tagImages();
  }
});
observer.observe(document.body, { childList: true, subtree: true });
