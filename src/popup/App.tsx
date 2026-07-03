import { useState, useEffect, useCallback } from "react";
import type { MediaItem, PostInfo, ExtensionMessage } from "../shared/types";
import MediaGrid from "./components/MediaGrid";
import Header from "./components/Header";
import StatusScreen from "./components/StatusScreen";

type AppState = "loading" | "not-instagram" | "not-post" | "ready" | "downloading" | "done" | "error";

export default function App() {
  const [appState, setAppState] = useState<AppState>("loading");
  const [postInfo, setPostInfo] = useState<PostInfo | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [downloadedCount, setDownloadedCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string>("");

  // Load post info from the active tab's content script
  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.url) {
        setAppState("not-instagram");
        return;
      }

      const url = tab.url;
      if (!url.includes("instagram.com")) {
        setAppState("not-instagram");
        return;
      }

      const isPostUrl = (u: string) => {
        try {
          const parsed = new URL(u);
          return /\/(p|reel|tv)\/[a-zA-Z0-9_\-]+/.test(parsed.pathname);
        } catch {
          return false;
        }
      };

      if (!isPostUrl(url)) {
        setAppState("not-post");
        return;
      }

      chrome.tabs.sendMessage(
        tab.id!,
        { type: "GET_POST_INFO" } as ExtensionMessage,
        (response: ExtensionMessage) => {
          if (chrome.runtime.lastError) {
            setAppState("error");
            setErrorMsg("Could not connect to page. Try refreshing the Instagram tab.");
            return;
          }

          if (response?.type === "POST_INFO_RESULT") {
            if (response.payload) {
              setPostInfo(response.payload);
              // Pre-select all items
              const allIds = new Set(response.payload.mediaItems.map((m) => m.id));
              setSelectedIds(allIds);
              setAppState("ready");
            } else {
              setAppState("error");
              setErrorMsg("Could not extract media from this post. The page may still be loading.");
            }
          } else if (response?.type === "ERROR") {
            setAppState("error");
            setErrorMsg(response.payload);
          }
        }
      );
    });
  }, []);

  // Listen for download progress updates from background
  useEffect(() => {
    const handler = (message: ExtensionMessage) => {
      if (message.type === "DOWNLOAD_PROGRESS" && message.payload.state === "complete") {
        setDownloadedCount((c) => c + 1);
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  const handleToggleItem = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (!postInfo) return;
    setSelectedIds(new Set(postInfo.mediaItems.map((m) => m.id)));
  }, [postInfo]);

  const handleSelectNone = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleDownload = useCallback(() => {
    if (!postInfo) return;
    const items: MediaItem[] = postInfo.mediaItems.filter((m) => selectedIds.has(m.id));
    if (items.length === 0) return;

    setAppState("downloading");
    setDownloadedCount(0);

    chrome.runtime.sendMessage({
      type: "DOWNLOAD_ITEMS",
      payload: {
        items,
        filenamePrefix: postInfo.author,
      },
    } as ExtensionMessage);

    // Transition to "done" after all downloads complete
    const total = items.length;
    const checkDone = setInterval(() => {
      setDownloadedCount((c) => {
        if (c >= total) {
          clearInterval(checkDone);
          setAppState("done");
        }
        return c;
      });
    }, 500);
  }, [postInfo, selectedIds]);

  const handleReset = () => {
    setAppState("loading");
    setPostInfo(null);
    setSelectedIds(new Set());
    setDownloadedCount(0);
    // Re-run effect
    window.location.reload();
  };

  const selectedItems = postInfo?.mediaItems.filter((m) => selectedIds.has(m.id)) ?? [];
  const photoCount = selectedItems.filter((m) => m.type === "photo").length;
  const videoCount = selectedItems.filter((m) => m.type === "video").length;

  return (
    <div className="flex flex-col min-h-0">
      <Header />

      {appState === "loading" && (
        <StatusScreen icon="⏳" title="Analyzing post..." subtitle="Extracting media information" />
      )}

      {appState === "not-instagram" && (
        <StatusScreen
          icon="📸"
          title="Open Instagram"
          subtitle="Navigate to an Instagram post, reel, or carousel to grab media"
        />
      )}

      {appState === "not-post" && (
        <StatusScreen
          icon="👆"
          title="Open a post"
          subtitle="Click on a photo, reel, or carousel to view it, then come back here"
        />
      )}

      {appState === "error" && (
        <StatusScreen icon="⚠️" title="Something went wrong" subtitle={errorMsg}>
          <button className="btn-secondary mt-3" onClick={handleReset}>
            Try again
          </button>
        </StatusScreen>
      )}

      {appState === "done" && (
        <StatusScreen
          icon="✅"
          title="Download complete!"
          subtitle={`${downloadedCount} file${downloadedCount !== 1 ? "s" : ""} saved to your InstaGrab folder`}
        >
          <button className="btn-secondary mt-3" onClick={handleReset}>
            Grab more
          </button>
        </StatusScreen>
      )}

      {(appState === "ready" || appState === "downloading") && postInfo && (
        <div className="flex flex-col">
          {/* Author info */}
          <div className="px-4 pt-3 pb-2 border-b border-gray-800">
            <p className="text-xs text-gray-400">
              @{postInfo.author}
              {postInfo.isCarousel && (
                <span className="ml-2 px-1.5 py-0.5 bg-gray-800 rounded text-gray-400 text-[10px] font-semibold">
                  CAROUSEL · {postInfo.mediaItems.length} items
                </span>
              )}
            </p>
          </div>

          <MediaGrid
            items={postInfo.mediaItems}
            selectedIds={selectedIds}
            onToggle={handleToggleItem}
          />

          {/* Selection controls */}
          <div className="px-4 py-2 flex items-center gap-2 border-t border-gray-800">
            <button
              className="text-[11px] text-gray-400 hover:text-white transition-colors"
              onClick={handleSelectAll}
            >
              All
            </button>
            <span className="text-gray-600">·</span>
            <button
              className="text-[11px] text-gray-400 hover:text-white transition-colors"
              onClick={handleSelectNone}
            >
              None
            </button>
            <span className="ml-auto text-[11px] text-gray-500">
              {selectedIds.size} selected
              {photoCount > 0 && ` · ${photoCount} 📷`}
              {videoCount > 0 && ` · ${videoCount} 🎬`}
            </span>
          </div>

          {/* Download progress */}
          {appState === "downloading" && (
            <div className="px-4 pb-2">
              <div className="bg-gray-800 rounded-full h-1 mb-1">
                <div
                  className="progress-bar"
                  style={{ width: `${(downloadedCount / selectedIds.size) * 100}%` }}
                />
              </div>
              <p className="text-[11px] text-gray-400">
                {downloadedCount} / {selectedIds.size} downloaded…
              </p>
            </div>
          )}

          {/* Download button */}
          <div className="px-4 pb-4">
            <button
              className="btn-primary"
              disabled={selectedIds.size === 0 || appState === "downloading"}
              onClick={handleDownload}
            >
              {appState === "downloading"
                ? "Downloading…"
                : `Download ${selectedIds.size > 0 ? selectedIds.size : ""} file${selectedIds.size !== 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
