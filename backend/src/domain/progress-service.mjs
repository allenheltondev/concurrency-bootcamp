/* Progress use-cases — the core of the backend. Pure domain: no AWS, no
   HTTP, no Powertools. Dependencies arrive as ports (repositories, clock),
   so the same service runs against DynamoDB in production and an in-memory
   fake in tests.

   Everything gamified is derived server-side from submitted progress —
   summaries, XP, streaks, badge awards — so nothing can drift and nothing
   can be forged by a client. */
import { CourseNotFoundError, OptimisticLockError, ProgressNotFoundError, VersionConflictError } from "./errors.mjs";
import { computeXp, meetsCriteria, nextStreak } from "./gamification.mjs";

const ZERO_PROFILE = {
  xp: 0, currentStreak: 0, longestStreak: 0, lastActivityDate: null,
  createdAt: null, lastSeenAt: null
};

export const createProgressService = ({ catalogRepository, userRepository, clock = () => new Date() }) => ({
  async getProfile(sub) {
    return { ...ZERO_PROFILE, ...((await userRepository.getProfile(sub)) ?? {}) };
  },

  listEarnedBadges: (sub) => userRepository.listEarnedBadges(sub),

  async listCourseSummaries(sub) {
    // Summaries only — the detail blob belongs to the single-course fetch.
    return (await userRepository.listProgress(sub)).map(({ detail, ...summary }) => summary);
  },

  async getCourseProgress(sub, courseId) {
    const progress = await userRepository.getProgress(sub, courseId);
    if (!progress) throw new ProgressNotFoundError(courseId);
    return progress;
  },

  async syncProgress(sub, courseId, { detail, version: clientVersion }) {
    // The course must exist — totalItems comes from its catalog entry.
    const course = await catalogRepository.getCourse(courseId);
    if (!course) throw new CourseNotFoundError(courseId);

    // One snapshot feeds versioning, stats, and badge awards.
    const { profile, progress: allExisting, earnedBadgeIds } = await userRepository.getUserSnapshot(sub);
    const existing = allExisting.find((p) => p.courseId === courseId);
    const otherProgress = allExisting.filter((p) => p.courseId !== courseId);

    const now = clock().toISOString();
    const totalItems = course.totalItems ?? 0;
    const solvedCount = Object.values(detail.solved).filter(Boolean).length;
    const percentComplete = totalItems ? Math.min(100, Math.floor((100 * solvedCount) / totalItems)) : 0;
    const status = totalItems && solvedCount >= totalItems ? "completed" : "in-progress";
    const expectedVersion = clientVersion ?? 0;

    const progress = {
      courseId,
      version: expectedVersion + 1,
      status,
      solvedCount,
      totalItems,
      percentComplete,
      startedAt: existing?.startedAt ?? now,
      // First completion is permanent — regressing below 100% never unsets it.
      completedAt: existing?.completedAt ?? (status === "completed" ? now : undefined),
      lastAccessedAt: now,
      detail
    };

    // Optimistic locking: the write only lands if the client wrote against
    // the version it read. Last-write-wins is what silently eats progress
    // when the same account is open on a phone and a laptop.
    try {
      await userRepository.saveProgress(sub, progress, expectedVersion);
    } catch (err) {
      if (!(err instanceof OptimisticLockError)) throw err;
      throw new VersionConflictError(await userRepository.getProgress(sub, courseId));
    }

    // Derived stats: recomputed from stored progress, never accumulated.
    const allProgress = [...otherProgress, progress];
    const { totalSolved, coursesCompleted, xp } = computeXp(allProgress);
    const streak = nextStreak(profile ?? {}, now.slice(0, 10));
    const stats = { xp, ...streak };
    await userRepository.saveProfile(sub, {
      createdAt: profile?.createdAt ?? now,
      lastSeenAt: now,
      ...stats
    });

    // Badge awards: evaluate the catalog against the fresh state.
    const ctx = { totalSolved, coursesCompleted, streak: streak.currentStreak, progress: allProgress };
    const newBadges = [];
    for (const badge of await catalogRepository.listBadges()) {
      if (earnedBadgeIds.has(badge.id) || !meetsCriteria(badge.criteria ?? {}, ctx)) continue;
      const awarded = await userRepository.awardBadge(sub, {
        id: badge.id, name: badge.name, icon: badge.icon,
        earnedAt: now,
        courseId: badge.criteria?.courseId
      });
      if (awarded) newBadges.push({ id: badge.id, name: badge.name, icon: badge.icon, description: badge.description });
    }

    const { detail: _detail, version, courseId: _courseId, ...summary } = progress;
    return {
      courseId,
      version,
      summary,
      stats,
      newBadges,
      completedNow: status === "completed" && existing?.status !== "completed"
    };
  },

  async resetProgress(sub, courseId) {
    await userRepository.deleteProgress(sub, courseId);
    // XP is derived, so a reset just recomputes it from what remains.
    // Badges are permanent and streaks reflect activity — both untouched.
    const { xp } = computeXp(await userRepository.listProgress(sub));
    await userRepository.setProfileXp(sub, xp, clock().toISOString());
  }
});
