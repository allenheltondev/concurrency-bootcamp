import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BadgeChest } from "@readysetcloud/ui";
import {
  get,
  type CatalogCourse,
  type CourseCatalogResponse,
  type MyCourse,
  type MyCoursesResponse
} from "../lib/api";
import { getChest, recordVisit, type Chest } from "../lib/badges";
import { courseHref } from "../lib/courses";
import { useConfigured } from "../lib/useConfigured";

/* /profile — the signed-in gradebook: the shared cross-app BadgeChest (points,
   level, earned + in-progress badges from GET /badges/me) plus per-course
   progress cards (GET /me/courses joined with the public catalog). Gamification
   is owned by the central rsc-core engine — see docs/badges/README.md. */

interface ProfileData {
  myCourses: MyCourse[];
  catalog: CatalogCourse[];
  chest: Chest;
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: ProfileData };

async function loadProfile(): Promise<ProfileData> {
  const [mine, catalog, chest] = await Promise.all([
    get<MyCoursesResponse>("/me/courses"),
    get<CourseCatalogResponse>("/courses"),
    getChest()
  ]);
  return { myCourses: mine.courses, catalog: catalog.courses, chest };
}

export default function Profile() {
  const configured = useConfigured();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (configured === false) return;
    void recordVisit();
    let live = true;
    loadProfile().then(
      (data) => {
        if (live) setState({ status: "ready", data });
      },
      (err: unknown) => {
        if (live) {
          setState({
            status: "error",
            message:
              err instanceof Error ? err.message : "Something went wrong — please try again."
          });
        }
      }
    );
    return () => {
      live = false;
    };
  }, [configured, attempt]);

  if (configured === false) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <div className="card">
          <div className="card-body text-center">
            <h1 className="text-xl font-bold text-foreground">Profile</h1>
            <p className="mt-2 text-muted-foreground">
              Accounts aren&apos;t enabled on this deployment.
            </p>
            <Link
              to="/"
              className="mt-3 inline-block font-medium text-primary-600 hover:text-primary-700"
            >
              Back to courses →
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Your progress</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Points, level, and badges across every Ready, Set, Cloud app.
        </p>
      </header>

      {state.status === "loading" && <ProfileSkeleton />}

      {state.status === "error" && (
        <div className="card">
          <div className="card-body text-center">
            <p className="text-muted-foreground">{state.message}</p>
            <button
              type="button"
              onClick={() => {
                setState({ status: "loading" });
                setAttempt((a) => a + 1);
              }}
              className="btn-primary mt-4"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {state.status === "ready" && <ProfileBody data={state.data} />}
    </main>
  );
}

function ProfileSkeleton() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <div className="card h-40" />
      <div className="mt-10 h-5 w-32 rounded bg-muted" />
      <div className="card mt-4 h-36" />
    </div>
  );
}

function ProfileBody({ data }: { data: ProfileData }) {
  const { myCourses, catalog, chest } = data;
  const catalogById = new Map(catalog.map((c) => [c.id, c]));

  return (
    <>
      <section aria-label="badges">
        <BadgeChest {...chest} />
      </section>

      <section aria-label="my courses" className="mt-10">
        <h2 className="text-lg font-semibold text-foreground">My courses</h2>
        {myCourses.length === 0 ? (
          <div className="card mt-4">
            <div className="card-body text-center">
              <p className="text-muted-foreground">Start a course to see progress here.</p>
              <Link
                to="/"
                className="mt-2 inline-block font-medium text-primary-600 hover:text-primary-700"
              >
                Browse courses →
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid gap-4">
            {myCourses.map((mine) => {
              const course = catalogById.get(mine.courseId);
              const completed = mine.status === "completed";
              const pct = Math.min(100, Math.max(0, Math.round(mine.percentComplete)));
              return (
                <div key={mine.courseId} className="card">
                  <div className="card-body">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-semibold text-foreground">
                        {course?.title ?? mine.courseId}
                      </h3>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                          completed
                            ? "bg-success-500/15 text-success-600"
                            : "bg-primary-500/15 text-primary-600"
                        }`}
                      >
                        {completed ? "completed" : "in progress"}
                      </span>
                    </div>
                    {course?.description && (
                      <p className="mt-1 text-sm text-muted-foreground">{course.description}</p>
                    )}
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${completed ? "bg-success-500" : "bg-primary-600"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {mine.solvedCount}/{mine.totalItems} solved · {pct}%
                      </span>
                      <a
                        href={courseHref(mine.courseId)}
                        className="font-medium text-primary-600 hover:text-primary-700"
                      >
                        {completed ? "Revisit →" : "Resume →"}
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
