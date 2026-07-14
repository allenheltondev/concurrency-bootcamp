/* A looping preview of what a lesson actually feels like: the flagship
   data-race, stepped the way the in-course animations step it — two threads
   share a counter, lose an update, then hand off cleanly under a lock. It's
   decorative marketing, but it's the real concept, so the hero shows the
   product instead of describing it. Honors prefers-reduced-motion by holding
   on the resolved final frame instead of cycling. */
import { useEffect, useState } from "react";

type Frame = {
  caption: string;
  counter: number;
  expected: number;
  active: "a" | "b" | "both" | null;
  locked: boolean;
  verdict: "lost" | "exact" | null;
};

/* Two acts on a loop: the race that clobbers itself, then the same work
   serialized behind a lock. Kept as a plain script so it's deterministic. */
const FRAMES: Frame[] = [
  { caption: "Two threads, one shared counter.", counter: 0, expected: 2, active: null, locked: false, verdict: null },
  { caption: "Both read the same 0…", counter: 0, expected: 2, active: "both", locked: false, verdict: null },
  { caption: "…both add 1, both write back 1.", counter: 1, expected: 2, active: "both", locked: false, verdict: null },
  { caption: "One increment vanished. That's a data race.", counter: 1, expected: 2, active: null, locked: false, verdict: "lost" },
  { caption: "Now put the counter behind a lock.", counter: 0, expected: 2, active: null, locked: true, verdict: null },
  { caption: "Thread A takes the lock, reads, writes 1.", counter: 1, expected: 2, active: "a", locked: true, verdict: null },
  { caption: "Thread B waits its turn, then writes 2.", counter: 2, expected: 2, active: "b", locked: true, verdict: null },
  { caption: "Exact, every single run.", counter: 2, expected: 2, active: null, locked: true, verdict: "exact" }
];

const RESOLVED = FRAMES.length - 1; // the "exact" frame reduced-motion rests on

function Thread({ label, active }: { label: string; active: boolean }) {
  return (
    <div
      className={
        "flex-1 rounded-lg border px-3 py-2 text-center text-xs font-medium transition-all duration-500 " +
        (active
          ? "border-primary-500 bg-primary-500/10 text-primary-600 shadow-soft"
          : "border-border bg-background text-muted-foreground")
      }
    >
      {label}
    </div>
  );
}

export default function ImmersiveDemo() {
  const reduced =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const [i, setI] = useState(reduced ? RESOLVED : 0);

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => {
      setI((prev) => (prev + 1) % FRAMES.length);
    }, 1600);
    return () => window.clearInterval(id);
  }, [reduced]);

  const f = FRAMES[i];

  return (
    <figure
      className="mx-auto w-full max-w-sm select-none"
      role="img"
      aria-label="An animated lesson demonstrating a data race: two threads share a counter and lose an update, then hand off correctly under a lock."
    >
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-medium">
        {/* lesson chrome — mirrors the in-course eyebrow + step dots */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="font-mono text-[11px] uppercase tracking-wider text-primary-600">
            animated lesson
          </span>
          <span className="flex gap-1.5" aria-hidden="true">
            {FRAMES.map((_, idx) => (
              <span
                key={idx}
                className={
                  "h-1.5 w-1.5 rounded-full transition-colors duration-300 " +
                  (idx === i ? "bg-primary-500" : "bg-muted")
                }
              />
            ))}
          </span>
        </div>

        {/* stage */}
        <div className="px-4 pb-4 pt-5" aria-hidden="true">
          <div className="flex items-center gap-2">
            <Thread label="Thread A" active={f.active === "a" || f.active === "both"} />
            <span className="shrink-0 text-muted-foreground" aria-hidden="true">
              {f.locked ? "🔒" : "⇄"}
            </span>
            <Thread label="Thread B" active={f.active === "b" || f.active === "both"} />
          </div>

          {/* the shared counter */}
          <div className="mt-4 flex items-end justify-center gap-3">
            <div
              className={
                "flex h-20 w-24 flex-col items-center justify-center rounded-xl border-2 transition-all duration-500 " +
                (f.verdict === "lost"
                  ? "border-warning-500 bg-warning-500/10"
                  : f.verdict === "exact"
                  ? "border-success-500 bg-success-500/10"
                  : "border-border bg-background")
              }
            >
              <span
                className={
                  "font-mono text-3xl font-bold tabular-nums transition-colors duration-500 " +
                  (f.verdict === "lost"
                    ? "text-warning-600"
                    : f.verdict === "exact"
                    ? "text-success-600"
                    : "text-foreground")
                }
              >
                {f.counter}
              </span>
              <span className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                counter
              </span>
            </div>
            <div className="pb-1 text-left">
              <div className="font-mono text-[11px] text-muted-foreground">
                expected {f.expected}
              </div>
              <div
                className={
                  "mt-1 font-mono text-xs font-semibold transition-colors duration-500 " +
                  (f.verdict === "lost"
                    ? "text-warning-600"
                    : f.verdict === "exact"
                    ? "text-success-600"
                    : "text-transparent")
                }
              >
                {f.verdict === "lost" ? "lost 1 update" : f.verdict === "exact" ? "= 2 ✓" : "·"}
              </div>
            </div>
          </div>
        </div>

        {/* caption — the narration line */}
        <figcaption className="border-t border-border bg-background px-4 py-3 text-center text-sm text-muted-foreground">
          {f.caption}
        </figcaption>
      </div>
    </figure>
  );
}
