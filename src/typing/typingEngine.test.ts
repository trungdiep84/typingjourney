import { describe, expect, it } from "vitest";
import {
  backspace,
  completeTimedSession,
  createTypingSession,
  getDisplayCharacters,
  getMistakeHotspots,
  getStats,
  isPrintableKey,
  ONE_MINUTE_MS,
  pauseSession,
  resumeSession,
  THREE_MINUTES_MS,
  typeCharacter
} from "./typingEngine";

function typeText(
  session: ReturnType<typeof createTypingSession>,
  text: string,
  nowMs: number
) {
  return text.split("").reduce(
    (currentSession, char) => typeCharacter(currentSession, char, nowMs),
    session
  );
}

describe("typing engine", () => {
  it("reports 60 WPM for 300 visible characters in 60 seconds", () => {
    const text = "a".repeat(300);
    let session = createTypingSession({ mode: "timed", text });

    session = typeText(session, text, 0);

    const stats = getStats(session, ONE_MINUTE_MS);

    expect(stats.typedChars).toBe(300);
    expect(stats.wpm).toBe(60);
    expect(stats.accuracy).toBe(100);
  });

  it("keeps gross WPM separate from accuracy", () => {
    let session = createTypingSession({ mode: "timed", text: "ab" });

    session = typeCharacter(session, "a", 0);
    session = typeCharacter(session, "x", 100);

    const stats = getStats(session, ONE_MINUTE_MS);

    expect(stats.typedChars).toBe(2);
    expect(stats.wpm).toBe(0.4);
    expect(stats.accuracy).toBe(50);
    expect(stats.errors).toBe(1);
  });

  it("advances through consecutive incorrect characters", () => {
    let session = createTypingSession({ mode: "timed", text: "abcd" });

    session = typeCharacter(session, "x", 0);
    session = typeCharacter(session, "y", 100);

    const characters = getDisplayCharacters(session, { before: 4, after: 4 });
    const stats = getStats(session, 1_000);

    expect(session.entries).toHaveLength(2);
    expect(stats.errors).toBe(2);
    expect(characters.find((character) => character.status === "current")?.char).toBe("c");
  });

  it("removes backspaced characters from WPM count", () => {
    const text = "aaaaaaaaaa";
    let session = createTypingSession({ mode: "timed", text });

    session = typeText(session, text, 0);
    session = backspace(session);

    const stats = getStats(session, ONE_MINUTE_MS);

    expect(stats.typedChars).toBe(9);
    expect(stats.wpm).toBe(1.8);
  });

  it("allows a wrong character to be repaired", () => {
    let session = createTypingSession({ mode: "essay", text: "a" });

    session = typeCharacter(session, "x", 0);
    session = backspace(session);
    session = typeCharacter(session, "a", 500);

    const stats = getStats(session, 500);

    expect(stats.typedChars).toBe(1);
    expect(stats.accuracy).toBe(100);
    expect(stats.errors).toBe(0);
    expect(stats.completed).toBe(true);
  });

  it("keeps mistake hotspots after repaired characters", () => {
    let session = createTypingSession({ mode: "essay", text: "abc" });

    session = typeCharacter(session, "x", 0);
    session = backspace(session);
    session = typeCharacter(session, "a", 100);
    session = typeCharacter(session, "y", 200);
    session = backspace(session);
    session = typeCharacter(session, "b", 300);

    const hotspots = getMistakeHotspots(session);

    expect(hotspots).toEqual([
      { expected: "a", actual: "x", count: 1 },
      { expected: "b", actual: "y", count: 1 }
    ]);
  });

  it("starts timing on the first printable key", () => {
    let session = createTypingSession({ mode: "timed", text: "abc" });

    session = backspace(session);
    session = typeCharacter(session, "a", 1_000);

    const stats = getStats(session, 4_000);

    expect(session.startedAt).toBe(1_000);
    expect(stats.elapsedMs).toBe(3_000);
  });

  it("ends timed tests at the exact duration", () => {
    let session = createTypingSession({ mode: "timed", text: "abc" });

    session = typeCharacter(session, "a", 1_000);
    session = completeTimedSession(session, 70_000);

    const stats = getStats(session, 90_000);

    expect(session.finishedAt).toBe(61_000);
    expect(stats.elapsedMs).toBe(ONE_MINUTE_MS);
    expect(stats.completed).toBe(true);
  });

  it("uses arbitrary timed durations for WPM calculation", () => {
    const text = "a".repeat(900);
    let session = createTypingSession({
      mode: "timed",
      text,
      durationMs: THREE_MINUTES_MS
    });

    session = typeText(session, text, 0);

    const stats = getStats(session, THREE_MINUTES_MS);

    expect(stats.wpm).toBe(60);
    expect(stats.elapsedMs).toBe(THREE_MINUTES_MS);
  });

  it("completes essay mode when the final character is typed", () => {
    let session = createTypingSession({ mode: "essay", text: "done" });

    session = typeText(session, "done", 2_000);

    const stats = getStats(session, 3_000);

    expect(session.finishedAt).toBe(2_000);
    expect(stats.completed).toBe(true);
    expect(stats.typedChars).toBe(4);
  });

  it("accepts paragraph breaks as typed newline characters", () => {
    let session = createTypingSession({ mode: "essay", text: "a\n\nb" });

    expect(isPrintableKey("\n")).toBe(true);

    session = typeText(session, "a\n\nb", 1_000);

    const stats = getStats(session, 1_000);

    expect(stats.completed).toBe(true);
    expect(stats.typedChars).toBe(4);
    expect(stats.accuracy).toBe(100);
  });

  it("freezes essay elapsed time while paused", () => {
    let session = createTypingSession({ mode: "essay", text: "abc" });

    session = typeCharacter(session, "a", 1_000);
    session = pauseSession(session, 4_000);

    expect(getStats(session, 9_000).elapsedMs).toBe(3_000);
    expect(typeCharacter(session, "b", 9_000).entries).toHaveLength(1);

    session = resumeSession(session, 9_000);
    session = typeCharacter(session, "b", 10_000);

    expect(session.pausedAt).toBeNull();
    expect(session.startedAt).toBe(6_000);
    expect(getStats(session, 10_000).elapsedMs).toBe(4_000);
    expect(session.entries).toHaveLength(2);
  });

  it("windows displayed characters around the cursor for long text", () => {
    let session = createTypingSession({
      mode: "essay",
      text: "a".repeat(5_000)
    });

    session = typeText(session, "a".repeat(1_000), 0);

    const characters = getDisplayCharacters(session, { before: 10, after: 20 });

    expect(characters).toHaveLength(30);
    expect(characters.filter((character) => character.status === "current")).toHaveLength(1);
    expect(characters[0].status).toBe("correct");
    expect(characters[10].status).toBe("current");
  });
});
