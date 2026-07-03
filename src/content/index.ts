import type { ExtensionMessage, PostInfo, MediaItem } from "../shared/types";
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

function extractFromDOM(postUrl: string): PostInfo | null {
  // Extract shortcode
  const shortcode =
    postUrl.split("/p/")[1]?.split("/")[0] ||
    postUrl.split("/reel/")[1]?.split("/")[0] ||
    postUrl.split("/tv/")[1]?.split("/")[0] ||
    "unknown";

  // Find the correct container containing our shortcode
  let container: Element | null = null;
  const articles = Array.from(document.querySelectorAll("article"));
  
  if (articles.length === 1) {
    container = articles[0];
  } else if (articles.length > 1) {
    // Find the article that has a link containing the shortcode
    container = articles.find((art) => {
      const links = Array.from(art.querySelectorAll("a"));
      return links.some((link) => {
        const href = link.getAttribute("href");
        return href && href.includes(shortcode);
      });
    }) || null;
  }

  // Fallback to dialog modal
  if (!container) {
    container = document.querySelector('div[role="dialog"]');
  }

  // Final fallback to body
  if (!container) {
    container = document.body;
  }

  // Extract author
  let author = "unknown";
  const header = container.querySelector("header");
  if (header) {
    const headerLinks = Array.from(header.querySelectorAll("a"));
    for (const link of headerLinks) {
      const text = link.textContent?.trim();
      const href = link.getAttribute("href");
      if (text && href && href.includes(text)) {
        author = text;
        break;
      }
    }
  }

  // Fallback author check
  if (author === "unknown") {
    const links = Array.from(container.querySelectorAll("a"));
    for (const link of links) {
      const href = link.getAttribute("href");
      if (href && /^\/[a-zA-Z0-9_\-\.]+\/$/.test(href)) {
        const user = href.replace(/\//g, "");
        if (user && !["explore", "p", "reels", "stories", "direct"].includes(user)) {
          author = user;
          break;
        }
      }
    }
  }

  const mediaItems: MediaItem[] = [];

  // 1. Extract Videos
  const videos = Array.from(container.querySelectorAll("video"));
  videos.forEach((video, index) => {
    // Skip small video elements (e.g. stories previews)
    const rect = video.getBoundingClientRect();
    if (rect.width > 0 && rect.width < 200) return;

    const src = video.getAttribute("src") || video.querySelector("source")?.getAttribute("src");
    if (src) {
      const poster = video.getAttribute("poster") || "";
      mediaItems.push({
        id: `dom_video_${shortcode}_${index + 1}`,
        type: "video",
        url: src,
        thumbnailUrl: poster || src,
        width: video.videoWidth || rect.width || 1080,
        height: video.videoHeight || rect.height || 1920,
        postUrl,
        filename: `${author}_video_${index + 1}`,
      });
    }
  });

  // 2. Extract Images (skipping avatars and icons based on size and class)
  const images = Array.from(container.querySelectorAll("img"));
  images.forEach((img, index) => {
    // Skip small images (avatars, icons) using rendered dimensions if possible
    const rect = img.getBoundingClientRect();
    if (rect.width > 0 && rect.width < 200) return;

    const widthAttr = img.getAttribute("width");
    const heightAttr = img.getAttribute("height");
    const isSmall = (widthAttr && parseInt(widthAttr) < 200) || (heightAttr && parseInt(heightAttr) < 200);
    if (isSmall) return;

    if (img.closest("header") || img.closest('[role="link"] img') || img.getAttribute("alt")?.includes("profile")) {
      return;
    }

    let src = img.getAttribute("src") || "";
    const srcset = img.getAttribute("srcset");
    if (srcset) {
      const candidates = srcset.split(",").map((c) => {
        const parts = c.trim().split(/\s+/);
        const url = parts[0];
        const width = parts[1] ? parseInt(parts[1].replace("w", "")) : 0;
        return { url, width };
      });
      if (candidates.length > 0) {
        candidates.sort((a, b) => b.width - a.width);
        src = candidates[0].url;
      }
    }

    if (src && !src.includes("emoji")) {
      mediaItems.push({
        id: `dom_image_${shortcode}_${index + 1}`,
        type: "photo",
        url: src,
        thumbnailUrl: src,
        width: img.naturalWidth || rect.width || 1080,
        height: img.naturalHeight || rect.height || 1080,
        postUrl,
        filename: `${author}_photo_${index + 1}`,
      });
    }
  });

  if (mediaItems.length === 0) return null;

  // Deduplicate by URL
  const uniqueItems: MediaItem[] = [];
  const urls = new Set<string>();
  for (const item of mediaItems) {
    if (!urls.has(item.url)) {
      urls.add(item.url);
      uniqueItems.push(item);
    }
  }

  // Update index and total metadata
  const total = uniqueItems.length;
  uniqueItems.forEach((item, idx) => {
    item.carouselIndex = idx + 1;
    item.carouselTotal = total;
  });

  return {
    shortcode,
    postUrl,
    author,
    caption: "",
    isCarousel: total > 1,
    mediaItems: uniqueItems,
  };
}

async function fetchPostHtml(url: string): Promise<string> {
  // 1. Try fetching directly in the content script (Same-Origin path — carries cookies natively)
  try {
    const resp = await fetch(url, { credentials: "include" });
    if (resp.ok) {
      const text = await resp.text();
      // If we got redirected to login page, direct fetch didn't work (unauthenticated direct load)
      if (!resp.url.includes("accounts/login")) {
        return text;
      }
    }
  } catch (err) {
    console.log("InstaGrab: Content script direct fetch failed/blocked by CSP. Trying background fetch...", err);
  }

  // 2. Try fetching via background script (bypasses CSP)
  const response = await new Promise<ExtensionMessage>((resolve) => {
    chrome.runtime.sendMessage(
      { type: "FETCH_URL_HTML", payload: url } as ExtensionMessage,
      (res) => resolve(res)
    );
  });

  if (response?.type === "FETCH_URL_HTML_RESULT" && response.payload) {
    return response.payload;
  }

  if (response?.type === "ERROR") {
    throw new Error(response.payload);
  }

  throw new Error("Failed to fetch page HTML via all methods.");
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

        // 2. Fallback: Request page HTML and parse JSON scripts using robust regex matching
        if (!postInfo) {
          try {
            const htmlText = await fetchPostHtml(currentUrl);

            // Match all script tags recursively and check attributes for application/json type
            const scriptPattern = /<script([^>]*)>([\s\S]*?)<\/script>/g;
            const fetchedScripts: string[] = [];
            let match;
            while ((match = scriptPattern.exec(htmlText)) !== null) {
              const attrs = match[1];
              const content = match[2];
              if (attrs.includes('type="application/json"') || attrs.includes("type='application/json'")) {
                fetchedScripts.push(content);
              }
            }

            postInfo = extractPostInfo(fetchedScripts, currentUrl);
          } catch (fetchErr) {
            console.error("InstaGrab HTML fetch fallback error:", fetchErr);
          }
        }

        // 3. Fallback: Parse the DOM elements directly (Super Fallback)
        if (!postInfo) {
          console.log("InstaGrab: JSON extraction failed. Falling back to DOM scraping...");
          postInfo = extractFromDOM(currentUrl);
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
