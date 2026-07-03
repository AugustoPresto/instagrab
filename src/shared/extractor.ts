import type { MediaItem, PostInfo } from "./types";

/**
 * Recursively searches a nested object for a key.
 */
function findKeyRecursive<T>(obj: unknown, key: string): T | null {
  if (!obj || typeof obj !== "object") return null;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      const result = findKeyRecursive<T>(item, key);
      if (result !== null) return result;
    }
    return null;
  }

  const record = obj as Record<string, unknown>;
  if (key in record) return record[key] as T;

  for (const val of Object.values(record)) {
    const result = findKeyRecursive<T>(val, key);
    if (result !== null) return result;
  }

  return null;
}

interface ImageCandidate {
  url: string;
  width: number;
  height: number;
}

interface InstagramMedia {
  pk?: string;
  id?: string;
  media_type?: number;
  video_versions?: unknown[];
  image_versions2?: { candidates?: ImageCandidate[] };
  carousel_media?: InstagramMedia[];
  code?: string;
}

interface WebInfo {
  items?: InstagramMedia[];
}

/**
 * Sanitizes a CDN URL (unescape slashes, fix amp entities).
 */
function cleanUrl(url: string): string {
  return url.replace(/\\\//g, "/").replace(/&amp;/g, "&");
}

/**
 * Returns whether a CDN URL is a cropped variant (has stp=c... crop offset).
 * Cropped URLs look like: stp=c288.0.864.864a_...
 */
function isCroppedUrl(url: string): boolean {
  return /stp=c\d+/.test(url);
}

/**
 * Picks the best (highest resolution, uncropped) image URL from candidates.
 */
function pickBestCandidate(candidates: ImageCandidate[]): ImageCandidate | null {
  const uncropped = candidates.filter((c) => c.url && !isCroppedUrl(c.url));
  const pool = uncropped.length > 0 ? uncropped : candidates;
  if (pool.length === 0) return null;
  return pool.reduce((best, c) =>
    c.width * c.height > best.width * best.height ? c : best
  );
}

/**
 * Converts a raw InstagramMedia object into a MediaItem.
 */
function mediaToItem(
  media: InstagramMedia,
  postUrl: string,
  author: string,
  index: number,
  total: number
): MediaItem | null {
  // Detect if this is a video
  const isVideo =
    media.media_type === 2 ||
    (Array.isArray(media.video_versions) && media.video_versions.length > 0);

  const candidates = media.image_versions2?.candidates ?? [];
  const best = pickBestCandidate(candidates);
  if (!best) return null;

  const cleanedUrl = cleanUrl(best.url);

  // Build a safe filename from the media pk/id
  const mediaId = media.pk ?? media.id ?? `media_${index}`;
  const ext = isVideo ? "mp4" : "jpg";
  const suffix = total > 1 ? `_${index}of${total}` : "";
  const filename = `${author}_${mediaId}${suffix}.${ext}`;

  // Thumbnail = smallest uncropped or first candidate
  const thumb = candidates.find((c) => c.width <= 320 && !isCroppedUrl(c.url));
  const thumbnailUrl = cleanUrl((thumb ?? candidates[0])?.url ?? best.url);

  return {
    id: String(mediaId),
    type: isVideo ? "video" : "photo",
    url: cleanedUrl,
    thumbnailUrl,
    width: best.width,
    height: best.height,
    postUrl,
    filename,
    ...(total > 1 ? { carouselIndex: index, carouselTotal: total } : {}),
  };
}

/**
 * Extracts post information from the current Instagram page source.
 * This mirrors the Python logic we validated earlier but runs in the browser.
 */
export function extractPostInfo(html: string, postUrl: string): PostInfo | null {
  // Find all application/json script tags
  const scriptPattern =
    /<script\s+type="application\/json"[^>]*>([\s\S]*?)<\/script>/g;
  let match: RegExpExecArray | null;

  while ((match = scriptPattern.exec(html)) !== null) {
    let data: unknown;
    try {
      data = JSON.parse(match[1]);
    } catch {
      continue;
    }

    const webInfo = findKeyRecursive<WebInfo>(
      data,
      "xdt_api__v1__media__shortcode__web_info"
    );
    if (!webInfo?.items?.length) continue;

    const item = webInfo.items[0];
    if (!item) continue;

    // Extract author from user object
    const userInfo = findKeyRecursive<{ username?: string }>(item, "user");
    const author = userInfo?.username ?? "unknown";

    // Shortcode
    const shortcode = item.code ?? new URL(postUrl).pathname.split("/")[2] ?? "unknown";

    // Caption
    const captionObj = findKeyRecursive<{ text?: string }>(item, "caption");
    const caption = captionObj?.text ?? "";

    // Build media list
    const rawMediaList: InstagramMedia[] =
      Array.isArray(item.carousel_media) && item.carousel_media.length > 0
        ? item.carousel_media
        : [item];

    const total = rawMediaList.length;
    const mediaItems: MediaItem[] = rawMediaList
      .map((m, i) => mediaToItem(m, postUrl, author, i + 1, total))
      .filter((m): m is MediaItem => m !== null);

    if (mediaItems.length === 0) continue;

    return {
      shortcode,
      postUrl,
      author,
      caption,
      isCarousel: total > 1,
      mediaItems,
    };
  }

  return null;
}
