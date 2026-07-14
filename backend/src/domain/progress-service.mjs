/* Progress use-cases — the core of the backend. Pure domain: no AWS, no
   HTTP, no Powertools. Dependencies arrive as ports (repositories, clock),
   so the same service runs against DynamoDB in production and an in-memory
   fake in tests.

   Course summaries are derived server-side from submitted progress, so they
   can't drift or be forged. Gamification (badges, points, levels) is no longer
   computed here — it lives in the shared cross-app Ready, Set, Cloud badge
   chest; the app emits activity to it directly (see docs/badges/README.md). */
import { CourseNotFoundError, OptimisticLockError, ProgressNotFoundError, VersionConflictError } from "./errors.mjs";

const ZERO_PROFILE = { createdAt: null, lastSeenAt: null };

export const createProgressService = ({ catalogRepository, userRepository, clock = () => new Date() }) => ({
  async getProfile(sub) {
    return { ...ZERO_PROFILE, ...((await userRepository.getProfile(sub)) ?? {}) };
  },

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

    const [existing, profile] = await Promise.all([
      userRepository.getProgress(sub, courseId),
      userRepository.getProfile(sub)
    ]);

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

    // Touch the profile so createdAt/lastSeenAt stay current.
    await userRepository.saveProfile(sub, { createdAt: profile?.createdAt ?? now, lastSeenAt: now });

    const { detail: _detail, version, courseId: _courseId, ...summary } = progress;
    return {
      courseId,
      version,
      summary,
      completedNow: status === "completed" && existing?.status !== "completed"
    };
  },

  // Reset one course; the profile and any other courses are untouched.
  resetProgress: (sub, courseId) => userRepository.deleteProgress(sub, courseId),

  /* Full erasure — unlike a course reset, nothing survives: profile and all
     progress go. The user's next sync starts from zero. */
  deleteAccountData: (sub) => userRepository.deleteAllUserData(sub)
});
