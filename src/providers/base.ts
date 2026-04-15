import type { ProviderConfig, TranslationResult, TranslationSegment } from '../shared/types';

export interface HealthCheckResult {
  ok: boolean;
  message?: string;
}

export interface TranslatorProvider {
  translateSegment(
    segment: TranslationSegment,
    config: ProviderConfig
  ): Promise<TranslationResult>;
  healthCheck(config: ProviderConfig): Promise<HealthCheckResult>;
}
