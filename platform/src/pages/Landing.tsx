/* The marketing site at the root URL: what this is, who it's for, why it's
   free, and what makes it different — then the courses themselves, linked
   directly (no account needed; the gated dashboard lives at /app). All
   copy is plain-spoken on purpose: the goodwill IS the pitch. */
import { Link } from "react-router-dom";
import ImmersiveDemo from "../components/ImmersiveDemo";
import { courseHref } from "../lib/courses";
import { TAGLINES, useCatalog } from "../lib/catalog";
import { useConfigured } from "../lib/useConfigured";

const FEATURES: Array<{ icon: string; title: string; body: string }> = [
  {
    icon: "⚙️",
    title: "Real code, really running",
    body:
      "Drills execute actual JavaScript in your browser, and write-it exercises are graded by running your assembled code against real assertions in a sandboxed Worker. Nothing is multiple-choice theater — a correct answer is one that behaves correctly."
  },
  {
    icon: "🎬",
    title: "An animated lesson for everything",
    body:
      "Every concept the drills test has an illustrated, stepped animation — watch a mutex hand off, a quorum form, a reorder buffer fill a gap. Replay until it's intuition, not memorization."
  },
  {
    icon: "👍",
    title: "Built for one thumb",
    body:
      "Phone-first and tap-driven end to end. Lessons, drills, spot-the-bug, even assembling real implementations line by line — all designed for a commute, a queue, or a couch."
  },
  {
    icon: "✈️",
    title: "Works with no signal",
    body:
      "Each course is an installable app that precaches itself and runs fully offline — subways and flights are study halls. Progress saves locally and syncs when you're back."
  },
  {
    icon: "⌨️",
    title: "Transfers to the interview",
    body:
      "Every course ships a practice pack for your real editor: blank-file skeletons with runnable tests and reference solutions. The app is the warm-up loop; the reps are the transfer layer."
  },
  {
    icon: "🏅",
    title: "An account is optional, forever",
    body:
      "Sign in with a free Ready, Set, Cloud account to sync progress across devices and earn badges and streaks — or don't, and keep the complete experience anyway. Nothing is ever gated behind a login."
  }
];

export default function Landing() {
  const configured = useConfigured();
  const courses = useCatalog();

  return (
    <div>
      {/* ---- hero ---- */}
      <header className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-6 pb-16 pt-16 lg:grid-cols-2 lg:gap-16 lg:pb-24 lg:pt-24">
        <div className="text-center lg:text-left">
          <h1 className="text-4xl font-bold leading-tight text-foreground sm:text-5xl">
            Learn the hard stuff by actually doing it.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground lg:mx-0">
            Free, hands-on bootcamps for the concepts that are easy to nod
            along to and hard to actually hold — concurrency, distributed
            systems, and more. Animated lessons, drills that run real code, and
            honest grading, all built for your thumb.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4 lg:justify-start">
            <a href="#courses" className="btn-primary px-6 py-2.5 text-base">
              Start a course
            </a>
            {configured !== false && (
              <Link to="/app" className="btn border-border text-foreground hover:bg-muted px-6 py-2.5 text-base">
                Open your dashboard
              </Link>
            )}
          </div>
        </div>
        <div className="animate-fade-in">
          <ImmersiveDemo />
        </div>
      </header>

      {/* ---- ethos ---- */}
      <section aria-label="why this is free" className="border-y border-border bg-surface">
        <div className="mx-auto max-w-3xl px-6 py-14 text-center">
          <h2 className="text-2xl font-bold text-foreground">Why is this free?</h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Mostly because these are the courses I wished existed, so I built
            them. Ready, Set, Cloud is a goodwill project, not a business:
            no ads, no tracking, no trial that expires, nothing held back for
            a paid tier. They're my best attempt at making a few genuinely
            hard concepts a little easier to sit with &mdash; not the last
            word on any of them, and probably still rough in spots. If working
            through one saves you an afternoon of head-scratching, that's more
            than enough. And if it helps, the only thing I'd ask is that you
            point another engineer this way.
          </p>
        </div>
      </section>

      {/* ---- who it's for ---- */}
      <section aria-label="who it's for" className="mx-auto max-w-3xl px-6 py-14 text-center">
        <h2 className="text-2xl font-bold text-foreground">Who it's for</h2>
        <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
          Working engineers who want the fundamentals for real — whether
          you're prepping for interviews that go deeper than trivia, leveling
          up to systems you've been nodding along about in design reviews, or
          just the kind of person who'd rather build a mutex than read
          another blog post about one. If you have ten minutes and a thumb,
          you have a study session.
        </p>
      </section>

      {/* ---- differentiators ---- */}
      <section aria-label="what makes it different" className="border-t border-border bg-surface">
        <div className="mx-auto max-w-5xl px-6 py-14">
          <h2 className="text-center text-2xl font-bold text-foreground">
            What makes these different
          </h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="card">
                <div className="card-body">
                  <h3 className="font-semibold text-foreground">
                    <span className="mr-2" aria-hidden="true">{f.icon}</span>
                    {f.title}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- the courses ---- */}
      <section id="courses" aria-label="course catalog" className="mx-auto max-w-4xl px-6 py-14">
        <h2 className="text-center text-2xl font-bold text-foreground">The courses</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-sm text-muted-foreground">
          Jump straight in — no account needed. Each one opens with
          foundations and ends with a scored test mode.
        </p>
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {courses.map((course) => (
            <a
              key={course.id}
              href={courseHref(course.id)}
              className="card block transition-shadow hover:shadow-medium focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <div className="card-body">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="text-lg font-semibold text-foreground">{course.title}</h3>
                  {TAGLINES[course.id] && (
                    <span className="hidden shrink-0 font-mono text-xs text-muted-foreground sm:inline">
                      // {TAGLINES[course.id]}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{course.description}</p>
                {course.totalItems > 0 && (
                  <p className="mt-3 text-xs text-muted-foreground">{course.totalItems} exercises</p>
                )}
              </div>
            </a>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          More on the way — the whole course format is a reusable pattern.
        </p>
      </section>

      <footer className="border-t border-border py-10 text-center text-sm text-muted-foreground">
        a{" "}
        <a
          href="https://readysetcloud.io"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary-600 hover:text-primary-700"
        >
          Ready, Set, Cloud!
        </a>{" "}
        project · free forever · no tracking
      </footer>
    </div>
  );
}
