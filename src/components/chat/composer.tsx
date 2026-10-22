"use client";

/**
 * ChatComposer — pill input + mic (real SpeechRecognition where supported,
 * honest fallback toast otherwise) + round red send button.
 */
import { useRef, useState } from "react";
import { ArrowUp, Mic } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export function ChatComposer({
  onSend,
  busy,
  disabled,
}: {
  onSend: (text: string) => void;
  busy: boolean;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");
  const [listening, setListening] = useState(false);
  const recRef = useRef<unknown>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const v = value.trim();
    if (!v || busy || disabled) return;
    onSend(v);
    setValue("");
    if (inputRef.current) inputRef.current.style.height = "auto";
  };

  const toggleMic = () => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) {
      toast({
        title: "ورودی صوتی پشتیبانی نمی‌شود",
        description: "مرورگر شما دسترسی صوتی ندارد؛ لطفا تایپ کن.",
      });
      return;
    }
    if (listening) {
      (recRef.current as SpeechRecognitionLike | null)?.stop();
      setListening(false);
      return;
    }
    try {
      const rec = new SR();
      rec.lang = "fa-IR";
      rec.interimResults = true;
      rec.onresult = (e: SpeechRecognitionEventLike) => {
        let txt = "";
        for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
        setValue(txt);
      };
      rec.onend = () => setListening(false);
      rec.onerror = () => {
        setListening(false);
        toast({ title: "شنیدن صدا ممکن نشد", description: "دوباره تلاش کن یا تایپ کن." });
      };
      recRef.current = rec;
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
      toast({ title: "ورودی صوتی فعال نشد" });
    }
  };

  const canSend = value.trim().length > 0 && !busy && !disabled;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex items-end gap-2"
      aria-label="نوشتن پیام"
    >
      <div
        className={cn(
          "flex flex-1 items-end gap-1 rounded-full border border-border bg-card px-4 py-2 transition-colors",
          listening && "border-primary/60"
        )}
      >
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = Math.min(e.target.scrollHeight, 110) + "px";
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder={listening ? "دارم گوش می‌دم…" : "پیامت رو بنویس..."}
          aria-label="متن پیام"
          className="max-h-[110px] flex-1 resize-none bg-transparent text-[13.5px] leading-6 text-foreground outline-none placeholder:text-muted-foreground"
        />
        <button
          type="button"
          onClick={toggleMic}
          aria-label={listening ? "توقف ضبط" : "ورودی صوتی"}
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full transition-colors",
            listening
              ? "bg-primary/15 text-primary pulse-ring"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Mic className="size-[18px]" aria-hidden />
        </button>
      </div>
      <button
        type="submit"
        disabled={!canSend}
        aria-label="ارسال پیام"
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-full transition-all",
          canSend
            ? "bg-primary text-white hover:bg-brand-hover active:scale-95"
            : "bg-secondary text-muted-foreground"
        )}
      >
        <ArrowUp className="size-5" aria-hidden />
      </button>
    </form>
  );
}

/* minimal structural types for SpeechRecognition (no DOM lib dependency) */
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}
interface SpeechRecognitionEventLike {
  results: ArrayLike<{ 0: { transcript: string } }>;
}
