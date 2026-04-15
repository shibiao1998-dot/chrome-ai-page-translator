# Chrome AI Page Translator

A Chrome Manifest V3 extension that translates webpage content into Simplified Chinese with AI providers.

Current implementation focuses on:
- automatic page translation on load
- dynamic page support for SPA-like sites such as `x.com`
- local Ollama usage through a stable local bridge
- popup controls for restart, rescan, pause, clear, and refresh
- options for provider, cache, concurrency, and route-change behavior

## Current Architecture

The project contains three major runtime pieces:

1. Chrome extension runtime
   - `background`: provider resolution, cache, health checks
   - `content`: page scanning, route-aware session lifecycle, rendering
   - `popup/options`: control and configuration UI

2. Local Ollama bridge
   - `scripts/ollama-bridge.mjs`
   - listens on `127.0.0.1:11435`
   - forwards translation requests to local Ollama
   - avoids browser-origin restrictions when direct Ollama access returns `403`

3. Build/runtime glue
   - `scripts/build-content.js` prepares a standalone content script
   - `vite.config.ts` builds the extension and copies the manifest to `dist/`

## Requirements

- macOS
- Chrome
- Node.js
- Ollama installed locally
- a local Ollama model available, currently defaulting to `qwen3.5:9b`

## Install Dependencies

```bash
cd /path/to/chrome-ai-page-translator
npm install
```

## Start Ollama

Make sure local Ollama is running and the model exists:

```bash
ollama list
```

The default bridge configuration expects Ollama at:

```text
http://127.0.0.1:11434
```

## Start the Local Bridge

The extension is now configured to use the local bridge provider by default.

Manual start:

```bash
cd /path/to/chrome-ai-page-translator
npm run bridge
```

Bridge endpoint:

```text
http://127.0.0.1:11435
```

Health check:

```bash
curl http://127.0.0.1:11435/health
```

Expected result:

```json
{"ok":true}
```

The bridge was also prepared for `launchd` usage with:

- `scripts/com.chrome-ai-page-translator.ollama-bridge.plist`

## Build the Extension

```bash
cd /path/to/chrome-ai-page-translator
npm run build
```

Build output goes to:

```text
dist/
```

## Load in Chrome

1. Open `chrome://extensions`
2. Enable Developer Mode
3. Remove any old loaded copy of this extension
4. Click `Load unpacked`
5. Select:

```text
/path/to/chrome-ai-page-translator/dist
```

## Default Provider Configuration

The default intended configuration is:

- `Type`: `ollama_bridge`
- `Base URL`: `http://127.0.0.1:11435`
- `Model`: `qwen3.5:9b`
- `Default Provider ID`: `ollama-qwen35-translator`

If needed, open the extension `Options` page and click:

- `Save provider + settings`

## Usage

On a normal webpage:

1. refresh the page once after loading the extension
2. open the extension popup
3. use `Refresh` to inspect current state
4. use `Resume`, `Rescan`, or `Restart` when needed

Popup meanings:

- `Resume`: start a new translation session for the current page
- `Pause`: stop current translation activity
- `Rescan`: scan current session again for more segments
- `Restart`: clear current page translation state and start a fresh session
- `Clear`: remove injected translation blocks from the current page
- `Refresh`: query current page translation state

## Current Supported Scenarios

- generic article/blog/news/doc pages
- `x.com` / `twitter.com` first-screen tweet body translation
- GitHub README and discussion/comment text pages
- SPA route-aware restart behavior in the content runtime

## Known Limitations

- `x.com` DOM varies by account, rollout, and experiment state; selectors may still miss some content
- direct Ollama browser-origin access may fail depending on Ollama version; the bridge is the recommended local path
- some pages with unusual CSS may still need more rendering isolation work
- some local models may still return empty translations intermittently; the bridge/provider already retries once for this path

## Troubleshooting

### `Could not establish connection. Receiving end does not exist.`

Usually means the current page did not load the content script correctly.

Try:

1. reload the extension from `chrome://extensions`
2. refresh the page
3. test on a normal `http` or `https` page

### `No active provider configured`

Open `Options` and verify:

- provider exists
- `enabled` is true
- `defaultProviderId` is set
- bridge type is selected when using the local bridge

### `Network error or CORS blocked`

For the current architecture, this usually means the bridge is not reachable.

Check:

```bash
curl http://127.0.0.1:11435/health
```

### `Model returned empty translation`

This is model-side behavior. The provider already retries once, but some local models still occasionally produce empty output.

### `No translatable content found on this page`

The page loaded, but the current adapter did not find eligible content blocks.

## Repository Layout

- `src/background/` extension background logic
- `src/popup/` popup UI
- `src/options/` options UI
- `src/providers/` provider implementations
- `src/shared/` shared types, messages, storage, prompts
- `src/content/` content runtime source template and manifest
- `scripts/` build helpers and local bridge
- `PLAN.md` original implementation planning document

## Development Notes

- content runtime is intentionally emitted as a standalone script to keep MV3 content injection stable
- bridge mode is now the preferred local-Ollama integration path
- `dist/` is build output and is intentionally ignored in Git
