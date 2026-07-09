/* Component tests: login validation + friendly errors, and the RequireAuth
   gate redirecting signed-out visitors to /login. */

import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("../lib/config", () => ({
  getConfig: vi.fn(async () => ({ clientId: "client-1", region: "us-east-1", apiBase: "/api" }))
}));

vi.mock("../lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/auth")>();
  return { ...actual, signIn: vi.fn() };
});

import App from "../App";
import { AuthError, signIn } from "../lib/auth";

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );

beforeEach(() => {
  localStorage.clear();
  (signIn as Mock).mockReset();
});

describe("login form", () => {
  it("blocks invalid input client-side without calling the pool", async () => {
    renderAt("/login");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "not-an-email" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByText("Enter your password.")).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it("shows the friendly message on a wrong password", async () => {
    (signIn as Mock).mockRejectedValueOnce(
      new AuthError("Incorrect email or password.", "NotAuthorizedException")
    );
    renderAt("/login");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.co" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "WrongPass1" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    expect(await screen.findByText("Incorrect email or password.")).toBeInTheDocument();
    expect(signIn).toHaveBeenCalledWith("a@b.co", "WrongPass1");
  });
});

describe("RequireAuth", () => {
  it("redirects signed-out visitors from /profile to /login", async () => {
    renderAt("/profile");
    expect(await screen.findByRole("heading", { name: "Sign In" })).toBeInTheDocument();
  });
});
