import type { ExtensionMessage, PostInfo } from "../shared/types";
import { extractPostInfo } from "../shared/extractor";

/**
 * Content script — runs on every Instagram page.
 * Listens for GET_POST_INFO messages from the popup and responds
 * with extracted media data.
 */

let cachedPostInfo: PostInfo | null = null;

function isPostUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return /\/(p|reel|tv)\/[a-zA-Z0-9_\-]+/.test(parsed.pathname);
  } catch {
    return false;
  }
}

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    if (message.type !== "GET_POST_INFO") return;

    const currentUrl = window.location.href;

    if (!isPostUrl(currentUrl)) {
      sendResponse({ type: "POST_INFO_RESULT", payload: null });
      return true;
    }

    // Run async extraction to support fetching page HTML as fallback
    (async () => {
      try {
        // 1. Try local DOM scripts first (Fast Path)
        const scriptElements = document.querySelectorAll('script[type="application/json"]');
        const jsonScripts = Array.from(scriptElements)
          .map((s) => s.textContent || "")
          .filter((t) => t.trim().length > 0);

        let postInfo = extractPostInfo(jsonScripts, currentUrl);

        // 2. Fallback: Fetch page HTML directly (handles client-side SPA transitions where DOM scripts are stale)
        if (!postInfo) {
          const resp = await fetch(currentUrl, { credentials: "include" });
          const htmlText = await resp.text();

          const scriptPattern = /<script\s+type="application\/json"[^>]*>([\s\S]*?)<\/script>/g;
          const fetchedScripts: string[] = [];
          let match;
          while ((match = scriptPattern.exec(htmlText)) !== null) {
            fetchedScripts.push(match[1]);
          }

          postInfo = extractPostInfo(fetchedScripts, currentUrl);
        }

        cachedPostInfo = postInfo;
        sendResponse({ type: "POST_INFO_RESULT", payload: postInfo });
      } catch (err) {
        sendResponse({ type: "ERROR", payload: String(err) });
      }
    })();

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
