import type { MediaItem } from "../../shared/types";
import MediaCard from "./MediaCard";

interface MediaGridProps {
  items: MediaItem[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}

export default function MediaGrid({ items, selectedIds, onToggle }: MediaGridProps) {
  const cols = items.length === 1 ? "grid-cols-1" : items.length === 2 ? "grid-cols-2" : "grid-cols-3";
  const maxHeight = items.length > 6 ? "max-h-[270px] overflow-y-auto" : "";

  return (
    <div className={`grid ${cols} gap-1 p-2 ${maxHeight}`}>
      {items.map((item) => (
        <MediaCard
          key={item.id}
          item={item}
          isSelected={selectedIds.has(item.id)}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}
