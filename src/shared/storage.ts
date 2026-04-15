import {
  DEFAULT_CACHE,
  DEFAULT_SETTINGS,
  DEFAULT_STORAGE,
  MAX_CACHE_ENTRIES,
  STORAGE_KEYS
} from './constants';
import type {
  AppStorageShape,
  ExtensionSettings,
  ProviderConfig,
  TranslationCacheEntry
} from './types';

async function getLocal<T>(key: string, fallback: T): Promise<T> {
  const stored = await chrome.storage.local.get(key);
  return (stored[key] as T | undefined) ?? fallback;
}

async function setLocal<T>(key: string, value: T): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function getProviders(): Promise<ProviderConfig[]> {
  return getLocal(STORAGE_KEYS.providers, DEFAULT_STORAGE.providers);
}

export async function saveProviders(providers: ProviderConfig[]): Promise<void> {
  await setLocal(STORAGE_KEYS.providers, providers);
}

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await getLocal(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    siteOverrides: {
      ...DEFAULT_SETTINGS.siteOverrides,
      ...(stored.siteOverrides ?? {})
    }
  };
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await setLocal(STORAGE_KEYS.settings, settings);
}

export async function getTranslationCache(): Promise<TranslationCacheEntry[]> {
  const entries = await getLocal(STORAGE_KEYS.translationCache, DEFAULT_CACHE);
  const now = Date.now();
  return entries.filter((entry) => entry.expiresAt > now);
}

export async function saveTranslationCache(entries: TranslationCacheEntry[]): Promise<void> {
  const trimmed = [...entries]
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, MAX_CACHE_ENTRIES);
  await setLocal(STORAGE_KEYS.translationCache, trimmed);
}

export async function upsertTranslationCache(entry: TranslationCacheEntry): Promise<void> {
  const entries = await getTranslationCache();
  const nextEntries = [entry, ...entries.filter((item) => item.key !== entry.key)];
  await saveTranslationCache(nextEntries);
}

export async function clearTranslationCache(): Promise<void> {
  await setLocal(STORAGE_KEYS.translationCache, []);
}

export async function getStorageSnapshot(): Promise<AppStorageShape> {
  const [providers, settings, translationCache] = await Promise.all([
    getProviders(),
    getSettings(),
    getTranslationCache()
  ]);

  return {
    providers,
    settings,
    translationCache
  };
}
