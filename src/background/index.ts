import {
  DEFAULT_PAGE_TRANSLATION_STATE,
  MESSAGE_ACTIONS
} from '../shared/constants';
import type {
  BackgroundRequest,
  BackgroundResponse
} from '../shared/messages';
import { getProviders, getSettings, saveProviders, saveSettings } from '../shared/storage';
import {
  clearCacheStorage,
  healthCheckActiveProvider,
  translateSegmentWithActiveProvider
} from './translationService';

chrome.runtime.onInstalled.addListener(() => {
  console.info('[background] extension installed');
});

chrome.runtime.onMessage.addListener((message: BackgroundRequest, _sender, sendResponse) => {
  void handleMessage(message).then(sendResponse);
  return true;
});

async function handleMessage(message: BackgroundRequest): Promise<BackgroundResponse> {
  switch (message.type) {
    case MESSAGE_ACTIONS.ping:
      return { ok: true, source: 'background' };
    case MESSAGE_ACTIONS.getProviders:
      return { ok: true, providers: await getProviders() };
    case MESSAGE_ACTIONS.saveProviders:
      await saveProviders(message.payload.providers);
      return { ok: true, providers: await getProviders() };
    case MESSAGE_ACTIONS.getSettings:
      return { ok: true, settings: await getSettings() };
    case MESSAGE_ACTIONS.saveSettings:
      await saveSettings(message.payload.settings);
      return { ok: true, settings: await getSettings() };
    case MESSAGE_ACTIONS.getBootstrapData: {
      const [providers, settings] = await Promise.all([getProviders(), getSettings()]);
      return {
        ok: true,
        providers,
        settings,
        status: DEFAULT_PAGE_TRANSLATION_STATE
      };
    }
    case MESSAGE_ACTIONS.getStatus:
      return { ok: true, status: DEFAULT_PAGE_TRANSLATION_STATE };
    case MESSAGE_ACTIONS.translateSegment:
      return {
        ok: true,
        result: await translateSegmentWithActiveProvider(
          message.payload.segment,
          message.payload.providerId
        )
      };
    case MESSAGE_ACTIONS.healthCheckProvider:
      return {
        ok: true,
        result: await healthCheckActiveProvider(message.payload.providerId)
      };
    case MESSAGE_ACTIONS.clearCache:
      await clearCacheStorage();
      return { ok: true };
    case MESSAGE_ACTIONS.getActiveAdapter:
      return { ok: true, siteKind: 'generic' };
  }
}
