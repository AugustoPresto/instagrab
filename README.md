# InstaGrab

**Download Instagram photos, videos, and carousels in full resolution — directly from your browser.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Chrome Extension](https://img.shields.io/badge/Chrome%2FBrave-Extension-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)
![React](https://img.shields.io/badge/React-18-61dafb)
![Python](https://img.shields.io/badge/Python-3.11%2B-green)

---

## Features

- 📸 **Full-resolution downloads** — no crops, no watermarks
- 🎠 **Full carousel support** — download all images in a multi-post at once
- 🎬 **Video/Reel support** — download video posts too
- ✅ **Selective download** — pick individual items from a carousel before downloading
- 🤖 **AI renaming CLI** — rename files using GPT-4o Vision or local CLIP model
- 🔒 **Privacy-first** — runs entirely in your browser using your own authenticated session

---

## Tech Stack

| Layer | Technology |
|---|---|
| Extension UI | React 18 + TypeScript |
| Styling | Tailwind CSS |
| Build | Vite |
| Extension APIs | Chrome MV3 (background Service Worker, content scripts) |
| AI CLI | Python 3.11+, OpenAI GPT-4o, OpenCLIP (local) |

---

## Project Structure

```
instagrab/
├── src/
│   ├── popup/          # React UI (popup.html + App)
│   │   └── components/ # Header, MediaGrid, MediaCard, StatusScreen
│   ├── content/        # Content script (injected into Instagram pages)
│   ├── background/     # Service Worker (manages downloads)
│   └── shared/         # TypeScript types + extractor logic
├── public/
│   └── manifest.json   # Chrome Extension Manifest V3
├── cli/
│   ├── rename_ai.py    # AI-powered file renaming CLI
│   └── requirements.txt
├── vite.config.ts
├── tsconfig.json
└── tailwind.config.js
```

---

## Installation (Development)

### Prerequisites

- Node.js 20+
- npm 10+

### Setup

```bash
git clone https://github.com/AugustoPresto/instagrab.git
cd instagrab
npm install
npm run build
```

### Load in Chrome/Brave

1. Open `chrome://extensions` (or `brave://extensions`)
2. Enable **Developer mode** (toggle top-right)
3. Click **Load unpacked**
4. Select the `dist/` folder

### Development (watch mode)

```bash
npm run dev
```

Changes rebuild automatically. Reload the extension in `chrome://extensions` to see updates.

---

## Usage

1. Navigate to any Instagram post, reel, or carousel in Chrome/Brave
2. Click the **InstaGrab** icon in the extensions toolbar
3. All media items appear as thumbnails — click to select/deselect
4. Click **Download** — files are saved to your `Downloads/InstaGrab/` folder

---

## AI Renaming CLI

The CLI analyzes your downloaded photos and renames them with descriptive names.

### Install CLI dependencies

```bash
cd cli
pip install -r requirements.txt
```

### Usage

```bash
# Sequential rename: photo1.jpg, photo2.jpg, ...
python -m cli.rename_ai ~/Downloads/InstaGrab --model sequential --prefix photo

# AI rename with GPT-4o Vision (requires OpenAI API key)
export OPENAI_API_KEY=sk-...
python -m cli.rename_ai ~/Downloads/InstaGrab --model gpt-4o

# AI rename with local CLIP model (fully offline, no API key)
python -m cli.rename_ai ~/Downloads/InstaGrab --model clip

# Preview without renaming
python -m cli.rename_ai ~/Downloads/InstaGrab --model clip --dry-run

# Save renamed copies to a different directory
python -m cli.rename_ai ~/Downloads/InstaGrab --model gpt-4o --output-dir ~/Desktop/renamed
```

### AI Models

| Model | Description | Requires |
|---|---|---|
| `sequential` | Simple numbered rename (`photo1.jpg`, etc.) | Nothing |
| `gpt-4o` | GPT-4o Vision generates descriptive names (`sunset-beach-couple.jpg`) | OpenAI API key |
| `clip` | Local CLIP model classifies images against tags (fully offline) | `torch`, `open_clip_torch` |

---

## How It Works

InstaGrab reads the same internal API JSON payloads that Instagram loads on every post page — no scraping, no external API calls. It finds the `xdt_api__v1__media__shortcode__web_info` JSON blob embedded in the page, parses `image_versions2.candidates`, and picks the highest-resolution uncropped URL for each media item.

This is the same approach used by Instagram's own mobile app to display images.

---

## Contributing

PRs welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

MIT © [Augusto Presto](https://github.com/AugustoPresto)
