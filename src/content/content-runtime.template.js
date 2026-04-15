(function () {
  const AUTO_START_DELAY_MS = 1000;
  const OBSERVER_BATCH_DELAY_MS = 800;
  const CONTENT_MESSAGE_ACTIONS = {
    startTranslation: 'CONTENT_START_TRANSLATION',
    stopTranslation: 'CONTENT_STOP_TRANSLATION',
    clearTranslation: 'CONTENT_CLEAR_TRANSLATION',
    getState: 'CONTENT_GET_STATE',
    rescanTranslation: 'CONTENT_RESCAN_TRANSLATION',
    restartTranslation: 'CONTENT_RESTART_TRANSLATION'
  };

  const ROOT_ATTR = 'data-ai-page-translator-root';
  const SEGMENT_ATTR = 'data-ai-page-translator-segment-id';
  const PROCESSED_ATTR = 'data-ai-page-translator-processed';
  const CONTEXT_ATTR = 'data-ai-page-translator-context-hash';

  const DEFAULT_STATE = {
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
    currentUrl: window.location.href,
    routeChanges: 0,
    pageReady: false,
    lastErrorCode: undefined,
    lastErrorMessage: undefined
  };

  const SESSION_STORAGE_KEY = 'ai-page-translator-session';

  window.__AI_TRANSLATOR_READY__ = false;
  window.__AI_TRANSLATOR_INIT_ERROR__ = undefined;

  function createErrorResponse(error, state) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown content runtime error',
      state: state || null
    };
  }

  function createSessionId() {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function loadPersistedSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function savePersistedSession(session) {
    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // ignore storage failures
    }
  }

  function clearPersistedSession() {
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // ignore storage failures
    }
  }

  function normalizeText(input) {
    return (input || '').replace(/\s+/g, ' ').trim();
  }

  function hashString(input) {
    let hash = 0;
    for (let index = 0; index < input.length; index += 1) {
      hash = (hash << 5) - hash + input.charCodeAt(index);
      hash |= 0;
    }
    return String(Math.abs(hash));
  }

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function isInViewport(node) {
    if (!(node instanceof HTMLElement)) {
      return false;
    }
    const rect = node.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight * 1.5;
  }

  async function waitForSelector(selectors, timeoutMs) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (selectors.some((selector) => document.querySelector(selector))) {
        return true;
      }
      await delay(120);
    }
    return false;
  }

  function observeMutations(selector, callback) {
    let timer = null;
    const observer = new MutationObserver((records) => {
      const hasRelevantNode = records.some((record) =>
        Array.from(record.addedNodes).some(
          (node) => node instanceof HTMLElement && (node.matches(selector) || !!node.querySelector(selector))
        )
      );

      if (!hasRelevantNode) {
        return;
      }

      if (timer !== null) {
        window.clearTimeout(timer);
      }

      timer = window.setTimeout(() => {
        timer = null;
        void callback();
      }, OBSERVER_BATCH_DELAY_MS);
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return observer;
  }

  async function getBootstrapData() {
    return chrome.runtime.sendMessage({ type: 'GET_BOOTSTRAP_DATA' });
  }

  async function resolveActiveProviderId(settings) {
    if (settings && settings.defaultProviderId) {
      return settings.defaultProviderId;
    }

    const bootstrap = await getBootstrapData();
    if (bootstrap.settings && bootstrap.settings.defaultProviderId) {
      return bootstrap.settings.defaultProviderId;
    }

    const providers = Array.isArray(bootstrap.providers) ? bootstrap.providers : [];
    const active = providers.find((provider) => provider && provider.enabled);
    return active ? active.id : null;
  }

  function resolveSiteOverride(settings, hostname) {
    return settings.siteOverrides?.[hostname] || {
      enabled: true,
      observeDynamic: true,
      restartOnRouteChange: true,
      visibleOnlyFirstPass: true
    };
  }

  class DomRenderer {
    renderLoading(anchor, segmentId, strategy) {
      const node = this.ensureContainer(anchor, segmentId, strategy);
      node.textContent = '正在翻译...';
      node.style.borderLeftColor = '#d97706';
      node.style.color = '#7c2d12';
    }

    renderSuccess(anchor, segmentId, translation, strategy) {
      const node = this.ensureContainer(anchor, segmentId, strategy);
      node.textContent = translation;
      node.style.borderLeftColor = '#2563eb';
      node.style.color = '#1e3a8a';
    }

    renderError(anchor, segmentId, error, strategy) {
      const node = this.ensureContainer(anchor, segmentId, strategy);
      node.textContent = `翻译失败：${error}`;
      node.style.borderLeftColor = '#dc2626';
      node.style.color = '#7f1d1d';
    }

    clear() {
      for (const node of Array.from(document.querySelectorAll(`[${ROOT_ATTR}="true"]`))) {
        node.remove();
      }
      for (const node of Array.from(document.querySelectorAll(`[${PROCESSED_ATTR}]`))) {
        node.removeAttribute(PROCESSED_ATTR);
        node.removeAttribute(CONTEXT_ATTR);
      }
    }

    ensureContainer(anchor, segmentId, strategy) {
      const existing = document.querySelector(`[${SEGMENT_ATTR}="${segmentId}"]`);
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
      container.style.borderRadius = '6px';
      container.style.wordBreak = 'break-word';
      container.style.whiteSpace = 'pre-wrap';
      container.style.display = 'block';
      container.style.direction = 'ltr';
      container.style.unicodeBidi = 'isolate';
      container.style.writingMode = 'horizontal-tb';
      container.style.textOrientation = 'mixed';
      container.style.transform = 'none';
      container.style.textAlign = 'left';
      container.style.overflowWrap = 'anywhere';

      if (strategy === 'append') {
        anchor.appendChild(container);
      } else {
        anchor.insertAdjacentElement('afterend', container);
      }

      return container;
    }
  }

  function findMainContentRoot() {
    return document.querySelector('main') || document.querySelector('article') || document.body;
  }

  function isEligibleNode(node, minLength) {
    if (!(node instanceof HTMLElement) || !node.isConnected) {
      return false;
    }
    if (node.closest(`[${ROOT_ATTR}="true"]`)) {
      return false;
    }
    if (node.getAttribute(PROCESSED_ATTR) === 'done') {
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

    const linkDensity = node.querySelectorAll('a').length / Math.max(1, text.length / 40);
    if (linkDensity > 2 && !node.matches('div[lang], p, li, blockquote')) {
      return false;
    }
    return true;
  }

  function splitLongText(text, maxSegmentLength) {
    if (text.length <= maxSegmentLength) {
      return [text];
    }

    const chunks = [];
    let current = '';
    const sentences = text.split(/(?<=[。！？.!?；;])/u);
    for (const sentence of sentences) {
      const part = sentence.trim();
      if (!part) {
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

  function findNearbyContext(node) {
    const article = node.closest('article');
    if (article) {
      return normalizeText(article.innerText || '').slice(0, 120);
    }
    return normalizeText(node.parentElement ? node.parentElement.innerText || '' : '').slice(0, 120);
  }

  function buildSegmentsFromBlocks(blocks, settings, siteKind, contentKind, anchorStrategy) {
    const collected = [];
    let counter = 0;

    for (const block of blocks) {
      if (!isEligibleNode(block, settings.minSegmentLength)) {
        continue;
      }

      const text = normalizeText(block.innerText || block.textContent || '');
      if (!text) {
        continue;
      }

      const parts = splitLongText(text, settings.maxSegmentLength);
      const contextHash = hashString(`${siteKind}:${block.tagName}:${findNearbyContext(block)}`);

      for (const part of parts) {
        if (part.length < settings.minSegmentLength) {
          continue;
        }

        counter += 1;
        collected.push({
          anchor: block,
          segment: {
            id: `${siteKind}-seg-${counter}-${hashString(part).slice(0, 8)}`,
            text: part,
            textHash: hashString(part),
            sourceUrl: window.location.href,
            siteKind,
            contentKind,
            anchorStrategy,
            contextHash
          }
        });
      }
    }

    return collected;
  }

  class GenericContentAdapter {
    constructor() {
      this.name = 'generic-content';
      this.siteKind = 'generic';
    }

    match() {
      return true;
    }

    async waitForReady() {
      return true;
    }

    collectSegments(settings) {
      const root = findMainContentRoot();
      const blocks = Array.from(root.querySelectorAll('article, section, p, li, blockquote, h1, h2, h3, h4, div[lang]')).slice(0, 24);
      return buildSegmentsFromBlocks(blocks, settings, this.siteKind, 'article_body', 'afterend');
    }
  }

  class FallbackBlockAdapter {
    constructor() {
      this.name = 'fallback-block';
      this.siteKind = 'fallback';
    }

    match() {
      return true;
    }

    collectSegments(settings) {
      const blocks = Array.from(document.querySelectorAll('main, article, section, div')).slice(0, 12);
      return buildSegmentsFromBlocks(blocks, settings, this.siteKind, 'fallback_block', 'afterend');
    }
  }

  class XAdapter {
    constructor() {
      this.name = 'x-feed';
      this.siteKind = 'x';
    }

    match(location) {
      return /(^|\.)x\.com$|(^|\.)twitter\.com$/.test(location.hostname);
    }

    async waitForReady() {
      return waitForSelector(['article[role="article"]', '[data-testid="primaryColumn"]', '[data-testid="primaryColumn"] [data-testid="tweetText"]'], 5000);
    }

    collectSegments(settings) {
      const blocks = [];
      const visibleOnly = resolveSiteOverride(settings, window.location.hostname).visibleOnlyFirstPass !== false;
      const tweets = Array.from(document.querySelectorAll('article[role="article"]'))
        .filter((tweet) => !visibleOnly || isInViewport(tweet))
        .slice(0, 6);

      for (const tweet of tweets) {
        const textBlocks = Array.from(tweet.querySelectorAll('[data-testid="tweetText"], div[lang], div[lang][dir="auto"]'));
        for (const block of textBlocks) {
          if (!(block instanceof HTMLElement)) {
            continue;
          }
          blocks.push(block);
          if (blocks.length >= 6) {
            return buildSegmentsFromBlocks(blocks, settings, this.siteKind, 'tweet_body', 'afterend');
          }
        }
      }

      if (blocks.length === 0) {
        const fallbackBlocks = Array.from(document.querySelectorAll('[data-testid="primaryColumn"] [data-testid="tweetText"], [data-testid="primaryColumn"] div[lang]'));
        for (const block of fallbackBlocks) {
          if (!(block instanceof HTMLElement)) {
            continue;
          }
          if (visibleOnly && !isInViewport(block)) {
            continue;
          }
          blocks.push(block);
          if (blocks.length >= 6) {
            break;
          }
        }
      }

      return buildSegmentsFromBlocks(blocks, settings, this.siteKind, 'tweet_body', 'afterend');
    }

    observe(callback) {
      return observeMutations('article[role="article"]', callback);
    }

    shouldResetOnRouteChange(prevUrl, nextUrl) {
      return prevUrl !== nextUrl;
    }
  }

  class GitHubTextAdapter {
    constructor() {
      this.name = 'github-text';
      this.siteKind = 'github';
    }

    match(location) {
      return location.hostname === 'github.com';
    }

    async waitForReady() {
      return waitForSelector(['.markdown-body', '.comment-body', '.js-comment-body'], 5000);
    }

    collectSegments(settings) {
      const blocks = Array.from(document.querySelectorAll('.markdown-body p, .markdown-body li, .js-comment-body p, .js-comment-body li, .comment-body p, .comment-body li')).slice(0, 20);
      return buildSegmentsFromBlocks(blocks, settings, this.siteKind, 'comment_body', 'afterend');
    }

    shouldResetOnRouteChange(prevUrl, nextUrl) {
      return prevUrl !== nextUrl;
    }
  }

  class AdapterRegistry {
    constructor() {
      this.adapters = [new XAdapter(), new GitHubTextAdapter(), new GenericContentAdapter(), new FallbackBlockAdapter()];
    }

    resolve() {
      return this.adapters.find((adapter) => adapter.match(window.location, document)) || this.adapters[this.adapters.length - 1];
    }
  }

  class RouteWatcher {
    constructor(onRouteChange) {
      this.onRouteChange = onRouteChange;
      this.currentUrl = window.location.href;
      this.intervalId = null;
      this.handlePopState = () => this.checkUrl();
    }

    start() {
      this.patchHistory();
      window.addEventListener('popstate', this.handlePopState);
      this.intervalId = window.setInterval(() => this.checkUrl(), 1000);
    }

    patchHistory() {
      const pushState = history.pushState.bind(history);
      const replaceState = history.replaceState.bind(history);
      history.pushState = (...args) => {
        const result = pushState(...args);
        this.checkUrl();
        return result;
      };
      history.replaceState = (...args) => {
        const result = replaceState(...args);
        this.checkUrl();
        return result;
      };
    }

    checkUrl() {
      const nextUrl = window.location.href;
      if (nextUrl === this.currentUrl) {
        return;
      }
      const prevUrl = this.currentUrl;
      this.currentUrl = nextUrl;
      this.onRouteChange(nextUrl, prevUrl);
    }
  }

  class PageTranslationManager {
    constructor() {
      this.renderer = new DomRenderer();
      this.registry = new AdapterRegistry();
      this.routeWatcher = new RouteWatcher((nextUrl, prevUrl) => {
        void this.handleRouteChange(nextUrl, prevUrl);
      });
      this.state = { ...DEFAULT_STATE };
      this.running = false;
      this.seenKeys = new Set();
      this.renderedAnchors = new Map();
      this.pendingQueue = [];
      this.observer = null;
      this.settings = null;
      this.adapter = null;
      this.recovering = false;
      this.routeWatcher.start();
    }

    async autoStart() {
      const persisted = loadPersistedSession();
      if (persisted && persisted.url === window.location.href && persisted.shouldResume === true) {
        this.recovering = true;
      }

      const bootstrap = await getBootstrapData();
      this.settings = bootstrap.settings;

      if (!this.settings.autoTranslateEnabled) {
        return this.getState();
      }

      await delay(AUTO_START_DELAY_MS);
      return this.startNewSession(this.recovering ? 'recover' : 'auto');
    }

    async startNewSession(reason) {
      const bootstrap = await getBootstrapData();
      this.settings = bootstrap.settings;
      this.adapter = this.registry.resolve();
      this.running = true;
      this.resetSessionState(false);
      this.state.sessionId = createSessionId();
      this.state.currentUrl = window.location.href;
      this.state.adapterName = this.adapter.name;
      this.state.activeProviderId = await resolveActiveProviderId(this.settings);
      this.state.status = 'running';
      this.recovering = false;
      savePersistedSession({
        url: window.location.href,
        shouldResume: true,
        reason: reason || 'manual',
        startedAt: Date.now()
      });

      if (!this.state.activeProviderId) {
        this.state.status = 'error';
        this.state.lastErrorCode = 'NO_PROVIDER';
        this.state.lastErrorMessage = 'No active provider configured';
        return this.getState();
      }

      const ready = this.adapter.waitForReady ? await this.adapter.waitForReady() : true;
      this.state.pageReady = ready;
      if (!ready) {
        this.state.status = 'error';
        this.state.lastErrorCode = 'PAGE_NOT_READY';
        this.state.lastErrorMessage = 'Page content did not become ready in time';
        return this.getState();
      }

      await this.collectAndFlush();
      if (this.adapter && this.adapter.siteKind === 'x' && this.state.detectedSegments === 0) {
        await delay(1200);
        await this.collectAndFlush();
      }
      if (this.state.detectedSegments === 0 && this.state.failed === 0) {
        this.state.status = 'error';
        this.state.lastErrorCode = 'NO_SEGMENTS_FOUND';
        this.state.lastErrorMessage = 'No translatable content found on this page';
        savePersistedSession({
          url: window.location.href,
          shouldResume: false,
          reason: 'no_segments',
          startedAt: Date.now()
        });
        return this.getState();
      }

      this.enableObserverIfNeeded();
      this.state.status = this.state.observing ? 'observing' : this.state.failed > 0 ? 'error' : 'completed';
      savePersistedSession({
        url: window.location.href,
        shouldResume: this.state.observing,
        reason: this.state.status,
        startedAt: Date.now()
      });
      return this.getState();
    }

    async rescan() {
      if (!this.running || !this.adapter || !this.settings) {
        return this.startNewSession('rescan-restart');
      }

      await this.collectAndFlush();
      if (this.state.observing) {
        this.state.status = 'observing';
      }
      return this.getState();
    }

    stop() {
      this.running = false;
      this.disconnectObserver();
      this.state.observing = false;
      this.state.status = 'stopped';
      savePersistedSession({
        url: window.location.href,
        shouldResume: false,
        reason: 'stopped',
        startedAt: Date.now()
      });
      return this.getState();
    }

    clear() {
      this.running = false;
      this.resetSessionState(true);
      this.state.status = 'idle';
      clearPersistedSession();
      return this.getState();
    }

    getState() {
      return { ...this.state };
    }

    async handleRouteChange(nextUrl, prevUrl) {
      const adapter = this.adapter || this.registry.resolve();
      const restartEnabled = this.resolveRestartOnRouteChange();
      const shouldReset = adapter.shouldResetOnRouteChange ? adapter.shouldResetOnRouteChange(prevUrl, nextUrl) : prevUrl !== nextUrl;
      this.state.currentUrl = nextUrl;
      this.state.routeChanges += 1;
      this.state.lastRouteChangeAt = Date.now();

      if (!restartEnabled || !shouldReset) {
        return;
      }

      this.running = false;
      this.state.lastErrorCode = 'PAGE_SESSION_RESET';
      this.state.lastErrorMessage = 'Route changed; restarting page translation session';
      this.resetSessionState(true);

      if (this.settings && this.settings.autoTranslateEnabled) {
        await delay(AUTO_START_DELAY_MS);
        await this.startNewSession('route-change');
      }
    }

    resolveRestartOnRouteChange() {
      if (!this.settings) {
        return true;
      }
      return resolveSiteOverride(this.settings, window.location.hostname).restartOnRouteChange !== false;
    }

    resetSessionState(clearDom) {
      this.disconnectObserver();
      if (clearDom) {
        this.renderer.clear();
      }
      this.pendingQueue = [];
      this.seenKeys.clear();
      this.renderedAnchors.clear();
      this.state = {
        ...DEFAULT_STATE,
        sessionId: clearDom ? null : this.state.sessionId,
        currentUrl: window.location.href,
        routeChanges: this.state.routeChanges,
        lastRouteChangeAt: this.state.lastRouteChangeAt,
        pageReady: false,
        adapterName: this.adapter ? this.adapter.name : null
      };
    }

    async collectAndFlush() {
      if (!this.adapter || !this.settings || !this.state.sessionId) {
        return;
      }
      await this.enqueueCollected(this.adapter.collectSegments(this.settings, this.state.sessionId));
      await this.flushQueue();
    }

    async enqueueCollected(collected) {
      this.state.detectedSegments += collected.length;
      for (const item of collected) {
        const uniqueKey = `${item.segment.textHash}::${item.segment.contextHash}`;
        if (this.seenKeys.has(uniqueKey)) {
          this.state.skipped += 1;
          continue;
        }
        const renderedKey = this.renderedAnchors.get(item.anchor);
        if (renderedKey === uniqueKey) {
          this.state.skipped += 1;
          continue;
        }
        this.seenKeys.add(uniqueKey);
        this.pendingQueue.push(item);
      }
      this.state.total = this.pendingQueue.length + this.state.completed + this.state.failed;
    }

    async flushQueue() {
      const concurrency = Math.max(1, Math.min((this.settings && this.settings.maxConcurrentSegments) || 3, 3));
      while (this.pendingQueue.length > 0 && this.running) {
        const batch = this.pendingQueue.splice(0, concurrency);
        await Promise.all(batch.map((item) => this.translateItem(item)));
      }
    }

    async translateItem(item) {
      if (!this.running || !this.settings) {
        return;
      }
      item.anchor.setAttribute(PROCESSED_ATTR, 'pending');
      item.anchor.setAttribute(CONTEXT_ATTR, item.segment.contextHash);
      this.renderer.renderLoading(item.anchor, item.segment.id, item.segment.anchorStrategy);

      try {
        const response = await this.requestTranslation(item.segment);
        if (response.result.error) {
          item.anchor.setAttribute(PROCESSED_ATTR, 'error');
          this.renderer.renderError(item.anchor, item.segment.id, response.result.error, item.segment.anchorStrategy);
          this.state.failed += 1;
          this.state.lastErrorCode = response.result.errorCode;
          this.state.lastErrorMessage = response.result.error;
          return;
        }

        item.anchor.setAttribute(PROCESSED_ATTR, 'done');
        this.renderedAnchors.set(item.anchor, `${item.segment.textHash}::${item.segment.contextHash}`);
        this.renderer.renderSuccess(item.anchor, item.segment.id, response.result.translation || '', item.segment.anchorStrategy);
        this.state.completed += 1;
        if (response.result.cacheHit) {
          this.state.cacheHits += 1;
        }
      } catch (error) {
        item.anchor.setAttribute(PROCESSED_ATTR, 'error');
        const message = error instanceof Error ? error.message : 'unknown error';
        this.renderer.renderError(item.anchor, item.segment.id, message, item.segment.anchorStrategy);
        this.state.failed += 1;
        this.state.lastErrorCode = 'CONTENT_RUNTIME_ERROR';
        this.state.lastErrorMessage = message;
      }
    }

    async requestTranslation(segment) {
      let providerId = this.settings && this.settings.defaultProviderId ? this.settings.defaultProviderId : this.state.activeProviderId;

      if (!providerId) {
        providerId = await resolveActiveProviderId(this.settings);
        this.state.activeProviderId = providerId;
      }

      if (!providerId) {
        return {
          result: {
            error: 'No active provider configured',
            errorCode: 'NO_PROVIDER'
          }
        };
      }

      const first = await chrome.runtime.sendMessage({
        type: 'TRANSLATE_SEGMENT',
        payload: {
          segment,
          providerId
        }
      });

      if (first.result && first.result.errorCode === 'EMPTY_TRANSLATION') {
        return chrome.runtime.sendMessage({
          type: 'TRANSLATE_SEGMENT',
          payload: {
            segment,
            providerId
          }
        });
      }

      return first;
    }

    enableObserverIfNeeded() {
      if (!this.adapter || typeof this.adapter.observe !== 'function' || !this.settings) {
        return;
      }

      const override = resolveSiteOverride(this.settings, window.location.hostname);
      const observeEnabled = typeof override.observeDynamic === 'boolean' ? override.observeDynamic : this.settings.observeDynamicContent;
      if (!observeEnabled) {
        return;
      }

      this.disconnectObserver();
      this.observer = this.adapter.observe(async () => {
        if (!this.running) {
          return;
        }
        await this.collectAndFlush();
      });
      this.state.observing = true;
    }

    disconnectObserver() {
      if (this.observer) {
        this.observer.disconnect();
      }
      this.observer = null;
      this.state.observing = false;
    }
  }

  try {
    const manager = new PageTranslationManager();

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message && message.type === CONTENT_MESSAGE_ACTIONS.startTranslation) {
        void manager.startNewSession('popup-resume')
          .then((state) => sendResponse({ ok: true, state }))
          .catch((error) => sendResponse(createErrorResponse(error, manager.getState())));
        return true;
      }

      if (message && message.type === CONTENT_MESSAGE_ACTIONS.rescanTranslation) {
        void manager.rescan()
          .then((state) => sendResponse({ ok: true, state }))
          .catch((error) => sendResponse(createErrorResponse(error, manager.getState())));
        return true;
      }

      if (message && message.type === CONTENT_MESSAGE_ACTIONS.restartTranslation) {
        void manager.startNewSession('popup-restart')
          .then((state) => sendResponse({ ok: true, state }))
          .catch((error) => sendResponse(createErrorResponse(error, manager.getState())));
        return true;
      }

      if (message && message.type === CONTENT_MESSAGE_ACTIONS.clearTranslation) {
        sendResponse({ ok: true, state: manager.clear() });
        return false;
      }

      if (message && message.type === CONTENT_MESSAGE_ACTIONS.stopTranslation) {
        sendResponse({ ok: true, state: manager.stop() });
        return false;
      }

      if (message && message.type === CONTENT_MESSAGE_ACTIONS.getState) {
        sendResponse({ ok: true, state: manager.getState() });
        return false;
      }

      return false;
    });

    window.__AI_TRANSLATOR_READY__ = true;
    void manager.autoStart();
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown init error';
    window.__AI_TRANSLATOR_INIT_ERROR__ = message;
    window.__AI_TRANSLATOR_READY__ = false;
    console.error('[content] init failed', error);
  }
})();
