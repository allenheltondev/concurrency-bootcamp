/* The hub — the signed-in dashboard at /app: every course as a card with
   the member's progress woven in. Sits behind RequireAuth; the public
   front door is the marketing page at the root. */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@readysetcloud/ui/auth";
import { get, type MyCourse, type MyCoursesResponse } from "../lib/api";
import { TAGLINES, useCatalog } from "../lib/catalog";
import { courseHref } from "../lib/courses";

function ProgressStrip({ progress }: { progress: MyCourse }) {
  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between text-xs text-muted-foreground">
        <span>
          {progress.status === "completed" ? (
            <span className="font-medium text-success-600">completed</span>
          ) : (
            <>
              <b className="text-foreground">{progress.solvedCount}</b> of {progress.totalItems} solved
            </>
          )}
        </span>
        <span>{progress.percentComplete}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${progress.status === "completed" ? "bg-success-500" : "bg-primary-600"}`}
          style={{ width: `${progress.percentComplete}%` }}
        />
      </div>
    </div>
  );
}

export default function Hub() {
  const { signedIn, user } = useAuth();
  const courses = useCatalog();
  const [progress, setProgress] = useState<Record<string, MyCourse>>({});

  useEffect(() => {
    if (!signedIn) return; // signed-out progress is derived away at render
    let live = true;
    get<MyCoursesResponse>("/me/courses")
      .then((r) => {
        if (live) setProgress(Object.fromEntries(r.courses.map((c) => [c.courseId, c])));
      })
      .catch(() => {}); // progress is a garnish here — the hub renders without it
    return () => { live = false; };
  }, [signedIn]);

  const firstName = signedIn ? user.given_name : undefined;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <nav className="mb-12 flex items-center justify-between text-sm">
        <Link to="/" className="font-medium uppercase tracking-widest text-primary-600 hover:text-primary-700">
          Ready, Set, Cloud!
        </Link>
        <Link to="/app/profile" className="font-medium text-primary-600 hover:text-primary-700">
          ◉ {firstName ?? "profile"}
        </Link>
      </nav>

      <header className="mb-10 text-center">
        <h1 className="text-3xl font-bold text-foreground sm:text-4xl">Your courses</h1>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Pick up where you left off — progress follows you across devices.
        </p>
      </header>

      <section aria-label="course catalog" className="grid gap-5">
        {courses.map((course) => {
          const mine = signedIn ? progress[course.id] : undefined;
          return (
            <a
              key={course.id}
              href={courseHref(course.id)}
              className="card block transition-shadow hover:shadow-medium focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <div className="card-body">
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="text-lg font-semibold text-foreground">{course.title}</h2>
                  {TAGLINES[course.id] && (
                    <span className="hidden shrink-0 font-mono text-xs text-muted-foreground sm:inline">
                      // {TAGLINES[course.id]}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{course.description}</p>
                {mine ? (
                  <ProgressStrip progress={mine} />
                ) : (
                  course.totalItems > 0 && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      {course.totalItems} exercises
                    </p>
                  )
                )}
              </div>
            </a>
          );
        })}
      </section>

      <footer className="mt-12 text-center text-sm text-muted-foreground">
        a{" "}
        <a
          href="https://readysetcloud.io"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary-600 hover:text-primary-700"
        >
          Ready, Set, Cloud!
        </a>{" "}
        project
      </footer>
    </main>
  );
}
