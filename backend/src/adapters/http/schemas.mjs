/* zod schemas, plugged into the event-handler's route validation (Standard
   Schema) — invalid requests are rejected before a handler runs. */
import { z } from "zod";

export const courseIdParams = z.object({
  courseId: z.string().regex(/^[a-z0-9-]{1,64}$/, "invalid course id")
});

const MAX_MISSES = 50; // matches the app's own cap

/* The body of PUT /api/me/courses/{courseId}. `detail` is the same document
   the app keeps in localStorage ({ solved, position, misses }) — the app owns
   its internal shape, so values stay loose while the envelope stays strict. */
export const progressBody = z.object({
  version: z.number().int().nonnegative().optional(),
  detail: z.object({
    solved: z.record(z.string(), z.unknown()),
    position: z.record(z.string(), z.unknown()).optional(),
    misses: z.array(z.unknown()).max(MAX_MISSES).optional()
  })
});
