/* Gamification rules: XP formula, streak arithmetic, badge criteria.
   Everything here is derived from stored progress — recomputed, never
   accumulated — so it can't drift and survives resets coherently. */

export const XP_PER_SOLVED = 10;
export const XP_PER_COMPLETED_COURSE = 250;

export const computeXp = (progressItems) => {
  const totalSolved = progressItems.reduce((n, p) => n + (p.solvedCount ?? 0), 0);
  const coursesCompleted = progressItems.filter((p) => p.status === "completed").length;
  return {
    totalSolved,
    coursesCompleted,
    xp: totalSolved * XP_PER_SOLVED + coursesCompleted * XP_PER_COMPLETED_COURSE
  };
};

/* UTC-day streaks: same day -> unchanged, yesterday -> +1, older -> reset.
   A timezone preference on the profile can refine this later. */
export const nextStreak = (profile, todayIso) => {
  const yesterday = new Date(new Date(`${todayIso}T00:00:00Z`).getTime() - 86_400_000)
    .toISOString().slice(0, 10);
  let currentStreak = 1;
  if (profile.lastActivityDate === todayIso) currentStreak = profile.currentStreak ?? 1;
  else if (profile.lastActivityDate === yesterday) currentStreak = (profile.currentStreak ?? 0) + 1;
  return {
    currentStreak,
    longestStreak: Math.max(currentStreak, profile.longestStreak ?? 0),
    lastActivityDate: todayIso
  };
};

/* Declarative badge criteria — one case per type; adding a badge type is one
   more case here plus a JSON entry in backend/data/badges.json. */
export const meetsCriteria = (criteria, ctx) => {
  const inScope = criteria.courseId
    ? ctx.progress.filter((p) => p.courseId === criteria.courseId)
    : ctx.progress;
  switch (criteria.type) {
    case "total-solved": return ctx.totalSolved >= criteria.count;
    case "streak": return ctx.streak >= criteria.days;
    case "courses-completed": return ctx.coursesCompleted >= criteria.count;
    case "course-started": return inScope.some((p) => p.solvedCount > 0);
    case "percent-complete": return inScope.some((p) => p.percentComplete >= criteria.threshold);
    case "course-completed": return inScope.some((p) => p.status === "completed");
    default: return false; // unknown type: never award rather than misaward
  }
};
