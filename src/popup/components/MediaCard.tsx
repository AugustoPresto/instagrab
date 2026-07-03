import type { MediaItem } from "../../shared/types";

interface MediaCardProps {
  item: MediaItem;
  isSelected: boolean;
  onToggle: (id: string) => void;
}

export default function MediaCard({ item, isSelected, onToggle }: MediaCardProps) {
  return (
    <div
      className={`media-card aspect-square ${isSelected ? "selected" : ""}`}
      onClick={() => onToggle(item.id)}
      role="checkbox"
      aria-checked={isSelected}
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onToggle(item.id)}
    >
      {/* Thumbnail */}
      <img
        src={item.thumbnailUrl}
        alt={`Media ${item.carouselIndex ?? 1}`}
        className="w-full h-full object-cover"
        loading="lazy"
        crossOrigin="anonymous"
      />

      {/* Overlay on selected */}
      {isSelected && (
        <div className="absolute inset-0 bg-pink-500/20 flex items-end justify-end p-1.5">
          <div className="w-5 h-5 rounded-full bg-pink-500 flex items-center justify-center shadow">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <polyline points="2,6 5,9 10,3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      )}

      {/* Type badge */}
      {item.type === "video" && (
        <span className="badge bg-black/70 text-white">
          🎬
        </span>
      )}

      {/* Carousel index */}
      {item.carouselTotal && item.carouselTotal > 1 && (
        <span className="absolute bottom-1.5 left-1.5 text-[9px] bg-black/70 text-white px-1 py-0.5 rounded font-mono">
          {item.carouselIndex}/{item.carouselTotal}
        </span>
      )}

      {/* Resolution */}
      <span className="absolute top-1.5 left-1.5 text-[9px] bg-black/70 text-gray-300 px-1 py-0.5 rounded font-mono">
        {item.width}×{item.height}
      </span>
    </div>
  );
}
