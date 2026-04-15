export type ProviderType = 'ollama' | 'openai_compatible' | 'ollama_bridge';

export type PageTranslationStatus =
  | 'idle'
  | 'running'
  | 'stopped'
  | 'completed'
  | 'observing'
  | 'error';

export type ContentScope = 'content_first' | 'max_coverage';

export type SiteKind =
  | 'generic'
  | 'x'
  | 'github'
  | 'fallback';

export type ContentKind =
  | 'article_body'
  | 'article_heading'
  | 'tweet_body'
  | 'quote_body'
  | 'sidebar_text'
  | 'comment_body'
  | 'fallback_block';

export type AnchorStrategy = 'afterend' | 'append';

export interface ProviderConfig {
  id: string;
  type: ProviderType;
  label: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
  enabled: boolean;
  timeoutMs: number;
}

export interface SiteOverrideConfig {
  enabled: boolean;
  observeDynamic?: boolean;
  contentScope?: ContentScope;
  restartOnRouteChange?: boolean;
  visibleOnlyFirstPass?: boolean;
}

export interface ExtensionSettings {
  defaultProviderId: string | null;
  maxSegmentLength: number;
  minSegmentLength: number;
  autoTranslateEnabled: boolean;
  observeDynamicContent: boolean;
  cacheEnabled: boolean;
  cacheTTLHours: number;
  maxConcurrentSegments: number;
  contentScope: ContentScope;
  siteOverrides: Record<string, SiteOverrideConfig>;
}

export interface SegmentDescriptor {
  id: string;
  text: string;
  textHash: string;
  sourceUrl: string;
  siteKind: SiteKind;
  contentKind: ContentKind;
  anchorStrategy: AnchorStrategy;
  contextHash: string;
  providerId?: string | null;
}

export interface TranslationSegment {
  id: string;
  text: string;
  sourceUrl: string;
  textHash?: string;
  contentKind?: ContentKind;
  siteKind?: SiteKind;
  contextHash?: string;
}

export interface TranslationResult {
  segmentId: string;
  translation?: string;
  error?: string;
  errorCode?: string;
  cacheHit?: boolean;
}

export interface TranslationCacheEntry {
  key: string;
  translation: string;
  providerId: string;
  model: string;
  createdAt: number;
  expiresAt: number;
}

export interface PageTranslationState {
  status: PageTranslationStatus;
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  detectedSegments: number;
  cacheHits: number;
  activeProviderId: string | null;
  adapterName: string | null;
  observing: boolean;
  sessionId: string | null;
  currentUrl: string | null;
  routeChanges: number;
  lastRouteChangeAt?: number;
  pageReady: boolean;
  lastErrorCode?: string;
  lastErrorMessage?: string;
}

export interface AppStorageShape {
  providers: ProviderConfig[];
  settings: ExtensionSettings;
  translationCache: TranslationCacheEntry[];
}
