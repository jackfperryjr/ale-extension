# ALE Extension

Chrome Manifest V3 extension for detecting synthetic and AI-generated video content. Injects a bottle cap icon onto video players across supported platforms — clicking it sends the URL to the ALE API and displays a reality score in seconds.

---

## How It Works

When you navigate to a supported video platform, the content script overlays a clickable bottle cap on the video player. Clicking it triggers an analysis request through the service worker, which calls the ALE API and returns a score:

- **Pure ALE (≥ 85)** — strong indicators of genuine content
- **Mixed Pour (60–84)** — inconclusive, may warrant closer review
- **Flat (30–59)** — likely synthetic or manipulated
- **Skunked (< 30)** — high confidence of AI generation or deepfake

Any result below 85 shows a **Request Human Verification** button that queues the item for brewmaster review in The Brewery dashboard.

Results are cached locally by URL so repeat visits don't re-trigger the API.

---

## Supported Platforms

- YouTube
- X (Twitter)
- TikTok
- Vimeo
- Instagram
- Facebook
- Reddit

Any page with a `<video>` element will also receive the bottle cap via a generic fallback. Qualifying images (≥ 200×200 px) get a hover-activated cap as well.

---

## Project Structure

```
ale-extension/
├── manifest.json              # Extension manifest (MV3)
├── background/
│   └── service_worker.js      # Session ID management, API proxy
├── content/
│   ├── content.js             # Bottle cap injection, SPA nav detection
│   └── content.css            # Glow states (real / skunked)
├── popup/
│   ├── popup.html             # Manual analyze UI
│   ├── popup.js               # Popup interaction logic
│   └── popup.css
└── icons/
```

---

## Getting Started

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select this directory

The extension icon will appear in your toolbar. Navigate to any supported video platform and click the bottle cap on the video player to run an analysis.

### Pointing to a different API

By default the extension calls `http://localhost:8000`. To point at a deployed API, update the `API_BASE` constant in both:

- `background/service_worker.js`
- `popup/popup.js`

---

## Tech Stack

| Layer      | Technology                         |
|------------|------------------------------------|
| Extension  | Chrome Manifest V3, vanilla JS     |
| API client | Fetch (REST calls to ALE API)      |
| Storage    | `chrome.storage.local` (result cache, session ID) |

---

## License

MIT
