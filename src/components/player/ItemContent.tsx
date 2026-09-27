import { cn } from "@/lib/cn";
import type { Item } from "@/questions/shared";

/**
 * An option/item's picture (if any) and text, for use inside answer buttons.
 * The text labels the button; a picture without text gets its alt text instead.
 */
export function ItemContent({
  item,
  fallback,
  imageClassName,
}: {
  item: Item;
  /** Shown when the item has neither text nor a picture, e.g. "Opsi 2". */
  fallback: string;
  imageClassName?: string;
}) {
  const text = item.text.trim();
  const image = item.media?.kind === "image" ? item.media : undefined;
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      {image && (
        // eslint-disable-next-line @next/next/no-img-element -- user upload from Storage
        <img
          src={image.url}
          alt={text ? "" : (image.alt ?? "Gambar")}
          draggable={false}
          className={cn(
            "size-14 shrink-0 rounded-lg bg-white object-cover sm:size-16",
            imageClassName,
          )}
        />
      )}
      {(text || !image) && <span className="min-w-0 flex-1 break-words">{text || fallback}</span>}
    </span>
  );
}
