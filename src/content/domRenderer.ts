const ROOT_ATTR = 'data-ai-page-translator-root';
const SEGMENT_ATTR = 'data-ai-page-translator-segment-id';

export class DomRenderer {
  renderLoading(anchor: HTMLElement, segmentId: string): void {
    const node = this.ensureContainer(anchor, segmentId);
    node.textContent = '正在翻译...';
    node.style.borderLeftColor = '#d97706';
    node.style.color = '#7c2d12';
  }

  renderSuccess(anchor: HTMLElement, segmentId: string, translation: string): void {
    const node = this.ensureContainer(anchor, segmentId);
    node.textContent = translation;
    node.style.borderLeftColor = '#2563eb';
    node.style.color = '#1e3a8a';
  }

  renderError(anchor: HTMLElement, segmentId: string, error: string): void {
    const node = this.ensureContainer(anchor, segmentId);
    node.textContent = `翻译失败：${error}`;
    node.style.borderLeftColor = '#dc2626';
    node.style.color = '#7f1d1d';
  }

  clear(): void {
    for (const node of Array.from(document.querySelectorAll<HTMLElement>(`[${ROOT_ATTR}="true"]`))) {
      node.remove();
    }
  }

  private ensureContainer(anchor: HTMLElement, segmentId: string): HTMLDivElement {
    const existing = document.querySelector<HTMLDivElement>(`[${SEGMENT_ATTR}="${segmentId}"]`);
    if (existing) {
      return existing;
    }

    const container = document.createElement('div');
    container.setAttribute(ROOT_ATTR, 'true');
    container.setAttribute(SEGMENT_ATTR, segmentId);
    container.style.marginTop = '8px';
    container.style.padding = '10px 12px';
    container.style.borderLeft = '3px solid #2563eb';
    container.style.background = '#f8fafc';
    container.style.fontSize = '0.95em';
    container.style.lineHeight = '1.6';
    anchor.insertAdjacentElement('afterend', container);
    return container;
  }
}
