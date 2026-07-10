/* Component tests for /profile: stat tiles, a course card joined with the
   catalog, and earned vs locked badges — all from a mocked api module and a
   real rsc:auth session document (so claims() is exercised for real). */

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("../lib/config", () => ({
  getConfig: vi.fn(async () => ({ clientId: "client-1", region: "us-east-1", apiBase: "/api" }))
}));

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, get: vi.fn() };
});

import App from "../App";
import { get } from "../lib/api";

const FIXTURES: Record<string, unknown> = {
  "/me": {
    xp: 1250,
    currentStreak: 4,
    longestStreak: 9,
    lastActivityDate: "2026-07-08",
    createdAt: "2026-06-01T00:00:00Z",
    lastSeenAt: "2026-07-08T00:00:00Z"
  },
  "/me/courses": {
    courses: [
      {
        courseId: "js-concurrency",
        version: 3,
        status: "in-progress",
        solvedCount: 12,
        totalItems: 34,
        percentComplete: 35,
        startedAt: "2026-06-10T00:00:00Z",
        lastAccessedAt: "2026-07-08T00:00:00Z"
      }
    ]
  },
  "/courses": {
    courses: [
      {
        id: "js-concurrency",
        title: "JavaScript Concurrency Bootcamp",
        description: "The event loop up through workers & atomics.",
        status: "live",
        totalItems: 34,
        contentVersion: 3
      }
    ]
  },
  "/badges": {
    badges: [
      { id: "first-solve", name: "First Solve", icon: "🥇", description: "Solve your first exercise", criteria: {} },
      { id: "night-owl", name: "Night Owl", icon: "🦉", description: "Solve one after midnight", criteria: {} }
    ]
  },
  "/me/badges": {
    badges: [{ id: "first-solve", name: "First Solve", icon: "🥇", earnedAt: "2026-07-01T12:00:00Z" }]
  }
};

const idToken = `header.${btoa(
  JSON.stringify({ email: "allen@example.com", given_name: "Allen", family_name: "Helton", sub: "u-1" })
)}.sig`;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(
    "rsc:auth",
    JSON.stringify({ idToken, refreshToken: "rt-1", expiresAt: Math.floor(Date.now() / 1000) + 3600 })
  );
  (get as Mock).mockReset().mockImplementation(async (path: string) => {
    if (path in FIXTURES) return FIXTURES[path];
    throw new Error(`unexpected path ${path}`);
  });
});

describe("profile page", () => {
  it("renders the header, stat tiles, a joined course card, and earned/locked badges", async () => {
    render(
      <MemoryRouter initialEntries={["/profile"]}>
        <App />
      </MemoryRouter>
    );

    // page title (identity + sign-out now live in the shared AppNav)
    expect(await screen.findByRole("heading", { name: "Your progress" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open profile menu" })).toBeInTheDocument();

    // stat tiles
    expect(await screen.findByText("1250")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText("Current streak")).toBeInTheDocument();
    expect(screen.getByText("Longest streak")).toBeInTheDocument();

    // course card joined with the catalog
    expect(screen.getByText("JavaScript Concurrency Bootcamp")).toBeInTheDocument();
    expect(screen.getByText("12/34 solved · 35%")).toBeInTheDocument();
    expect(screen.getByText("in progress")).toBeInTheDocument();
    const resume = screen.getByRole("link", { name: "Resume →" });
    expect(resume).toHaveAttribute("href", "/js-concurrency/");

    // badges: earned in full color with its date, the rest locked with hint
    expect(screen.getByText("First Solve")).toBeInTheDocument();
    expect(screen.getByText(/^Earned /)).toBeInTheDocument();
    expect(screen.getByText("Night Owl")).toBeInTheDocument();
    expect(screen.getByText(/Solve one after midnight/)).toBeInTheDocument();
  });

  it("shows the friendly empty state when no courses are started", async () => {
    (get as Mock).mockImplementation(async (path: string) => {
      if (path === "/me/courses") return { courses: [] };
      if (path in FIXTURES) return FIXTURES[path];
      throw new Error(`unexpected path ${path}`);
    });
    render(
      <MemoryRouter initialEntries={["/profile"]}>
        <App />
      </MemoryRouter>
    );
    expect(
      await screen.findByText("Start a course to see progress here.")
    ).toBeInTheDocument();
  });
});
