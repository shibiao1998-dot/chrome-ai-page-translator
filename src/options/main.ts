export {};

import { DEFAULT_OLLAMA_TIMEOUT_MS, MESSAGE_ACTIONS } from '../shared/constants';
import {
  clearCache,
  getBootstrapData,
  healthCheckProvider,
  sendToBackground
} from '../shared/messages';
import type { ExtensionSettings, ProviderConfig } from '../shared/types';

const root = document.querySelector<HTMLDivElement>('#app');

if (root) {
  root.innerHTML = `
    <main style="font-family: sans-serif; padding: 24px; max-width: 860px;">
      <h1 style="font-size: 24px; margin: 0 0 12px;">Options</h1>
      <p style="margin: 0 0 16px; color: #444;">Manage providers, automation, cache, and defaults.</p>
      <section style="display:grid; gap:12px; max-width:560px;">
        <label>ID<input id="id" style="display:block; width:100%; margin-top:4px;" /></label>
        <label>Label<input id="label" style="display:block; width:100%; margin-top:4px;" /></label>
        <label>Type<select id="type" style="display:block; width:100%; margin-top:4px;"><option value="ollama_bridge">ollama_bridge</option><option value="ollama">ollama</option><option value="openai_compatible">openai_compatible</option></select></label>
        <label>Base URL<input id="baseUrl" style="display:block; width:100%; margin-top:4px;" /></label>
        <label>Model<input id="model" style="display:block; width:100%; margin-top:4px;" /></label>
        <label>API Key<input id="apiKey" style="display:block; width:100%; margin-top:4px;" /></label>
        <label>Default Provider ID<input id="defaultProviderId" style="display:block; width:100%; margin-top:4px;" /></label>
        <label><input id="autoTranslateEnabled" type="checkbox" /> Auto translate on page load</label>
        <label><input id="observeDynamicContent" type="checkbox" /> Observe dynamic content</label>
        <label><input id="restartOnRouteChange" type="checkbox" /> Restart on SPA route change</label>
        <label><input id="visibleOnlyFirstPass" type="checkbox" /> First pass only visible content</label>
        <label><input id="cacheEnabled" type="checkbox" /> Enable translation cache</label>
        <label>Cache TTL (hours)<input id="cacheTTLHours" type="number" min="1" style="display:block; width:100%; margin-top:4px;" /></label>
        <label>Max concurrent segments<input id="maxConcurrentSegments" type="number" min="1" max="4" style="display:block; width:100%; margin-top:4px;" /></label>
        <label>Content scope<select id="contentScope" style="display:block; width:100%; margin-top:4px;"><option value="content_first">content_first</option><option value="max_coverage">max_coverage</option></select></label>
        <label>Ollama timeout (ms)<input id="timeoutMs" type="number" min="1000" step="1000" style="display:block; width:100%; margin-top:4px;" /></label>
      </section>
      <div style="display:flex; gap:8px; margin-top:16px; flex-wrap:wrap;">
        <button id="save" type="button">Save provider + settings</button>
        <button id="health" type="button">Health check</button>
        <button id="clearCache" type="button">Clear cache</button>
      </div>
      <p id="status" style="margin-top:12px; color:#444;"></p>
      <pre id="result" style="white-space: pre-wrap; margin-top: 16px;"></pre>
    </main>
  `;

  const elements = {
    id: document.querySelector<HTMLInputElement>('#id'),
    label: document.querySelector<HTMLInputElement>('#label'),
    type: document.querySelector<HTMLSelectElement>('#type'),
    baseUrl: document.querySelector<HTMLInputElement>('#baseUrl'),
    model: document.querySelector<HTMLInputElement>('#model'),
    apiKey: document.querySelector<HTMLInputElement>('#apiKey'),
    defaultProviderId: document.querySelector<HTMLInputElement>('#defaultProviderId'),
    autoTranslateEnabled: document.querySelector<HTMLInputElement>('#autoTranslateEnabled'),
    observeDynamicContent: document.querySelector<HTMLInputElement>('#observeDynamicContent'),
    restartOnRouteChange: document.querySelector<HTMLInputElement>('#restartOnRouteChange'),
    visibleOnlyFirstPass: document.querySelector<HTMLInputElement>('#visibleOnlyFirstPass'),
    cacheEnabled: document.querySelector<HTMLInputElement>('#cacheEnabled'),
    cacheTTLHours: document.querySelector<HTMLInputElement>('#cacheTTLHours'),
    maxConcurrentSegments: document.querySelector<HTMLInputElement>('#maxConcurrentSegments'),
    contentScope: document.querySelector<HTMLSelectElement>('#contentScope'),
    timeoutMs: document.querySelector<HTMLInputElement>('#timeoutMs')
  };
  const save = document.querySelector<HTMLButtonElement>('#save');
  const health = document.querySelector<HTMLButtonElement>('#health');
  const clearCacheButton = document.querySelector<HTMLButtonElement>('#clearCache');
  const status = document.querySelector<HTMLElement>('#status');
  const result = document.querySelector<HTMLElement>('#result');

  void loadState(result, status, elements);

  save?.addEventListener('click', async () => {
    const provider = buildProvider(elements);
    const bootstrap = await getBootstrapData();
    const providers = upsertProvider(bootstrap.providers, provider);
    const settings = buildSettings(elements, provider.id, bootstrap.settings);

    await sendToBackground({
      type: MESSAGE_ACTIONS.saveProviders,
      payload: { providers }
    });

    await sendToBackground({
      type: MESSAGE_ACTIONS.saveSettings,
      payload: { settings }
    });

    if (status) {
      status.textContent = 'Saved provider, automation, and cache settings.';
    }

    await loadState(result, status, elements);
  });

  health?.addEventListener('click', async () => {
    const response = await healthCheckProvider();
    if (status) {
      status.textContent = response.result.ok
        ? `Health check ok: ${response.result.message ?? 'ok'}`
        : `Health check failed: ${response.result.message ?? 'unknown error'}`;
    }
  });

  clearCacheButton?.addEventListener('click', async () => {
    await clearCache();
    if (status) {
      status.textContent = 'Translation cache cleared.';
    }
    await loadState(result, status, elements);
  });
}

async function loadState(
  result: HTMLElement | null,
  status: HTMLElement | null,
  elements: Record<string, HTMLInputElement | HTMLSelectElement | null>
): Promise<void> {
  let response = await getBootstrapData();

  if (response.providers.length === 0) {
    const provider: ProviderConfig = {
      id: 'ollama-qwen35-translator',
      type: 'ollama_bridge',
      label: 'Local Qwen35 Translator',
      baseUrl: 'http://127.0.0.1:11435',
      model: 'qwen3.5:9b',
      enabled: true,
      timeoutMs: DEFAULT_OLLAMA_TIMEOUT_MS
    };
    await sendToBackground({
      type: MESSAGE_ACTIONS.saveProviders,
      payload: { providers: [provider] }
    });
    await sendToBackground({
      type: MESSAGE_ACTIONS.saveSettings,
      payload: {
        settings: {
          ...response.settings,
          defaultProviderId: provider.id
        }
      }
    });
    if (status) {
      status.textContent = 'Loaded default local Ollama configuration.';
    }
    return loadState(result, status, elements);
  }

  const migrated = migrateLegacyDefaults(response.providers, response.settings);
  if (migrated) {
    await sendToBackground({
      type: MESSAGE_ACTIONS.saveProviders,
      payload: { providers: migrated.providers }
    });
    await sendToBackground({
      type: MESSAGE_ACTIONS.saveSettings,
      payload: { settings: migrated.settings }
    });
    if (status) {
      status.textContent = '已自动迁移到 hauhau-qwen35-a3b:q4km 默认模型。';
    }
    response = await getBootstrapData();
  }

  const provider = response.providers.find(
    (item) => item.id === response.settings.defaultProviderId
  ) ?? response.providers[0];

  if (!response.settings.defaultProviderId && provider) {
    await sendToBackground({
      type: MESSAGE_ACTIONS.saveSettings,
      payload: {
        settings: {
          ...response.settings,
          defaultProviderId: provider.id
        }
      }
    });
    response = await getBootstrapData();
  }

  assignElementValue(elements.id, provider.id);
  assignElementValue(elements.label, provider.label);
  assignElementValue(elements.type, provider.type);
  assignElementValue(elements.baseUrl, provider.baseUrl);
  assignElementValue(elements.model, provider.model);
  assignElementValue(elements.apiKey, provider.apiKey ?? '');
  assignElementValue(elements.defaultProviderId, response.settings.defaultProviderId ?? provider.id);
  assignCheckboxValue(elements.autoTranslateEnabled, response.settings.autoTranslateEnabled);
  assignCheckboxValue(elements.observeDynamicContent, response.settings.observeDynamicContent);
  assignCheckboxValue(elements.restartOnRouteChange, response.settings.siteOverrides['x.com']?.restartOnRouteChange ?? true);
  assignCheckboxValue(elements.visibleOnlyFirstPass, response.settings.siteOverrides['x.com']?.visibleOnlyFirstPass ?? true);
  assignCheckboxValue(elements.cacheEnabled, response.settings.cacheEnabled);
  assignElementValue(elements.cacheTTLHours, String(response.settings.cacheTTLHours));
  assignElementValue(elements.maxConcurrentSegments, String(response.settings.maxConcurrentSegments));
  assignElementValue(elements.contentScope, response.settings.contentScope);
  assignElementValue(elements.timeoutMs, String(provider.timeoutMs || DEFAULT_OLLAMA_TIMEOUT_MS));

  if (result) {
    result.textContent = JSON.stringify(response, null, 2);
  }
}

function buildProvider(elements: Record<string, HTMLInputElement | HTMLSelectElement | null>): ProviderConfig {
  return {
    id: readValue(elements.id, 'ollama-qwen35-translator'),
    type: readValue(elements.type, 'ollama_bridge') as ProviderConfig['type'],
    label: readValue(elements.label, 'Local Qwen35 Translator'),
    baseUrl: readValue(elements.baseUrl, 'http://127.0.0.1:11435'),
    model: readValue(elements.model, 'qwen3.5:9b'),
    apiKey: readValue(elements.apiKey, '') || undefined,
    enabled: true,
    timeoutMs: Number(readValue(elements.timeoutMs, String(DEFAULT_OLLAMA_TIMEOUT_MS))) || DEFAULT_OLLAMA_TIMEOUT_MS
  };
}

function buildSettings(
  elements: Record<string, HTMLInputElement | HTMLSelectElement | null>,
  providerId: string,
  previous: ExtensionSettings
): ExtensionSettings {
  return {
    ...previous,
    defaultProviderId: readValue(elements.defaultProviderId, providerId),
    autoTranslateEnabled: readCheckbox(elements.autoTranslateEnabled, true),
    observeDynamicContent: readCheckbox(elements.observeDynamicContent, true),
    cacheEnabled: readCheckbox(elements.cacheEnabled, true),
    cacheTTLHours: Number(readValue(elements.cacheTTLHours, '72')) || 72,
    maxConcurrentSegments: Number(readValue(elements.maxConcurrentSegments, '3')) || 3,
    contentScope: readValue(elements.contentScope, 'content_first') as ExtensionSettings['contentScope'],
    siteOverrides: {
      ...previous.siteOverrides,
      'x.com': {
        ...(previous.siteOverrides['x.com'] ?? { enabled: true }),
        enabled: true,
        observeDynamic: readCheckbox(elements.observeDynamicContent, true),
        restartOnRouteChange: readCheckbox(elements.restartOnRouteChange, true),
        visibleOnlyFirstPass: readCheckbox(elements.visibleOnlyFirstPass, true)
      },
      'twitter.com': {
        ...(previous.siteOverrides['twitter.com'] ?? { enabled: true }),
        enabled: true,
        observeDynamic: readCheckbox(elements.observeDynamicContent, true),
        restartOnRouteChange: readCheckbox(elements.restartOnRouteChange, true),
        visibleOnlyFirstPass: readCheckbox(elements.visibleOnlyFirstPass, true)
      }
    }
  };
}

function assignElementValue(
  element: HTMLInputElement | HTMLSelectElement | null,
  value: string
): void {
  if (element) {
    element.value = value;
  }
}

function assignCheckboxValue(element: HTMLInputElement | HTMLSelectElement | null, value: boolean): void {
  if (element instanceof HTMLInputElement) {
    element.checked = value;
  }
}

function readValue(element: HTMLInputElement | HTMLSelectElement | null, fallback: string): string {
  return element?.value || fallback;
}

function readCheckbox(
  element: HTMLInputElement | HTMLSelectElement | null,
  fallback: boolean
): boolean {
  return element instanceof HTMLInputElement ? element.checked : fallback;
}

function upsertProvider(
  providers: ProviderConfig[],
  nextProvider: ProviderConfig
): ProviderConfig[] {
  const index = providers.findIndex((provider) => provider.id === nextProvider.id);
  if (index === -1) {
    return [...providers, nextProvider];
  }

  const copy = [...providers];
  copy[index] = nextProvider;
  return copy;
}

function migrateLegacyDefaults(
  providers: ProviderConfig[],
  settings: ExtensionSettings
): { providers: ProviderConfig[]; settings: ExtensionSettings } | null {
  const legacyProvider = providers.find(
    (provider) => provider.id === 'ollama-gemma4'
      || provider.id === 'ollama-hauhau-qwen35'
      || provider.model === 'gemma4:31b-it-bf16'
      || provider.model === 'hauhau-qwen35-a3b:q4km'
  );

  if (!legacyProvider) {
    return null;
  }

  const migratedProvider: ProviderConfig = {
    ...legacyProvider,
    id: 'ollama-qwen35-translator',
    label: 'Local Qwen35 Translator',
    model: 'qwen3.5:9b',
    timeoutMs: legacyProvider.timeoutMs || DEFAULT_OLLAMA_TIMEOUT_MS
  };

  const nextProviders = [
    migratedProvider,
    ...providers.filter((provider) => provider !== legacyProvider && provider.id !== migratedProvider.id)
  ];

  return {
    providers: nextProviders,
    settings: {
      ...settings,
      defaultProviderId:
        settings.defaultProviderId === legacyProvider.id
          || settings.defaultProviderId === 'ollama-gemma4'
          || settings.defaultProviderId === 'ollama-hauhau-qwen35'
          ? migratedProvider.id
          : settings.defaultProviderId
    }
  };
}
