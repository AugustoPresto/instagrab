import type { DownloadRequest, ExtensionMessage } from "../shared/types";

/**
 * Background Service Worker
 * Handles download requests from the popup and tracks download progress.
 */

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    if (message.type === "DOWNLOAD_ITEMS") {
      handleDownloads(message.payload).then(sendResponse).catch((err) => {
        sendResponse({ type: "ERROR", payload: String(err) });
      });
      return true; // async response
    }

    if (message.type === "FETCH_URL_HTML") {
      fetch(message.payload, { credentials: "include" })
        .then(async (r) => {
          if (!r.ok) {
            throw new Error(`HTTP error! status: ${r.status}`);
          }
          if (r.url.includes("accounts/login")) {
            throw new Error("Instagram redirected the request to login. Please make sure you are logged in.");
          }
          return r.text();
        })
        .then((html) => {
          sendResponse({ type: "FETCH_URL_HTML_RESULT", payload: html });
        })
        .catch((err) => {
          sendResponse({ type: "ERROR", payload: String(err) });
        });
      return true; // async response
    }

    return false;
  }
);

async function handleDownloads(request: DownloadRequest): Promise<void> {
  const prefix = request.filenamePrefix ?? "instagrab";

  for (let i = 0; i < request.items.length; i++) {
    const item = request.items[i];
    let filename = item.filename ?? `${prefix}_${item.id}`;
    
    // Append extension if not already present
    if (!filename.endsWith(".mp4") && !filename.endsWith(".jpg")) {
      const ext = item.type === "video" ? "mp4" : "jpg";
      filename = `${filename}.${ext}`;
    }

    await chrome.downloads.download({
      url: item.url,
      filename: `InstaGrab/${filename}`,
      conflictAction: "uniquify",
    });

    // Small delay to avoid rate limits
    if (i < request.items.length - 1) {
      await delay(300);
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Track download progress and broadcast to popup (if open)
chrome.downloads.onChanged.addListener((delta) => {
  if (!delta.state && !delta.bytesReceived) return;

  chrome.downloads.search({ id: delta.id }, ([item]) => {
    if (!item) return;

    const progress = {
      downloadId: String(delta.id),
      mediaId: delta.id.toString(),
      filename: item.filename,
      bytesReceived: item.bytesReceived,
      totalBytes: item.totalBytes,
      state:
        item.state === "complete"
          ? ("complete" as const)
          : item.state === "interrupted"
          ? ("interrupted" as const)
          : ("in_progress" as const),
    };

    chrome.runtime.sendMessage({
      type: "DOWNLOAD_PROGRESS",
      payload: progress,
    }).catch(() => {
      // Popup closed — ignore
    });
  });
});
