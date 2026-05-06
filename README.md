# <img src="./icons/android-chrome-192x192.png" width="32" height="32" /> ALE — Authenticity Logic Engine

> *Is it real, or has it been brewed up by a machine?*

ALE is a Chrome extension that detects AI-generated and deepfake video content. Navigate to a video, click the bottle cap, and get a pour in seconds.

<p align="center">
<img src="https://img.shields.io/github/sponsors/jackfperryjr?style=flat-square&color=ea4aaa" alt="GitHub Sponsors">
<img src="https://img.shields.io/badge/funding-0/50USD-red?style=flat-square" alt="Funding Goal">
<img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black">
<img src="https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white">
<img src="https://img.shields.io/github/license/jackfperryjr/ale-extension?style=flat-square&color=black" alt="License">
<img src="https://img.shields.io/badge/status-active-success?style=flat-square" alt="Status">
</p>

---

## The Pour

Every analysis comes back as one of three verdicts:

| Result | Score | What it means |
|---|---|---|
| **✓ Pure ALE** | ≥ 70 | Fresh from the source. Strong indicators of genuine content. |
| **⚠ Mixed Pour** | 40–69 | Something's off. Could be real, could be a blend. Worth a closer look. |
| **✗ Skunked** | < 40 | Don't drink this. High confidence of AI generation or deepfake. |

Anything short of a Pure ALE shows a **Request Human Verification** button — one tap sends it to the Brewmaster Queue for a human sign-off.

---

## How It Works

Sign in with your Google account, then navigate to any supported platform. A bottle cap appears on the video player. Click it — ALE sends the URL through its service worker to the ALE API, which runs it through Hive's deepfake and synthetic content detection model and pours back a score. Results are cached locally so revisiting the same video is instant.

Images work too: hover over any image ≥ 200×200 px and the bottle cap appears in the corner.

---

## Supported Platforms

- YouTube
- X / Twitter
- TikTok
- Vimeo
- Instagram
- Facebook Reels
- Reddit
- Any page with a `<video>` element (generic fallback)

---

## Getting Started

1. Go to `chrome://extensions` in Chrome
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select this directory
4. Click the ALE icon in your toolbar and **Sign in with Google**

That's it. Navigate to any supported video and tap the bottle cap.

---

## Project Structure

```
ale-extension/
├── manifest.json
├── background/
│   └── service_worker.js      # Google OAuth, session management, API proxy
├── content/
│   ├── content.js             # Bottle cap + panel injection, SPA nav detection
│   └── content.css            # Cap glow states (real / mixed / skunked)
├── popup/
│   ├── popup.html             # Account management (sign in/out, daily credits)
│   ├── popup.js
│   └── popup.css
└── icons/
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Extension | Chrome Manifest V3, vanilla JS |
| Auth | Google OAuth via `chrome.identity` |
| Detection | Hive AI deepfake + synthetic content model |
| Storage | `chrome.storage.local` (result cache, session) |

---

## License

MIT
