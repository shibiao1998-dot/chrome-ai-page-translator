import { CONTENT_MESSAGE_ACTIONS, MESSAGE_ACTIONS } from './constants';
import type {
  ExtensionSettings,
  PageTranslationState,
  ProviderConfig,
  SiteKind,
  TranslationResult,
  TranslationSegment
} from './types';

declare global {
  interface Window {
    __AI_TRANSLATOR_READY__?: boolean;
    __AI_TRANSLATOR_INIT_ERROR__?: string;
  }
}

export type MessageAction =
  (typeof MESSAGE_ACTIONS)[keyof typeof MESSAGE_ACTIONS];

export interface PingRequest {
  type: typeof MESSAGE_ACTIONS.ping;
}

export interface GetProvidersRequest {
  type: typeof MESSAGE_ACTIONS.getProviders;
}

export interface SaveProvidersRequest {
  type: typeof MESSAGE_ACTIONS.saveProviders;
  payload: {
    providers: ProviderConfig[];
  };
}

export interface GetSettingsRequest {
  type: typeof MESSAGE_ACTIONS.getSettings;
}

export interface SaveSettingsRequest {
  type: typeof MESSAGE_ACTIONS.saveSettings;
  payload: {
    settings: ExtensionSettings;
  };
}

export interface GetBootstrapDataRequest {
  type: typeof MESSAGE_ACTIONS.getBootstrapData;
}

export interface GetStatusRequest {
  type: typeof MESSAGE_ACTIONS.getStatus;
}

export interface TranslateSegmentRequest {
  type: typeof MESSAGE_ACTIONS.translateSegment;
  payload: {
    segment: TranslationSegment;
    providerId?: string | null;
  };
}

export interface HealthCheckProviderRequest {
  type: typeof MESSAGE_ACTIONS.healthCheckProvider;
  payload: {
    providerId?: string | null;
  };
}

export interface ClearCacheRequest {
  type: typeof MESSAGE_ACTIONS.clearCache;
}

export interface GetActiveAdapterRequest {
  type: typeof MESSAGE_ACTIONS.getActiveAdapter;
}

export type BackgroundRequest =
  | PingRequest
  | GetProvidersRequest
  | SaveProvidersRequest
  | GetSettingsRequest
  | SaveSettingsRequest
  | GetBootstrapDataRequest
  | GetStatusRequest
  | TranslateSegmentRequest
  | HealthCheckProviderRequest
  | ClearCacheRequest
  | GetActiveAdapterRequest;

export interface PingResponse {
  ok: true;
  source: 'background';
}

export interface ProvidersResponse {
  ok: true;
  providers: ProviderConfig[];
}

export interface SettingsResponse {
  ok: true;
  settings: ExtensionSettings;
}

export interface BootstrapDataResponse {
  ok: true;
  providers: ProviderConfig[];
  settings: ExtensionSettings;
  status: PageTranslationState;
}

export interface StatusResponse {
  ok: true;
  status: PageTranslationState;
}

export interface TranslateSegmentResponse {
  ok: true;
  result: TranslationResult;
}

export interface HealthCheckProviderResponse {
  ok: true;
  result: {
    ok: boolean;
    message?: string;
  };
}

export interface ClearCacheResponse {
  ok: true;
}

export interface ActiveAdapterResponse {
  ok: true;
  siteKind: SiteKind;
}

export type BackgroundResponse =
  | PingResponse
  | ProvidersResponse
  | SettingsResponse
  | BootstrapDataResponse
  | StatusResponse
  | TranslateSegmentResponse
  | HealthCheckProviderResponse
  | ClearCacheResponse
  | ActiveAdapterResponse;

export async function sendToBackground<TResponse extends BackgroundResponse>(
  request: BackgroundRequest
): Promise<TResponse> {
  return new Promise<TResponse>((resolve, reject) => {
    chrome.runtime.sendMessage(request, (response) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }

      resolve(response as TResponse);
    });
  });
}

export function getBootstrapData(): Promise<BootstrapDataResponse> {
  return sendToBackground<BootstrapDataResponse>({
    type: MESSAGE_ACTIONS.getBootstrapData
  });
}

export function pingBackground(): Promise<PingResponse> {
  return sendToBackground<PingResponse>({
    type: MESSAGE_ACTIONS.ping
  });
}

export function translateSegment(
  segment: TranslationSegment,
  providerId?: string | null
): Promise<TranslateSegmentResponse> {
  return sendToBackground<TranslateSegmentResponse>({
    type: MESSAGE_ACTIONS.translateSegment,
    payload: {
      segment,
      providerId
    }
  });
}

export function healthCheckProvider(
  providerId?: string | null
): Promise<HealthCheckProviderResponse> {
  return sendToBackground<HealthCheckProviderResponse>({
    type: MESSAGE_ACTIONS.healthCheckProvider,
    payload: {
      providerId
    }
  });
}

export function clearCache(): Promise<ClearCacheResponse> {
  return sendToBackground<ClearCacheResponse>({
    type: MESSAGE_ACTIONS.clearCache
  });
}

export interface ContentStartTranslationRequest {
  type: typeof CONTENT_MESSAGE_ACTIONS.startTranslation;
}

export interface ContentStopTranslationRequest {
  type: typeof CONTENT_MESSAGE_ACTIONS.stopTranslation;
}

export interface ContentClearTranslationRequest {
  type: typeof CONTENT_MESSAGE_ACTIONS.clearTranslation;
}

export interface ContentGetStateRequest {
  type: typeof CONTENT_MESSAGE_ACTIONS.getState;
}

export interface ContentRescanTranslationRequest {
  type: typeof CONTENT_MESSAGE_ACTIONS.rescanTranslation;
}

export interface ContentRestartTranslationRequest {
  type: typeof CONTENT_MESSAGE_ACTIONS.restartTranslation;
}

export type ContentRequest =
  | ContentStartTranslationRequest
  | ContentStopTranslationRequest
  | ContentClearTranslationRequest
  | ContentGetStateRequest
  | ContentRescanTranslationRequest
  | ContentRestartTranslationRequest;

export interface ContentStateResponse {
  ok: true;
  state: PageTranslationState;
}

export async function sendToActiveTab<TResponse>(request: ContentRequest): Promise<TResponse> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    throw new Error('Active tab not found');
  }

  if (!tab.url || !/^https?:/i.test(tab.url)) {
    throw new Error('Current tab does not allow content script injection');
  }

  try {
    return await sendMessageToTab<TResponse>(tab.id, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (!/Receiving end does not exist/i.test(message)) {
      throw error;
    }

    await injectContentScript(tab.id);

    return sendMessageToTab<TResponse>(tab.id, request);
  }
}

async function injectContentScript(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        ready: window.__AI_TRANSLATOR_READY__ === true,
        error: window.__AI_TRANSLATOR_INIT_ERROR__ ?? null
      })
    });

    if (result?.error) {
      throw new Error(`Content init failed: ${result.error}`);
    }

    if (!result?.ready) {
      throw new Error('Content script injected but did not become ready');
    }

    return;
  } catch (fileInjectionError) {
    const fileInjectionMessage =
      fileInjectionError instanceof Error ? fileInjectionError.message : '';

    if (/Cannot access contents of url/i.test(fileInjectionMessage)) {
      throw new Error('Current page blocks extension injection');
    }
  }

  throw new Error('Content script bundle failed to load. Check extension errors.');
}

function sendMessageToTab<TResponse>(tabId: number, request: ContentRequest): Promise<TResponse> {
  return new Promise<TResponse>((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, request, (response) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }

      resolve(response as TResponse);
    });
  });
}
