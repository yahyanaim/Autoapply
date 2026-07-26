import { AuthManager } from './auth/auth-manager';
import { MessageRouter } from './messaging/message-router';
import { TRUSTED_DASHBOARD_ORIGINS } from '../shared/config';

const authManager = new AuthManager();
const messageRouter = new MessageRouter(authManager);

void authManager.configureStorageAccess();

chrome.runtime.onInstalled.addListener(() => {
  console.log('ApplyAI extension installed');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void messageRouter.handleMessage(message, sender, sendResponse);
  return true;
});

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  const senderOrigin = sender.url ? new URL(sender.url).origin : '';
  if (
    !TRUSTED_DASHBOARD_ORIGINS.has(senderOrigin) ||
    message?.type !== 'APPLYAI_AUTH_HANDOFF' ||
    typeof message?.code !== 'string'
  ) {
    sendResponse({ error: 'Untrusted extension handoff' });
    return false;
  }

  void authManager
    .exchangeHandoff(message.code)
    .then(() => sendResponse({ success: true }))
    .catch((error) =>
      sendResponse({
        error: error instanceof Error ? error.message : 'Extension connection failed',
      }),
    );
  return true;
});
