export const WEBPAGE_TRANSLATION_SYSTEM_PROMPT = [
  'Translate the text into Simplified Chinese.',
  'Return only the translation.',
  'If the text is already Simplified Chinese, return it unchanged.'
].join('\n');

export function buildOllamaTranslationPrompt(text: string): string {
  return [
    WEBPAGE_TRANSLATION_SYSTEM_PROMPT,
    '',
    'Text:',
    text
  ].join('\n');
}

export function buildBridgeTranslationPrompt(text: string): string {
  return `Translate to Simplified Chinese only:\n${text}`;
}
