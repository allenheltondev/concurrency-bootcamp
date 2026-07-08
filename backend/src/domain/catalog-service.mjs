/* Catalog use-cases. The repository is a port — anything with
   listCourses/getCourse/listBadges satisfies it. */
import { CourseNotFoundError } from "./errors.mjs";

export const createCatalogService = ({ catalogRepository }) => ({
  listCourses: () => catalogRepository.listCourses(),

  listBadges: () => catalogRepository.listBadges(),

  async getCourse(courseId) {
    const course = await catalogRepository.getCourse(courseId);
    if (!course) throw new CourseNotFoundError(courseId);
    return course;
  }
});
