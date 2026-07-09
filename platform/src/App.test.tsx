import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App";

describe("platform shell", () => {
  it("renders the hub with both courses", () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { name: "Courses" })).toBeInTheDocument();
    expect(screen.getByText("JavaScript Concurrency Bootcamp")).toBeInTheDocument();
    expect(screen.getByText("Distributed Systems Bootcamp")).toBeInTheDocument();
  });

  it("falls back to the hub for unknown routes", () => {
    render(
      <MemoryRouter initialEntries={["/definitely-not-a-page"]}>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { name: "Courses" })).toBeInTheDocument();
  });
});
