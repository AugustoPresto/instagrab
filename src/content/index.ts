import type { ExtensionMessage, PostInfo } from "../shared/types";
import { extractPostInfo } from "../shared/extractor";

/**
 * Content script — runs on every Instagram page.
 * Listens for GET_POST_INFO messages from the popup and responds
 * with extracted media data.
 */

let cachedPostInfo: PostInfo | null = null;

function isPostUrl(url: string): boolean {
  return /instagram\.com\/(p|reel|tv)\//.test(url);
}

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    if (message.type !== "GET_POST_INFO") return;

    const currentUrl = window.location.href;

    if (!isPostUrl(currentUrl)) {
      sendResponse({ type: "POST_INFO_RESULT", payload: null });
      return true;
    }

    // Extract from current page HTML
    try {
      const postInfo = extractPostInfo(document.documentElement.innerHTML, currentUrl);
      cachedPostInfo = postInfo;
      sendResponse({ type: "POST_INFO_RESULT", payload: postInfo });
    } catch (err) {
      sendResponse({ type: "ERROR", payload: String(err) });
    }

    return true; // Keep channel open for async
  }
);

// Notify popup when the page URL changes (SPA navigation)
let lastUrl = window.location.href;
const observer = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    cachedPostInfo = null;
    chrome.runtime.sendMessage({ type: "GET_POST_INFO" }).catch(() => {
      // Popup may not be open — ignore
    });
  }
});

observer.observe(document.body, { childList: true, subtree: true });
