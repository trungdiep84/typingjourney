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

function typeIntoCapture(text: string) {
  const captureInput = screen.getByLabelText("Typing capture input");

  for (const char of text) {
    fireEvent.keyDown(captureInput, {
      key: char === "\n" ? "Enter" : char
    });
  }
}

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

  it("filters the essay journey to saved essays", () => {
    const essay = essayContents[0];

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

    fireEvent.click(screen.getByRole("button", { name: /Essay practice/i }));
    fireEvent.click(screen.getByRole("button", { name: /Saved\s*1/ }));

    const essayList = screen.getByRole("region", { name: "Essay list" });
    const savedRows = within(essayList).getAllByRole("button");

    expect(savedRows).toHaveLength(1);
    expect(savedRows[0]).toHaveTextContent(essay.title);
    expect(savedRows[0]).toHaveTextContent("In progress");
  });

  it("records custom text results in local progress history", () => {
    const customText =
      "Typing Journey custom text makes deliberate practice personal.";

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Custom text/i }));
    fireEvent.change(screen.getByLabelText("Custom practice text"), {
      target: { value: customText }
    });
    fireEvent.click(screen.getByRole("button", { name: "Start custom" }));
    typeIntoCapture(customText);

    expect(
      screen.getByRole("region", { name: "Challenge results" })
    ).toBeInTheDocument();
    expect(screen.getByText("Custom complete")).toBeInTheDocument();
    expect(screen.getByText("Coach notes")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Choose another practice" }));

    expect(screen.getByRole("region", { name: "Progress history" })).toHaveTextContent(
      "1"
    );

    const storedHistory = JSON.parse(
      window.localStorage.getItem("typingjourney:session-history") ?? "[]"
    );

    expect(storedHistory[0]).toEqual(
      expect.objectContaining({
        mode: "custom",
        typedChars: customText.length
      })
    );
  });

  it("counts every miss in results even when only top hotspots are shown", () => {
    const customText =
      "abcdefghijklmnopqrstuvwxyz typing journey custom misses test.";

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Custom text/i }));
    fireEvent.change(screen.getByLabelText("Custom practice text"), {
      target: { value: customText }
    });
    fireEvent.click(screen.getByRole("button", { name: "Start custom" }));

    const captureInput = screen.getByLabelText("Typing capture input");

    for (let index = 0; index < 4; index += 1) {
      fireEvent.keyDown(captureInput, { key: String(index + 1) });
      fireEvent.keyDown(captureInput, { key: "Backspace" });
      fireEvent.keyDown(captureInput, { key: customText[index] });
    }

    typeIntoCapture(customText.slice(4));

    expect(screen.getByLabelText("Typing summary")).toHaveTextContent("4misses");
    expect(screen.getByRole("region", { name: "Mistake hotspots" })).toHaveTextContent(
      "1"
    );
  });

  it("pauses custom practice after idle time and clears stale last practice", () => {
    const customText =
      "Typing Journey custom text should pause when practice goes idle.";

    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    window.localStorage.setItem(
      "typingjourney:last-practice",
      JSON.stringify({ mode: "essay", essayId: essayContents[0].id })
    );
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Custom text/i }));
    fireEvent.change(screen.getByLabelText("Custom practice text"), {
      target: { value: customText }
    });
    fireEvent.click(screen.getByRole("button", { name: "Start custom" }));
    fireEvent.keyDown(screen.getByLabelText("Typing capture input"), {
      key: customText[0]
    });

    expect(window.localStorage.getItem("typingjourney:last-practice")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(15_000);
    });

    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Paused");
    expect(window.localStorage.getItem("typingjourney:essay-progress")).toBeNull();
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
