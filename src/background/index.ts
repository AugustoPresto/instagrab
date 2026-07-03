import type { DownloadRequest, ExtensionMessage } from "../shared/types";

/**
 * Background Service Worker
 * Handles download requests from the popup and tracks download progress.
 */

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    if (message.type !== "DOWNLOAD_ITEMS") return;

    handleDownloads(message.payload).then(sendResponse).catch((err) => {
      sendResponse({ type: "ERROR", payload: String(err) });
    });

    return true; // async response
  }
);

async function handleDownloads(request: DownloadRequest): Promise<void> {
  const prefix = request.filenamePrefix ?? "instagrab";

  for (let i = 0; i < request.items.length; i++) {
    const item = request.items[i];
    const paddedIdx = String(i + 1).padStart(2, "0");
    const ext = item.type === "video" ? "mp4" : "jpg";
    const filename = `${prefix}_${paddedIdx}_${item.filename ?? item.id}.${ext}`;

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
