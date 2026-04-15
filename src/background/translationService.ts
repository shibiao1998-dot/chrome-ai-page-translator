import { getProvider } from '../providers/registry';
import {
  clearTranslationCache,
  getProviders,
  getSettings,
  getTranslationCache,
  upsertTranslationCache
} from '../shared/storage';
import type {
  ProviderConfig,
  TranslationCacheEntry,
  TranslationResult,
  TranslationSegment
} from '../shared/types';

export async function translateSegmentWithActiveProvider(
  segment: TranslationSegment,
  providerId?: string | null
): Promise<TranslationResult> {
  const [providers, settings] = await Promise.all([getProviders(), getSettings()]);
  const activeProvider = resolveProvider(providers, providerId ?? settings.defaultProviderId);

  if (!activeProvider) {
    return {
      segmentId: segment.id,
      error: 'No active provider configured',
      errorCode: 'NO_PROVIDER'
    };
  }

  const cacheKey = buildCacheKey(segment, activeProvider);
  if (settings.cacheEnabled) {
    const cacheHit = await findCacheEntry(cacheKey);
    if (cacheHit) {
      return {
        segmentId: segment.id,
        translation: cacheHit.translation,
        cacheHit: true
      };
    }
  }

  try {
    const provider = getProvider(activeProvider.type);
    const result = await provider.translateSegment(segment, activeProvider);

    if (settings.cacheEnabled && result.translation && result.translation.trim()) {
      await upsertTranslationCache({
        key: cacheKey,
        translation: result.translation,
        providerId: activeProvider.id,
        model: activeProvider.model,
        createdAt: Date.now(),
        expiresAt: Date.now() + settings.cacheTTLHours * 60 * 60 * 1000
      });
    }

    return result;
  } catch (error) {
    const normalized = normalizeProviderError(error);
    return {
      segmentId: segment.id,
      error: normalized.message,
      errorCode: normalized.code
    };
  }
}

export async function healthCheckActiveProvider(providerId?: string | null): Promise<{
  ok: boolean;
  message?: string;
}> {
  const [providers, settings] = await Promise.all([getProviders(), getSettings()]);
  const activeProvider = resolveProvider(providers, providerId ?? settings.defaultProviderId);

  if (!activeProvider) {
    return {
      ok: false,
      message: 'No active provider configured'
    };
  }

  try {
    const provider = getProvider(activeProvider.type);
    return await provider.healthCheck(activeProvider);
  } catch (error) {
    const normalized = normalizeProviderError(error);
    return {
      ok: false,
      message: normalized.message
    };
  }
}

export async function clearCacheStorage(): Promise<void> {
  await clearTranslationCache();
}

function resolveProvider(
  providers: ProviderConfig[],
  providerId?: string | null
): ProviderConfig | undefined {
  if (providerId) {
    const matched = providers.find((provider) => provider.id === providerId && provider.enabled);
    if (matched) {
      return matched;
    }
  }

  return providers.find((provider) => provider.enabled);
}

function buildCacheKey(segment: TranslationSegment, provider: ProviderConfig): string {
  return [
    provider.id,
    provider.model,
    segment.textHash ?? '',
    segment.contextHash ?? '',
    segment.text.trim()
  ].join('::');
}

async function findCacheEntry(key: string): Promise<TranslationCacheEntry | undefined> {
  const entries = await getTranslationCache();
  return entries.find((entry) => entry.key === key);
}

function normalizeProviderError(error: unknown): { code: string; message: string } {
  if (error instanceof Error) {
    if (/403/.test(error.message)) {
      return {
        code: 'FORBIDDEN_ORIGIN',
        message: 'Ollama forbids current origin; restart with OLLAMA_ORIGINS=*'
      };
    }

    if (/401/.test(error.message)) {
      return {
        code: 'AUTH_ERROR',
        message: 'Authentication failed'
      };
    }

    if (/404/.test(error.message)) {
      return {
        code: 'MODEL_NOT_FOUND',
        message: 'Model or endpoint not found'
      };
    }

    if (/empty translation/i.test(error.message)) {
      return {
        code: 'EMPTY_TRANSLATION',
        message: 'Model returned empty translation'
      };
    }

    if (/timeout/i.test(error.message)) {
      return {
        code: 'TIMEOUT',
        message: 'Request timed out'
      };
    }

    if (/fetch failed|Failed to fetch/i.test(error.message)) {
      return {
        code: 'NETWORK_ERROR',
        message: 'Network error or CORS blocked'
      };
    }

    return {
      code: 'UNKNOWN_PROVIDER_ERROR',
      message: error.message
    };
  }

  return {
    code: 'UNKNOWN_PROVIDER_ERROR',
    message: 'Unknown translation error'
  };
}
