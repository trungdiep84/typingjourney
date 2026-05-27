import { describe, expect, it } from "vitest";
import {
  essayContents,
  getRandomTimedContent
} from "./typingContent";
import { ONE_MINUTE_MS, THREE_MINUTES_MS } from "../typing/typingEngine";

const expectedEssayIds = [
  "a-project-of-one-s-own",
  "be-good",
  "before-the-startup",
  "being-a-noob",
  "beyond-smart",
  "billionaires-build",
  "cities-and-ambition",
  "copy-what-you-like",
  "crazy-new-ideas",
  "default-alive-or-default-dead",
  "disconnecting-distraction",
  "do-things-that-don-t-scale",
  "early-work",
  "earnestness",
  "economic-inequality",
  "fierce-nerds",
  "five-founders",
  "founder-mode",
  "good-and-bad-procrastination",
  "good-writing",
  "great-hackers",
  "hackers-and-painters",
  "having-kids",
  "how-not-to-die",
  "how-people-get-rich-now",
  "how-to-be-an-angel-investor",
  "how-to-be-an-expert-in-a-changing-world",
  "how-to-disagree",
  "how-to-do-great-work",
  "how-to-do-what-you-love",
  "how-to-get-new-ideas",
  "how-to-get-startup-ideas",
  "how-to-lose-time-and-money",
  "how-to-make-wealth",
  "how-to-raise-money",
  "how-to-start-a-startup",
  "how-to-start-google",
  "how-to-think-for-yourself",
  "how-to-work-hard",
  "how-to-write-usefully",
  "is-it-worth-being-wise",
  "is-there-such-a-thing-as-good-taste",
  "jessica-livingston",
  "life-is-short",
  "lies-we-tell-kids",
  "maker-s-schedule-manager-s-schedule",
  "mean-people-fail",
  "mind-the-gap",
  "putting-ideas-into-words",
  "ramen-profitable",
  "relentlessly-resourceful",
  "schlep-blindness",
  "see-randomness",
  "some-heroes",
  "startup-growth",
  "startups-in-13-sentences",
  "superlinear-returns",
  "taste-for-makers",
  "the-18-mistakes-that-kill-startups",
  "the-anatomy-of-determination",
  "the-best-essay",
  "the-bus-ticket-theory-of-genius",
  "the-fatal-pinch",
  "the-hardest-lessons-for-startups-to-learn",
  "the-lesson-to-unlearn",
  "the-need-to-read",
  "the-power-of-the-marginal",
  "the-refragmentation",
  "the-right-kind-of-stubborn",
  "the-top-idea-in-your-mind",
  "the-word-hacker",
  "what-doesn-t-seem-like-work",
  "what-i-ve-learned-from-hacker-news",
  "what-i-ve-learned-from-users",
  "what-to-do",
  "what-you-can-t-say",
  "what-you-ll-wish-you-d-known",
  "when-to-do-what-you-love",
  "why-it-s-safe-for-founders-to-be-nice",
  "why-nerds-are-unpopular",
  "why-smart-people-have-bad-ideas",
  "why-startups-condense-in-america",
  "why-to-not-not-start-a-startup",
  "write-like-you-talk",
  "write-simply",
  "writes-and-write-nots"
];

describe("typing content", () => {
  it("loads the selected Paul Graham essay corpus", () => {
    const uniqueTitles = new Set(essayContents.map((essay) => essay.title));
    const essayIds = essayContents.map((essay) => essay.id);

    expect([...essayIds].sort()).toEqual([...expectedEssayIds].sort());
    expect(uniqueTitles.size).toBe(essayContents.length);
    expect(essayContents[0]).toEqual(
      expect.objectContaining({
        author: "Paul Graham",
        sourceUrl: expect.stringContaining("paulgraham.com"),
        text: expect.any(String),
        title: expect.any(String)
      })
    );
    expect(essayContents.every((essay) => essay.text.includes("\n\n"))).toBe(true);
    expect(essayContents.some((essay) => / {2,}|\n{3,}/.test(essay.text))).toBe(false);
    expect(
      essayContents.some((essay) =>
        essay.text.split("\n").some((line) => /^ | $/.test(line))
      )
    ).toBe(false);
    expect(
      essayContents.some((essay) =>
        /^Want to start a startup\? Get funded by Y Combinator\./i.test(
          essay.text
        )
      )
    ).toBe(false);
  });

  it("creates timed excerpts for both timed challenge lengths", () => {
    const oneMinuteContent = getRandomTimedContent(ONE_MINUTE_MS);
    const threeMinuteContent = getRandomTimedContent(THREE_MINUTES_MS);

    expect(oneMinuteContent.title).toMatch(/^1-Minute: /);
    expect(threeMinuteContent.title).toMatch(/^3-Minute: /);
    expect(oneMinuteContent.sourceEssayId).toEqual(expect.any(String));
    expect(threeMinuteContent.sourceEssayId).toEqual(expect.any(String));
    expect(oneMinuteContent.text.length).toBeGreaterThan(500);
    expect(threeMinuteContent.text.length).toBeGreaterThan(3_000);
  });

  it("rotates timed challenge source essays when possible", () => {
    const current = getRandomTimedContent(ONE_MINUTE_MS);
    const next = getRandomTimedContent(ONE_MINUTE_MS, current.sourceEssayId);

    expect(next.sourceEssayId).not.toBe(current.sourceEssayId);
  });
});
