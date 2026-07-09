/* The hub — the site's front door at the root URL: every course as a card,
   with the visitor's own progress woven in when signed in. Fully public;
   the catalog comes from the (unauthenticated) API and falls back to a
   static list when the backend is dark or unreachable, so the page renders
   in every deployment mode. */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { get, getPublic, type CatalogCourse, type CourseCatalogResponse, type MyCourse, type MyCoursesResponse } from "../lib/api";
import { courseHref } from "../lib/courses";

/* Mirrors backend/data/courses.json — the render-something-immediately (and
   backend-dark) fallback. The taglines are course branding, not catalog
   data, so they live here either way. */
const FALLBACK_COURSES: CatalogCourse[] = [
  {
    id: "js-concurrency",
    title: "JavaScript Concurrency Bootcamp",
    description:
      "Learn and practice JavaScript concurrency from the event loop up: animated lessons, tap-driven drills for every primitive, spot-the-bug and write-it modules, durable-execution hazards, and a scored test mode.",
    status: "active",
    totalItems: 0,
    contentVersion: 0
  },
  {
    id: "distributed-systems",
    title: "Distributed Systems Bootcamp",
    description:
      "Learn and practice distributed systems from the unreliable network up: animated lessons on clocks, quorums, consensus, and delivery guarantees; tap-driven drills that run a simulated cluster; spot-the-bug and write-it modules; and a scored test mode.",
    status: "active",
    totalItems: 0,
    contentVersion: 0
  }
];

const TAGLINES: Record<string, string> = {
  "js-concurrency": "single thread, many turns",
  "distributed-systems": "many nodes, no shared clock"
};

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
  const { signedIn, user, configured } = useAuth();
  const [courses, setCourses] = useState<CatalogCourse[]>(FALLBACK_COURSES);
  const [progress, setProgress] = useState<Record<string, MyCourse>>({});

  useEffect(() => {
    let live = true;
    getPublic<CourseCatalogResponse>("/courses")
      .then((r) => {
        if (live && r.courses.length) setCourses(r.courses.filter((c) => c.status === "active"));
      })
      .catch(() => {}); // dark backend / offline: the fallback list stands
    return () => { live = false; };
  }, []);

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
        <span className="font-medium uppercase tracking-widest text-primary-600">
          Ready, Set, Cloud!
        </span>
        {configured !== false && (
          signedIn ? (
            <Link to="/profile" className="font-medium text-primary-600 hover:text-primary-700">
              ◉ {firstName ?? "profile"}
            </Link>
          ) : (
            <Link to="/login" className="font-medium text-primary-600 hover:text-primary-700">
              sign in
            </Link>
          )
        )}
      </nav>

      <header className="mb-10 text-center">
        <h1 className="text-3xl font-bold text-foreground sm:text-4xl">Courses</h1>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Hands-on, tap-driven bootcamps. Free, offline-friendly, and your
          progress follows you across devices when you sign in.
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
