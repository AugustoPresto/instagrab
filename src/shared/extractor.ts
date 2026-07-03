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

interface VideoVersion {
  url: string;
  width: number;
  height: number;
}

interface InstagramMedia {
  pk?: string;
  id?: string;
  media_type?: number;
  video_versions?: VideoVersion[];
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
 * Converts a raw InstagramMedia object into one or more MediaItems.
 * If the media is a video, it yields both the video and its thumbnail as separate items.
 */
function mediaToItems(
  media: InstagramMedia,
  postUrl: string,
  author: string,
  index: number,
  total: number
): MediaItem[] {
  const items: MediaItem[] = [];

  // Detect if this is a video
  const isVideo =
    media.media_type === 2 ||
    (Array.isArray(media.video_versions) && media.video_versions.length > 0);

  const candidates = media.image_versions2?.candidates ?? [];
  const best = pickBestCandidate(candidates);
  if (!best) return [];

  const cleanedUrl = cleanUrl(best.url);

  // Build a safe filename from the media pk/id
  const mediaId = media.pk ?? media.id ?? `media_${index}`;

  // Thumbnail = smallest uncropped or first candidate
  const thumb = candidates.find((c) => c.width <= 320 && !isCroppedUrl(c.url));
  const thumbnailUrl = cleanUrl((thumb ?? candidates[0])?.url ?? best.url);

  if (isVideo && Array.isArray(media.video_versions) && media.video_versions.length > 0) {
    // 1. Pick the highest resolution video version
    const bestVideo = media.video_versions.reduce((bestV, v) =>
      v.width * v.height > bestV.width * bestV.height ? v : bestV
    );
    if (bestVideo?.url) {
      const downloadUrl = cleanUrl(bestVideo.url);
      const suffix = total > 1 ? `_${index}of${total}` : "";
      items.push({
        id: `${mediaId}_video`,
        type: "video",
        url: downloadUrl,
        thumbnailUrl,
        width: bestVideo.width,
        height: bestVideo.height,
        postUrl,
        filename: `${author}_${mediaId}${suffix}.mp4`,
        ...(total > 1 ? { carouselIndex: index, carouselTotal: total } : {}),
      });
    }

    // 2. Add the thumbnail itself as a separate image item for download
    const suffix = total > 1 ? `_${index}of${total}_thumb` : "_thumb";
    items.push({
      id: `${mediaId}_thumb`,
      type: "photo",
      url: cleanedUrl,
      thumbnailUrl,
      width: best.width,
      height: best.height,
      postUrl,
      filename: `${author}_${mediaId}${suffix}.jpg`,
      ...(total > 1 ? { carouselIndex: index, carouselTotal: total } : {}),
    });
  } else {
    // Standard photo
    const suffix = total > 1 ? `_${index}of${total}` : "";
    items.push({
      id: `${mediaId}_photo`,
      type: "photo",
      url: cleanedUrl,
      thumbnailUrl,
      width: best.width,
      height: best.height,
      postUrl,
      filename: `${author}_${mediaId}${suffix}.jpg`,
      ...(total > 1 ? { carouselIndex: index, carouselTotal: total } : {}),
    });
  }

  return items;
}

export function extractPostInfo(jsonScripts: (string | object)[], postUrl: string): PostInfo | null {
  for (const scriptContent of jsonScripts) {
    let data: unknown;
    if (typeof scriptContent === "string") {
      try {
        data = JSON.parse(scriptContent);
      } catch {
        continue;
      }
    } else {
      data = scriptContent;
    }

    // Check both standard web info path and root data/item paths (which ?__a=1 API uses)
    const webInfo = findKeyRecursive<WebInfo>(
      data,
      "xdt_api__v1__media__shortcode__web_info"
    );
    
    let item: InstagramMedia | null = null;
    if (webInfo?.items?.length) {
      item = webInfo.items[0];
    } else {
      // Direct API path: root items, graphql or post details
      const itemsList = findKeyRecursive<InstagramMedia[]>(data, "items");
      if (itemsList?.length) {
        item = itemsList[0];
      }
    }

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
      .flatMap((m, i) => mediaToItems(m, postUrl, author, i + 1, total));

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
