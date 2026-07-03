// Shared types used across content script, background, and popup

export interface MediaItem {
  id: string;
  type: "photo" | "video";
  url: string; // highest resolution URL
  thumbnailUrl: string;
  width: number;
  height: number;
  postUrl: string;
  filename: string; // suggested filename
  carouselIndex?: number; // 1-based index within carousel
  carouselTotal?: number;
}

export interface PostInfo {
  shortcode: string;
  postUrl: string;
  author: string;
  caption: string;
  isCarousel: boolean;
  mediaItems: MediaItem[];
}

export interface DownloadRequest {
  items: MediaItem[];
  filenamePrefix?: string;
}

export interface DownloadProgress {
  downloadId: string;
  mediaId: string;
  filename: string;
  bytesReceived: number;
  totalBytes: number;
  state: "in_progress" | "complete" | "interrupted";
}

// Message types for extension communication
export type ExtensionMessage =
  | { type: "GET_POST_INFO" }
  | { type: "POST_INFO_RESULT"; payload: PostInfo | null }
  | { type: "DOWNLOAD_ITEMS"; payload: DownloadRequest }
  | { type: "DOWNLOAD_PROGRESS"; payload: DownloadProgress }
  | { type: "FETCH_URL_HTML"; payload: string }
  | { type: "FETCH_URL_HTML_RESULT"; payload: string }
  | { type: "ERROR"; payload: string };
