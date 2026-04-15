import type { ProviderConfig } from '../shared/types';
import type { TranslatorProvider } from './base';
import { OllamaBridgeProvider } from './ollamaBridge';
import { OllamaProvider } from './ollama';
import { OpenAICompatibleProvider } from './openaiCompatible';

const providers = {
  ollama_bridge: new OllamaBridgeProvider(),
  ollama: new OllamaProvider(),
  openai_compatible: new OpenAICompatibleProvider()
} satisfies Record<ProviderConfig['type'], TranslatorProvider>;

export function getProvider(type: ProviderConfig['type']): TranslatorProvider {
  return providers[type];
}
