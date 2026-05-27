import {
  cleanup,
  fireEvent,
  render,
  screen,
  act,
  within
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { essayContents } from "./data/typingContent";

describe("App home", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("filters the essay chooser from the search field", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Essay practice/i }));

    const search = screen.getByRole("searchbox", { name: "Search essays" });
    fireEvent.change(search, { target: { value: "startup" } });

    const expectedMatches = essayContents.filter((content) =>
      [content.title, content.author, content.description]
        .join(" ")
        .toLowerCase()
        .includes("startup")
    );
    const essayList = screen.getByRole("region", { name: "Essay list" });

    expect(search).toHaveValue("startup");
    expect(screen.getByText(`${expectedMatches.length} shown`)).toBeInTheDocument();
    expect(within(essayList).getAllByRole("button")).toHaveLength(
      expectedMatches.length
    );
  });

  it("restores paused essay progress when the essay is opened again", () => {
    const essay = essayContents[0];

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Essay practice/i }));
    fireEvent.click(
      within(screen.getByRole("region", { name: "Essay list" })).getByRole(
        "button",
        { name: new RegExp(essay.title, "i") }
      )
    );

    fireEvent.keyDown(screen.getByLabelText("Typing capture input"), {
      key: essay.text[0]
    });
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));

    const storedProgress = JSON.parse(
      window.localStorage.getItem("typingjourney:essay-progress") ?? "{}"
    );

    expect(storedProgress[essay.id].entries).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("Paused");

    cleanup();
    window.history.replaceState({}, "", "/");
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Essay practice/i }));
    expect(screen.getByText("1% saved")).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByRole("region", { name: "Essay list" })).getByRole(
        "button",
        { name: new RegExp(essay.title, "i") }
      )
    );

    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it("opens stored essay progress on the typing route instead of the timed default", () => {
    const essay = essayContents[0];

    window.history.replaceState({}, "", "/typing");
    window.localStorage.setItem(
      "typingjourney:last-practice",
      JSON.stringify({ mode: "essay", essayId: essay.id })
    );
    window.localStorage.setItem(
      "typingjourney:essay-progress",
      JSON.stringify({
        [essay.id]: {
          essayId: essay.id,
          entries: [
            {
              expected: essay.text[0],
              actual: essay.text[0],
              correct: true
            }
          ],
          mistakes: [],
          elapsedMs: 2_000,
          updatedAt: 2_000
        }
      })
    );

    render(<App />);

    expect(screen.getByRole("heading", { name: essay.title })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "1 minute test" })).not.toBeInTheDocument();
  });

  it("automatically pauses an active essay after 15 seconds without typing", () => {
    const essay = essayContents[0];

    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Essay practice/i }));
    fireEvent.click(
      within(screen.getByRole("region", { name: "Essay list" })).getByRole(
        "button",
        { name: new RegExp(essay.title, "i") }
      )
    );
    fireEvent.keyDown(screen.getByLabelText("Typing capture input"), {
      key: essay.text[0]
    });

    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(14_999);
    });

    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Paused");

    const storedProgress = JSON.parse(
      window.localStorage.getItem("typingjourney:essay-progress") ?? "{}"
    );

    expect(storedProgress[essay.id].entries).toHaveLength(1);
  });
});
