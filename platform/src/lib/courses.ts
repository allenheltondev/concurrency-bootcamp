/* Course-id -> site path. Courses live as static sibling apps
   (docs/adr/0001-static-course-content.md); the fallback keeps future
   courses working the day their directory ships. */
const COURSE_LINKS: Record<string, string> = {
  "js-concurrency": "/js-concurrency/",
  "distributed-systems": "/distributed-systems/"
};

export const courseHref = (courseId: string): string =>
  COURSE_LINKS[courseId] ?? `/${courseId}/`;
