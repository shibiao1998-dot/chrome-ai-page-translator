import { DEFAULT_PAGE_TRANSLATION_STATE } from '../shared/constants';
import type {
  ExtensionSettings,
  PageTranslationState,
  TranslationResult
} from '../shared/types';
import { translateSegment } from '../shared/messages';
import { DomRenderer } from './domRenderer';
import { SegmentCollector, type CollectedSegment } from './segmentCollector';

export class PageTranslationManager {
  private readonly collector = new SegmentCollector();
  private readonly renderer = new DomRenderer();
  private readonly state: PageTranslationState = { ...DEFAULT_PAGE_TRANSLATION_STATE };
  private running = false;
  private segments: CollectedSegment[] = [];

  async start(settings: ExtensionSettings): Promise<PageTranslationState> {
    if (this.running) {
      return this.getState();
    }

    this.running = true;
    this.segments = this.collector.collect(settings);
    this.state.status = 'running';
    this.state.total = this.segments.length;
    this.state.completed = 0;
    this.state.failed = 0;
    this.state.activeProviderId = null;

    if (this.segments.length === 0) {
      this.running = false;
      this.state.status = 'completed';
      return this.getState();
    }

    for (const item of this.segments) {
      if (!this.running) {
        this.state.status = 'stopped';
        return this.getState();
      }

      this.renderer.renderLoading(item.anchor, item.segment.id);

      try {
        const response = await translateSegment(item.segment);
        if (response.result.error) {
          this.renderer.renderError(item.anchor, item.segment.id, response.result.error);
          this.state.failed += 1;
          continue;
        }

        this.renderer.renderSuccess(item.anchor, item.segment.id, response.result.translation ?? '');
        this.state.completed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        this.renderer.renderError(item.anchor, item.segment.id, message);
        this.state.failed += 1;
      }
    }

    this.running = false;
    this.state.status = 'completed';
    return this.getState();
  }

  stop(): PageTranslationState {
    this.running = false;
    this.state.status = 'stopped';
    return this.getState();
  }

  clear(): PageTranslationState {
    this.running = false;
    this.segments = [];
    this.renderer.clear();
    Object.assign(this.state, DEFAULT_PAGE_TRANSLATION_STATE);
    return this.getState();
  }

  getState(): PageTranslationState {
    return { ...this.state };
  }
}
