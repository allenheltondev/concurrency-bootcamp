/* Domain errors — the core's vocabulary for "this can't happen". They carry
   no HTTP or storage knowledge; the http adapter maps them to status codes
   and the DynamoDB adapter raises them from storage-level failures. */

export class CourseNotFoundError extends Error {
  constructor(courseId) {
    super(`no course '${courseId}'`);
    this.name = "CourseNotFoundError";
    this.courseId = courseId;
  }
}

export class ProgressNotFoundError extends Error {
  constructor(courseId) {
    super(`no progress in '${courseId}'`);
    this.name = "ProgressNotFoundError";
    this.courseId = courseId;
  }
}

/* Raised by the DAL when a conditional write loses the race. */
export class OptimisticLockError extends Error {
  constructor() {
    super("conditional write failed");
    this.name = "OptimisticLockError";
  }
}

/* Raised by the domain with the current document attached, so the caller can
   merge and retry. */
export class VersionConflictError extends Error {
  constructor(current) {
    super("version conflict — merge with current and retry");
    this.name = "VersionConflictError";
    this.current = current;
  }
}
