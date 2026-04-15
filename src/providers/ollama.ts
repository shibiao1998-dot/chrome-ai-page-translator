import type { TranslatorProvider } from './base';
import type { ProviderConfig, TranslationResult, TranslationSegment } from '../shared/types';
import { buildOllamaTranslationPrompt } from '../shared/prompts';

export class OllamaProvider implements TranslatorProvider {
  async translateSegment(
    segment: TranslationSegment,
    config: ProviderConfig
  ): Promise<TranslationResult> {
    const primary = await this.generate(config, buildOllamaTranslationPrompt(segment.text), {
      temperature: 0.2,
      top_p: 0.9,
      num_ctx: 4096,
      num_predict: 1024,
      think: false
    });

    let translation = primary.response?.trim() || '';

    if (!translation) {
      const fallback = await this.generate(
        config,
        `Translate to Simplified Chinese only:\n${segment.text}`,
        {
          temperature: 0,
          top_p: 0.8,
          num_ctx: 4096,
          num_predict: 1024,
          think: false
        }
      );

      translation = fallback.response?.trim() || '';
    }

    if (!translation) {
      throw new Error('Model returned empty translation');
    }

    return {
      segmentId: segment.id,
      translation
    };
  }

  private async generate(
    config: ProviderConfig,
    prompt: string,
    options: {
      temperature: number;
      top_p: number;
      num_ctx: number;
      num_predict: number;
      think: boolean;
    }
  ): Promise<{ response?: string }> {
    const response = await fetch(`${config.baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.model,
        stream: false,
        prompt,
        think: options.think,
        options: {
          temperature: options.temperature,
          top_p: options.top_p,
          num_ctx: options.num_ctx,
          num_predict: options.num_predict
        }
      }),
      signal: AbortSignal.timeout(config.timeoutMs)
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status}`);
    }

    return (await response.json()) as { response?: string };
  }

  async healthCheck(config: ProviderConfig): Promise<{ ok: boolean; message?: string }> {
    try {
      const response = await fetch(`${config.baseUrl}/api/tags`, {
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
