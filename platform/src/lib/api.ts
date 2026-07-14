/* Typed client for the backend API (/api/* behind the JWT authorizer).
   Every request carries a fresh id token; auth.ts owns refresh and the
   clear-session-on-definite-failure behavior, so a 401 here simply surfaces
   as an ApiError for the caller's error state. */

import { getFreshIdToken } from "@readysetcloud/ui/auth";
import { getConfig } from "./config";

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/* ---------- API shapes ----------
   Gamification (points, level, badges) is not served by this API — it lives in
   the shared cross-app badge chest (see src/lib/badges.ts). This API is
   progress-only: the course catalog and the caller's per-course progress. */

export interface CatalogCourse {
  id: string;
  title: string;
  description: string;
  status: string;
  totalItems: number;
  contentVersion: number;
}

export interface CourseCatalogResponse {
  courses: CatalogCourse[];
}

export interface MyCourse {
  courseId: string;
  version: number;
  status: "in-progress" | "completed";
  solvedCount: number;
  totalItems: number;
  percentComplete: number;
  startedAt: string;
  completedAt?: string;
  lastAccessedAt: string;
}

export interface MyCoursesResponse {
  courses: MyCourse[];
}

/* ---------- the client ---------- */

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const config = await getConfig();
  if (!config) throw new ApiError("Accounts aren't enabled on this deployment.", 0);
  const token = await getFreshIdToken();
  if (!token) throw new ApiError("You're signed out.", 401);
  let res: Response;
  try {
    res = await fetch(config.apiBase + path, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "content-type": "application/json" } : {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new ApiError("Network error — check your connection and try again.", 0);
  }
  if (!res.ok) throw new ApiError(`Request failed (${res.status}).`, res.status);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const get = <T>(path: string): Promise<T> => request<T>("GET", path);

/* Unauthenticated GET for the public catalog routes (docs/PLATFORM_PLAN.md
   P1). Works without auth-config: the API is same-origin, so /api is a
   sensible default; a disabled backend simply fails the fetch and callers
   fall back. */
export async function getPublic<T>(path: string): Promise<T> {
  const config = await getConfig();
  const base = config?.apiBase ?? "/api";
  let res: Response;
  try {
    res = await fetch(base + path);
  } catch {
    throw new ApiError("Network error — check your connection and try again.", 0);
  }
  if (!res.ok) throw new ApiError(`Request failed (${res.status}).`, res.status);
  return (await res.json()) as T;
}
export const put = <T>(path: string, body: unknown): Promise<T> => request<T>("PUT", path, body);
export const del = <T = void>(path: string): Promise<T> => request<T>("DELETE", path);
