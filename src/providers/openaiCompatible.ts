import type { TranslatorProvider } from './base';
import type { ProviderConfig, TranslationResult, TranslationSegment } from '../shared/types';
import { WEBPAGE_TRANSLATION_SYSTEM_PROMPT } from '../shared/prompts';

export class OpenAICompatibleProvider implements TranslatorProvider {
  async translateSegment(
    segment: TranslationSegment,
    config: ProviderConfig
  ): Promise<TranslationResult> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (config.apiKey) {
      headers.Authorization = `Bearer ${config.apiKey}`;
    }

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: WEBPAGE_TRANSLATION_SYSTEM_PROMPT
          },
          {
            role: 'user',
            content: segment.text
          }
        ]
      }),
      signal: AbortSignal.timeout(config.timeoutMs)
    });

    if (!response.ok) {
      throw new Error(`OpenAI-compatible request failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };

    const translation = data.choices?.[0]?.message?.content?.trim() || '';
    if (!translation) {
      throw new Error('Model returned empty translation');
    }

    return {
      segmentId: segment.id,
      translation
    };
  }

  async healthCheck(config: ProviderConfig): Promise<{ ok: boolean; message?: string }> {
    try {
      const headers: Record<string, string> = {};
      if (config.apiKey) {
        headers.Authorization = `Bearer ${config.apiKey}`;
      }

      const response = await fetch(`${config.baseUrl}/models`, {
        headers,
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
