import { answerSlotClasses } from "@/components/player/AnswerShape";
import { avatarFor } from "@/engine/live/avatar";
import { cn } from "@/lib/cn";

/** A participant's animal on their colour (the same on the projector and the phone). */
export function Avatar({ id, className }: { id: string; className?: string }) {
  const { emoji, slot } = avatarFor(id);
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-full text-xl",
        answerSlotClasses(slot),
        className,
      )}
    >
      {emoji}
    </span>
  );
}
