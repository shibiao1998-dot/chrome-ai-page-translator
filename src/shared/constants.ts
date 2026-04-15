import type {
  AppStorageShape,
  ExtensionSettings,
  PageTranslationState,
  TranslationCacheEntry
} from './types';

export const STORAGE_KEYS = {
  providers: 'providers',
  settings: 'settings',
  translationCache: 'translationCache'
} as const;

export const MESSAGE_ACTIONS = {
  ping: 'PING',
  getProviders: 'GET_PROVIDERS',
  saveProviders: 'SAVE_PROVIDERS',
  getSettings: 'GET_SETTINGS',
  saveSettings: 'SAVE_SETTINGS',
  getBootstrapData: 'GET_BOOTSTRAP_DATA',
  getStatus: 'GET_STATUS',
  translateSegment: 'TRANSLATE_SEGMENT',
  healthCheckProvider: 'HEALTH_CHECK_PROVIDER',
  clearCache: 'CLEAR_CACHE',
  getSiteStatus: 'GET_SITE_STATUS',
  getActiveAdapter: 'GET_ACTIVE_ADAPTER'
} as const;

export const CONTENT_MESSAGE_ACTIONS = {
  startTranslation: 'CONTENT_START_TRANSLATION',
  stopTranslation: 'CONTENT_STOP_TRANSLATION',
  clearTranslation: 'CONTENT_CLEAR_TRANSLATION',
  getState: 'CONTENT_GET_STATE',
  rescanTranslation: 'CONTENT_RESCAN_TRANSLATION',
  restartTranslation: 'CONTENT_RESTART_TRANSLATION'
} as const;

export const DEFAULT_SETTINGS: ExtensionSettings = {
  defaultProviderId: null,
  maxSegmentLength: 1200,
  minSegmentLength: 12,
  autoTranslateEnabled: true,
  observeDynamicContent: true,
  cacheEnabled: true,
  cacheTTLHours: 72,
  maxConcurrentSegments: 3,
  contentScope: 'content_first',
  siteOverrides: {}
};

export const DEFAULT_PAGE_TRANSLATION_STATE: PageTranslationState = {
  status: 'idle',
  total: 0,
  completed: 0,
  failed: 0,
  skipped: 0,
  detectedSegments: 0,
  cacheHits: 0,
  activeProviderId: null,
  adapterName: null,
  observing: false,
  sessionId: null,
  currentUrl: null,
  routeChanges: 0,
  pageReady: false
};

export const DEFAULT_CACHE: TranslationCacheEntry[] = [];

export const DEFAULT_STORAGE: AppStorageShape = {
  providers: [],
  settings: DEFAULT_SETTINGS,
  translationCache: DEFAULT_CACHE
};

export const DEFAULT_OLLAMA_TIMEOUT_MS = 180000;
export const MAX_CACHE_ENTRIES = 500;
export const AUTO_START_DELAY_MS = 1000;
export const OBSERVER_BATCH_DELAY_MS = 800;
