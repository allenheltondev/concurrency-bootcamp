import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@readysetcloud/ui/auth";
import {
  get,
  type BadgeCatalogResponse,
  type CatalogBadge,
  type CatalogCourse,
  type CourseCatalogResponse,
  type EarnedBadge,
  type MeStats,
  type MyBadgesResponse,
  type MyCourse,
  type MyCoursesResponse
} from "../lib/api";
import { courseHref } from "../lib/courses";
import { useConfigured } from "../lib/useConfigured";

/* /profile — the signed-in gradebook: XP/streak stat tiles, per-course
   progress cards (GET /me/courses joined with the public catalog), and the
   badge case (GET /badges joined with GET /me/badges: earned in full color,
   the rest locked with their description as the hint). */


const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

interface ProfileData {
  me: MeStats;
  myCourses: MyCourse[];
  catalog: CatalogCourse[];
  allBadges: CatalogBadge[];
  earned: EarnedBadge[];
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: ProfileData };

async function loadProfile(): Promise<ProfileData> {
  const [me, mine, catalog, badges, earned] = await Promise.all([
    get<MeStats>("/me"),
    get<MyCoursesResponse>("/me/courses"),
    get<CourseCatalogResponse>("/courses"),
    get<BadgeCatalogResponse>("/badges"),
    get<MyBadgesResponse>("/me/badges")
  ]);
  return {
    me,
    myCourses: mine.courses,
    catalog: catalog.courses,
    allBadges: badges.badges,
    earned: earned.badges
  };
}

export default function Profile() {
  const { user, signOut } = useAuth();
  const configured = useConfigured();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (configured === false) return;
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

  const name = [user.given_name, user.family_name].filter(Boolean).join(" ") || user.email || "Your profile";

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
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">{name}</h1>
          {user.email && <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>}
        </div>
        <button
          type="button"
          onClick={() => {
            void signOut();
            navigate("/");
          }}
          className="btn border-border bg-surface text-foreground hover:bg-muted"
        >
          Sign out
        </button>
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
      <div className="grid grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card h-24" />
        ))}
      </div>
      <div className="mt-10 h-5 w-32 rounded bg-muted" />
      <div className="card mt-4 h-36" />
      <div className="mt-10 h-5 w-24 rounded bg-muted" />
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card h-32" />
        ))}
      </div>
    </div>
  );
}

function ProfileBody({ data }: { data: ProfileData }) {
  const { me, myCourses, catalog, allBadges, earned } = data;
  const catalogById = new Map(catalog.map((c) => [c.id, c]));
  const earnedById = new Map(earned.map((b) => [b.id, b]));

  const tiles = [
    { label: "XP", value: me.xp },
    { label: "Current streak", value: me.currentStreak },
    { label: "Longest streak", value: me.longestStreak }
  ];

  return (
    <>
      <section aria-label="stats" className="grid grid-cols-3 gap-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="card">
            <div className="card-body px-3 text-center">
              <p className="text-3xl font-bold text-foreground">{tile.value}</p>
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {tile.label}
              </p>
            </div>
          </div>
        ))}
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

      <section aria-label="badges" className="mt-10">
        <h2 className="text-lg font-semibold text-foreground">Badges</h2>
        {allBadges.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No badges to show yet.</p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {allBadges.map((badge) => {
              const earnedBadge = earnedById.get(badge.id);
              return (
                <div key={badge.id} className={`card ${earnedBadge ? "" : "opacity-60"}`}>
                  <div className="card-body px-4 py-4 text-center">
                    <div
                      aria-hidden="true"
                      className={`text-3xl ${earnedBadge ? "" : "opacity-50 grayscale"}`}
                    >
                      {badge.icon}
                    </div>
                    <p className="mt-2 text-sm font-medium text-foreground">{badge.name}</p>
                    {earnedBadge ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Earned {fmtDate(earnedBadge.earnedAt)}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">🔒 {badge.description}</p>
                    )}
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
