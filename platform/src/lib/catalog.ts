/* The public course catalog, shared by the marketing page and the app hub:
   fetched from the unauthenticated API with a static fallback that mirrors
   backend/data/courses.json, so both pages render in every deployment mode
   (dark backend, offline, local dev). */
import { useEffect, useState } from "react";
import { getPublic, type CatalogCourse, type CourseCatalogResponse } from "./api";

export const FALLBACK_COURSES: CatalogCourse[] = [
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
  },
  {
    id: "agent-memory",
    title: "Agent Memory Bootcamp",
    description:
      "Learn and practice AI agent memory from the stateless model up: animated lessons on session buffers, retrieval scoring, and long-term memory that evolves; tap-driven drills that run a simulated memory system; an evolving-profile simulator; spot-the-bug and write-it modules; and a scored test mode.",
    status: "active",
    totalItems: 0,
    contentVersion: 0
  }
];

/* Course branding, not catalog data — lives with the UI either way. */
export const TAGLINES: Record<string, string> = {
  "js-concurrency": "single thread, many turns",
  "distributed-systems": "many nodes, no shared clock",
  "agent-memory": "context is not memory"
};

export function useCatalog(): CatalogCourse[] {
  const [courses, setCourses] = useState<CatalogCourse[]>(FALLBACK_COURSES);
  useEffect(() => {
    let live = true;
    getPublic<CourseCatalogResponse>("/courses")
      .then((r) => {
        if (live && r.courses.length) setCourses(r.courses.filter((c) => c.status === "active"));
      })
      .catch(() => {}); // dark backend / offline: the fallback list stands
    return () => { live = false; };
  }, []);
  return courses;
}
