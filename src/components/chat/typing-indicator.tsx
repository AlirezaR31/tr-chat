"use client";

/** Typing indicator — three animated dots. */
export function TypingIndicator() {
  return (
    <div
      className="inline-flex items-center gap-1 rounded-2xl bg-card px-3.5 py-3"
      role="status"
      aria-label="دستیار در حال نوشتن"
    >
      <span className="typing-dot size-1.5 rounded-full bg-muted-foreground" />
      <span className="typing-dot size-1.5 rounded-full bg-muted-foreground" />
      <span className="typing-dot size-1.5 rounded-full bg-muted-foreground" />
    </div>
  );
}
