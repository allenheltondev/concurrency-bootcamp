/* Driving adapter: catalog routes. Thin by design — validate, call the
   service, shape the response. */
import { courseIdParams } from "./schemas.mjs";

export const registerCatalogRoutes = (app, { catalogService }) => {
  app.get("/courses", async () => ({ courses: await catalogService.listCourses() }));

  app.get("/courses/:courseId", async (reqCtx) =>
    catalogService.getCourse(reqCtx.valid.req.path.courseId),
  { validation: { req: { path: courseIdParams } } });
};
