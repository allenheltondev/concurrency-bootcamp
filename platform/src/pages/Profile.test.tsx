/* Component tests for /profile: the shared BadgeChest (mocked to its data) and a
   course card joined with the catalog — from a mocked api + badges module and a
   real rsc:auth session document (so claims() is exercised for real). */

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("../lib/config", () => ({
  CORE_API_DEFAULT: "https://api.readysetcloud.io",
  getConfig: vi.fn(async () => ({
    clientId: "client-1",
    region: "us-east-1",
    apiBase: "/api",
    coreApiBase: "https://api.readysetcloud.io"
  }))
}));

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, get: vi.fn() };
});

/* The badge chest comes from the central Core API via lib/badges; stub it so the
   test doesn't reach the network or depend on <BadgeChest>'s internals. */
vi.mock("../lib/badges", () => ({
  getChest: vi.fn(),
  recordVisit: vi.fn(async () => {})
}));

/* Stub only <BadgeChest> from the design system; AppNav etc. stay real. */
vi.mock("@readysetcloud/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@readysetcloud/ui")>();
  return {
    ...actual,
    BadgeChest: (props: { points?: number; levelName?: string; badges?: { id: string; name: string }[] }) => (
      <div>
        <p>{props.points} points</p>
        <p>{props.levelName}</p>
        {(props.badges ?? []).map((b) => (
          <span key={b.id}>{b.name}</span>
        ))}
      </div>
    )
  };
});

import App from "../App";
import { get } from "../lib/api";
import { getChest } from "../lib/badges";

const FIXTURES: Record<string, unknown> = {
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
  }
};

const CHEST = {
  points: 320,
  level: 3,
  levelName: "Cloud Builder",
  badges: [{ id: "bug-hunter", name: "Bug Hunter", icon: "🐛" }],
  inProgress: []
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
  (getChest as Mock).mockReset().mockResolvedValue(CHEST);
});

describe("profile page", () => {
  it("renders the header, the central badge chest, and a joined course card", async () => {
    render(
      <MemoryRouter initialEntries={["/profile"]}>
        <App />
      </MemoryRouter>
    );

    // page title (identity + sign-out live in the shared AppNav)
    expect(await screen.findByRole("heading", { name: "Your progress" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open profile menu" })).toBeInTheDocument();

    // central chest: points, level, and an earned badge
    expect(await screen.findByText("320 points")).toBeInTheDocument();
    expect(screen.getByText("Cloud Builder")).toBeInTheDocument();
    expect(screen.getByText("Bug Hunter")).toBeInTheDocument();

    // course card joined with the catalog
    expect(screen.getByText("JavaScript Concurrency Bootcamp")).toBeInTheDocument();
    expect(screen.getByText("12/34 solved · 35%")).toBeInTheDocument();
    expect(screen.getByText("in progress")).toBeInTheDocument();
    const resume = screen.getByRole("link", { name: "Resume →" });
    expect(resume).toHaveAttribute("href", "/js-concurrency/");
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
