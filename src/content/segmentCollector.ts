import type { ExtensionSettings, TranslationSegment } from '../shared/types';

const CANDIDATE_SELECTOR = [
  'article p',
  'main p',
  'article li',
  'main li',
  'article blockquote',
  'main blockquote',
  'article h1',
  'article h2',
  'article h3',
  'main h1',
  'main h2',
  'main h3',
  'body p',
  'body li',
  'body blockquote'
].join(',');

export interface CollectedSegment {
  segment: TranslationSegment;
  anchor: HTMLElement;
}

export class SegmentCollector {
  collect(settings: ExtensionSettings): CollectedSegment[] {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(CANDIDATE_SELECTOR));
    const collected: CollectedSegment[] = [];
    let counter = 0;

    for (const node of nodes) {
      if (!isEligibleNode(node, settings.minSegmentLength)) {
        continue;
      }

      const text = normalizeText(node.innerText || node.textContent || '');
      const parts = splitLongText(text, settings.maxSegmentLength);

      for (const part of parts) {
        if (part.length < settings.minSegmentLength) {
          continue;
        }

        counter += 1;
        collected.push({
          anchor: node,
          segment: {
            id: `seg-${counter}`,
            text: part,
            sourceUrl: window.location.href
          }
        });
      }
    }

    return collected;
  }
}

function isEligibleNode(node: HTMLElement, minLength: number): boolean {
  if (!node.isConnected) {
    return false;
  }

  if (node.closest('[data-ai-page-translator-root="true"]')) {
    return false;
  }

  if (node.closest('nav, aside, footer, header, form, button, input, textarea, select, code, pre')) {
    return false;
  }

  const style = window.getComputedStyle(node);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }

  const text = normalizeText(node.innerText || node.textContent || '');
  if (text.length < minLength) {
    return false;
  }

  if (/^[\d\s\p{P}]+$/u.test(text)) {
    return false;
  }

  return true;
}

function normalizeText(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

function splitLongText(text: string, maxSegmentLength: number): string[] {
  if (text.length <= maxSegmentLength) {
    return [text];
  }

  const chunks: string[] = [];
  let current = '';
  const sentences = text.split(/(?<=[。！？.!?；;])/u);

  for (const sentence of sentences) {
    const part = sentence.trim();
    if (!part) {
      continue;
    }

    if (part.length > maxSegmentLength) {
      if (current) {
        chunks.push(current);
        current = '';
      }

      chunks.push(...splitOversizedPart(part, maxSegmentLength));
      continue;
    }

    if (!current) {
      current = part;
      continue;
    }

    if (`${current} ${part}`.length > maxSegmentLength) {
      chunks.push(current);
      current = part;
      continue;
    }

    current = `${current} ${part}`;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function splitOversizedPart(text: string, maxSegmentLength: number): string[] {
  const chunks: string[] = [];
  let remaining = text.trim();

  while (remaining.length > maxSegmentLength) {
    let splitAt = remaining.lastIndexOf(' ', maxSegmentLength);
    if (splitAt <= 0 || splitAt < Math.floor(maxSegmentLength * 0.6)) {
      splitAt = maxSegmentLength;
    }

    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}
