export {};

import { CONTENT_MESSAGE_ACTIONS } from '../shared/constants';
import {
  getBootstrapData,
  pingBackground,
  sendToActiveTab,
  type ContentStateResponse
} from '../shared/messages';

type ContentActionResponse = ContentStateResponse | {
  ok: false;
  error: string;
  state?: ContentStateResponse['state'] | null;
};

const root = document.querySelector<HTMLDivElement>('#app');

if (root) {
  root.innerHTML = `
    <main style="font-family: sans-serif; padding: 16px; width: 360px;">
      <h1 style="font-size: 18px; margin: 0 0 12px;">AI Page Translator</h1>
      <p id="summary" style="margin: 0 0 8px; color: #444;">Loading...</p>
      <p id="meta" style="margin: 0 0 12px; color: #666; font-size: 12px;"></p>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <button id="start" type="button">Resume</button>
        <button id="stop" type="button">Pause</button>
        <button id="rescan" type="button">Rescan</button>
        <button id="restart" type="button">Restart</button>
        <button id="clear" type="button">Clear</button>
        <button id="refresh" type="button">Refresh</button>
        <button id="ping" type="button">Ping bg</button>
      </div>
      <pre id="result" style="white-space: pre-wrap; margin-top: 12px;"></pre>
    </main>
  `;

  const start = document.querySelector<HTMLButtonElement>('#start');
  const stop = document.querySelector<HTMLButtonElement>('#stop');
  const clear = document.querySelector<HTMLButtonElement>('#clear');
  const refresh = document.querySelector<HTMLButtonElement>('#refresh');
  const rescan = document.querySelector<HTMLButtonElement>('#rescan');
  const restart = document.querySelector<HTMLButtonElement>('#restart');
  const ping = document.querySelector<HTMLButtonElement>('#ping');
  const result = document.querySelector<HTMLElement>('#result');
  const summary = document.querySelector<HTMLElement>('#summary');
  const meta = document.querySelector<HTMLElement>('#meta');

  void initializePopup(summary, meta, result);

  start?.addEventListener('click', async () => {
    await dispatchContentAction(summary, meta, result, {
      type: CONTENT_MESSAGE_ACTIONS.startTranslation
    });
  });

  stop?.addEventListener('click', async () => {
    await dispatchContentAction(summary, meta, result, {
      type: CONTENT_MESSAGE_ACTIONS.stopTranslation
    });
  });

  rescan?.addEventListener('click', async () => {
    await dispatchContentAction(summary, meta, result, {
      type: CONTENT_MESSAGE_ACTIONS.rescanTranslation
    });
  });

  restart?.addEventListener('click', async () => {
    await dispatchContentAction(summary, meta, result, {
      type: CONTENT_MESSAGE_ACTIONS.restartTranslation
    });
  });

  clear?.addEventListener('click', async () => {
    await dispatchContentAction(summary, meta, result, {
      type: CONTENT_MESSAGE_ACTIONS.clearTranslation
    });
  });

  refresh?.addEventListener('click', async () => {
    await refreshContentState(summary, meta, result);
  });

  ping?.addEventListener('click', async () => {
    const response = await pingBackground();
    if (result) {
      result.textContent = JSON.stringify(response, null, 2);
    }
  });
}

async function initializePopup(
  summary: HTMLElement | null,
  meta: HTMLElement | null,
  result: HTMLElement | null
): Promise<void> {
  try {
    const bootstrap = await getBootstrapData();
    if (meta) {
      meta.textContent = `Providers: ${bootstrap.providers.length} | Default: ${bootstrap.settings.defaultProviderId ?? 'none'} | Auto: ${bootstrap.settings.autoTranslateEnabled ? 'on' : 'off'}`;
    }
  } catch (error) {
    renderActionError(summary, meta, result, error);
    return;
  }

  await refreshContentState(summary, meta, result);
}

async function dispatchContentAction(
  summary: HTMLElement | null,
  meta: HTMLElement | null,
  result: HTMLElement | null,
  request: { type: string }
): Promise<void> {
  try {
    const response = await sendToActiveTab<ContentActionResponse>(request as never);
    if (response.ok === false) {
      renderActionError(summary, meta, result, new Error(response.error || 'Content action failed'));
      if (response.state) {
        renderContentState(summary, meta, result, { ok: true, state: response.state });
      }
      return;
    }
    renderContentState(summary, meta, result, response);
  } catch (error) {
    renderActionError(summary, meta, result, error);
  }
}

async function refreshContentState(
  summary: HTMLElement | null,
  meta: HTMLElement | null,
  result: HTMLElement | null
): Promise<void> {
  try {
    const response = await sendToActiveTab<ContentActionResponse>({
      type: CONTENT_MESSAGE_ACTIONS.getState
    });
    if (response.ok === false) {
      renderActionError(summary, meta, result, new Error(response.error || 'Content state failed'));
      if (response.state) {
        renderContentState(summary, meta, result, { ok: true, state: response.state });
      }
      return;
    }
    renderContentState(summary, meta, result, response);
  } catch (error) {
    renderActionError(summary, meta, result, error);
  }
}

function renderActionError(
  summary: HTMLElement | null,
  meta: HTMLElement | null,
  result: HTMLElement | null,
  error: unknown
): void {
  const message = error instanceof Error ? error.message : 'Failed to reach content script';

  if (summary) {
    summary.textContent = `Error: ${message}`;
  }

  if (meta) {
    meta.textContent = 'Site adapter unavailable';
  }

  if (result) {
    result.textContent = JSON.stringify({ ok: false, error: message }, null, 2);
  }
}

function renderContentState(
  summary: HTMLElement | null,
  meta: HTMLElement | null,
  result: HTMLElement | null,
  response: ContentStateResponse
): void {
  if (summary) {
    summary.textContent = `Status: ${response.state.status} | Total: ${response.state.total} | Completed: ${response.state.completed} | Failed: ${response.state.failed}`;
  }

  if (meta) {
    meta.textContent = `Adapter: ${response.state.adapterName ?? 'unknown'} | Session: ${response.state.sessionId ?? 'none'} | URL: ${response.state.currentUrl ?? 'unknown'} | Detected: ${response.state.detectedSegments} | Skipped: ${response.state.skipped} | Cache hits: ${response.state.cacheHits} | Routes: ${response.state.routeChanges} | Ready: ${response.state.pageReady ? 'yes' : 'no'} | Observing: ${response.state.observing ? 'yes' : 'no'}`;
  }

  if (result) {
    result.textContent = JSON.stringify(response, null, 2);
  }
}
