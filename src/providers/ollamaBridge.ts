import type { TranslatorProvider } from './base';
import type { ProviderConfig, TranslationResult, TranslationSegment } from '../shared/types';

export class OllamaBridgeProvider implements TranslatorProvider {
  async translateSegment(
    segment: TranslationSegment,
    config: ProviderConfig
  ): Promise<TranslationResult> {
    const response = await fetch(`${config.baseUrl}/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: segment.text,
        model: config.model
      }),
      signal: AbortSignal.timeout(config.timeoutMs)
    });

    if (!response.ok) {
      throw new Error(`Bridge request failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      translation?: string;
    };

    const translation = data.translation?.trim() || '';
    if (!translation) {
      throw new Error('Bridge returned empty translation');
    }

    return {
      segmentId: segment.id,
      translation
    };
  }

  async healthCheck(config: ProviderConfig): Promise<{ ok: boolean; message?: string }> {
    try {
      const response = await fetch(`${config.baseUrl}/health`, {
        signal: AbortSignal.timeout(config.timeoutMs)
      });

      return {
        ok: response.ok,
        message: response.ok ? 'ok' : `HTTP ${response.status}`
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'health check failed'
      };
    }
  }
}
