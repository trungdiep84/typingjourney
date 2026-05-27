import { mkdir, writeFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const INDEX_URL = "https://paulgraham.com/articles.html";
const OUTPUT_PATH = new URL("../src/data/generated/paulGrahamEssays.json", import.meta.url);

const INCLUDED_ESSAY_IDS = new Set([
  "good-writing",
  "what-to-do",
  "writes-and-write-nots",
  "when-to-do-what-you-love",
  "founder-mode",
  "the-right-kind-of-stubborn",
  "how-to-start-google",
  "the-best-essay",
  "superlinear-returns",
  "how-to-do-great-work",
  "how-to-get-new-ideas",
  "the-need-to-read",
  "what-i-ve-learned-from-users",
  "putting-ideas-into-words",
  "is-there-such-a-thing-as-good-taste",
  "beyond-smart",
  "how-to-work-hard",
  "a-project-of-one-s-own",
  "fierce-nerds",
  "crazy-new-ideas",
  "how-people-get-rich-now",
  "write-simply",
  "earnestness",
  "billionaires-build",
  "how-to-think-for-yourself",
  "early-work",
  "how-to-write-usefully",
  "being-a-noob",
  "having-kids",
  "the-lesson-to-unlearn",
  "the-bus-ticket-theory-of-genius",
  "life-is-short",
  "economic-inequality",
  "the-refragmentation",
  "jessica-livingston",
  "write-like-you-talk",
  "default-alive-or-default-dead",
  "why-it-s-safe-for-founders-to-be-nice",
  "what-doesn-t-seem-like-work",
  "how-to-be-an-expert-in-a-changing-world",
  "the-fatal-pinch",
  "mean-people-fail",
  "before-the-startup",
  "how-to-raise-money",
  "do-things-that-don-t-scale",
  "how-to-get-startup-ideas",
  "startup-growth",
  "schlep-blindness",
  "the-top-idea-in-your-mind",
  "how-to-lose-time-and-money",
  "the-anatomy-of-determination",
  "ramen-profitable",
  "maker-s-schedule-manager-s-schedule",
  "five-founders",
  "relentlessly-resourceful",
  "how-to-be-an-angel-investor",
  "what-i-ve-learned-from-hacker-news",
  "startups-in-13-sentences",
  "cities-and-ambition",
  "lies-we-tell-kids",
  "disconnecting-distraction",
  "be-good",
  "some-heroes",
  "how-to-disagree",
  "how-not-to-die",
  "the-18-mistakes-that-kill-startups",
  "why-to-not-not-start-a-startup",
  "is-it-worth-being-wise",
  "copy-what-you-like",
  "the-power-of-the-marginal",
  "why-startups-condense-in-america",
  "the-hardest-lessons-for-startups-to-learn",
  "see-randomness",
  "how-to-do-what-you-love",
  "good-and-bad-procrastination",
  "why-smart-people-have-bad-ideas",
  "how-to-start-a-startup",
  "what-you-ll-wish-you-d-known",
  "great-hackers",
  "how-to-make-wealth",
  "the-word-hacker",
  "mind-the-gap",
  "what-you-can-t-say",
  "hackers-and-painters",
  "why-nerds-are-unpopular",
  "taste-for-makers"
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function absoluteUrl(href) {
  return new URL(href, INDEX_URL).toString();
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function normalizeText(value) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "--")
    .replace(/\u2026/g, "...")
    .replace(/\u00e9/g, "e")
    .replace(/\u00e0/g, "a")
    .replace(/\u00f6/g, "o")
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([([{])\s+/g, "$1")
    .replace(/\s+([)\]}])/g, "$1")
    .trim();
}

function normalizeEssayText(value) {
  const paragraphs = value
    .replace(/\u00a0/g, " ")
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "--")
    .replace(/\u2026/g, "...")
    .replace(/\u00e9/g, "e")
    .replace(/\u00e0/g, "a")
    .replace(/\u00f6/g, "o")
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, " ")
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) =>
      paragraph
        .replace(/\n+/g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/\s+([,.;:!?])/g, "$1")
        .replace(/([([{])\s+/g, "$1")
        .replace(/\s+([)\]}])/g, "$1")
        .trim()
    )
    .filter(Boolean);

  return mergeSplitFootnoteMarkers(paragraphs).join("\n\n").trim();
}

function mergeSplitFootnoteMarkers(paragraphs) {
  const merged = [];

  for (let index = 0; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index];
    const number = paragraphs[index + 1];
    const close = paragraphs[index + 2];

    if (paragraph === "[" && /^\d+$/.test(number ?? "") && close?.startsWith("]")) {
      merged.push(`[${number}${close}`);
      index += 2;
      continue;
    }

    const content = paragraphs[index + 3];

    if (
      paragraph === "[" &&
      /^\d+$/.test(number ?? "") &&
      close === "]" &&
      content
    ) {
      merged.push(`[${number}] ${content}`);
      index += 3;
      continue;
    }

    merged.push(paragraph);
  }

  return merged;
}

function collectReadableText(node) {
  const Node = node.ownerDocument?.defaultView?.Node ?? node.defaultView?.Node;

  if (!Node) {
    return "";
  }

  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }

  if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_NODE) {
    return "";
  }

  const tagName = node.tagName?.toLowerCase();
  const blockTags = new Set([
    "address",
    "article",
    "blockquote",
    "body",
    "br",
    "center",
    "dd",
    "div",
    "dl",
    "dt",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "li",
    "p",
    "pre",
    "section",
    "table",
    "tbody",
    "td",
    "tfoot",
    "th",
    "thead",
    "tr",
    "ul"
  ]);

  if (tagName === "br") {
    return "\n";
  }

  const children = Array.from(node.childNodes)
    .map((child) => collectReadableText(child))
    .join("");

  return blockTags.has(tagName) ? `\n\n${children}\n\n` : children;
}

function removeTrailingBoilerplate(text) {
  const translationPattern =
    /^(?:(?:[A-Z][a-z]+|Traditional Chinese|Simplified Chinese) Translation\s*)+$/i;
  const footerCutPatterns = [
    /^A Scheme Story$/i,
    /^Domain Name Search$/i,
    /^Gates Email$/i,
    /^How To Become A Hacker$/i,
    /^Microsoft finally agrees$/i,
    /^Orbitz Uses Lisp Too$/i,
    /^Related:?$/i,
    /^Some Technical Details$/i,
    /^You'll find this essay\b/i
  ];
  const paragraphs = text.split(/\n{2,}/);
  const footerWindowStart = Math.max(0, paragraphs.length - 16);
  const lateEssayStart = Math.floor(paragraphs.length * 0.55);

  const cutIndex = paragraphs.findIndex((paragraph, index) => {
    const isLateEnough = index >= footerWindowStart || index >= lateEssayStart;
    const trimmed = paragraph.trim();

    return (
      isLateEnough &&
      (translationPattern.test(trimmed) ||
        footerCutPatterns.some((pattern) => pattern.test(trimmed)))
    );
  });

  if (cutIndex >= 0) {
    return paragraphs.slice(0, cutIndex).join("\n\n").trim();
  }

  return paragraphs.join("\n\n").trim();
}

function cleanupEssayText(text) {
  return removeTrailingBoilerplate(
    normalizeEssayText(text).replace(
      /^Want to start a startup\? Get funded by Y Combinator\.(?:\n\n| )?/i,
      ""
    )
  );
}

function extractIndexLinks(html) {
  const dom = new JSDOM(html);
  const seen = new Set();

  return Array.from(dom.window.document.querySelectorAll("a[href]"))
    .map((anchor) => ({
      href: anchor.getAttribute("href") ?? "",
      title: normalizeText(anchor.textContent ?? "")
    }))
    .filter(({ href, title }) => {
      if (!title || !href.endsWith(".html")) {
        return false;
      }

      const url = absoluteUrl(href);

      if (seen.has(url) || url === INDEX_URL) {
        return false;
      }

      seen.add(url);
      return true;
    })
    .map(({ href, title }) => ({
      title,
      sourceUrl: absoluteUrl(href)
    }));
}

function removeNonEssayNodes(document) {
  document.querySelectorAll("script, style, img, map, area, noscript").forEach((node) => {
    node.remove();
  });

  document.querySelectorAll("font[size='1'], font[size='2']").forEach((node) => {
    const text = normalizeText(node.textContent ?? "");

    if (
      /^thanks/i.test(text) ||
      /^notes/i.test(text) ||
      /^related/i.test(text) ||
      /^more/i.test(text)
    ) {
      node.remove();
    }
  });
}

function extractEssayText(html, title) {
  const dom = new JSDOM(html);
  const { document } = dom.window;

  removeNonEssayNodes(document);

  const titleNode =
    document.querySelector("font[size='6']") ??
    document.querySelector("font[size='5']") ??
    document.querySelector("title");

  if (titleNode) {
    titleNode.remove();
  }

  let text = cleanupEssayText(collectReadableText(document.body ?? document));
  const titlePrefix = normalizeText(title);

  if (text.toLowerCase().startsWith(titlePrefix.toLowerCase())) {
    text = cleanupEssayText(text.slice(titlePrefix.length));
  }

  return text;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "TypingJourneyContentScraper/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.text();
}

async function main() {
  const indexHtml = await fetchText(INDEX_URL);
  const links = extractIndexLinks(indexHtml);
  const includedLinks = links.filter((link) =>
    INCLUDED_ESSAY_IDS.has(slugify(link.title))
  );
  const foundIds = new Set(includedLinks.map((link) => slugify(link.title)));
  const missingIds = [...INCLUDED_ESSAY_IDS].filter((id) => !foundIds.has(id));
  const essays = [];
  const failures = [];

  for (const [index, link] of includedLinks.entries()) {
    try {
      const html = await fetchText(link.sourceUrl);
      const text = extractEssayText(html, link.title);

      if (text.length < 300) {
        failures.push({ ...link, reason: `Only ${text.length} characters extracted` });
      } else {
        essays.push({
          id: slugify(link.title),
          title: link.title,
          author: "Paul Graham",
          sourceUrl: link.sourceUrl,
          description: `Full essay scraped from Paul Graham's essay index.`,
          text
        });
      }
    } catch (error) {
      failures.push({ ...link, reason: error instanceof Error ? error.message : String(error) });
    }

    if (index < includedLinks.length - 1) {
      await sleep(75);
    }
  }

  await mkdir(new URL("../src/data/generated", import.meta.url), { recursive: true });
  await writeFile(
    OUTPUT_PATH,
    `${JSON.stringify(essays, null, 2)}\n`,
    "utf8"
  );

  console.log(
    `Scraped ${essays.length} topical essays from ${includedLinks.length} included links.`
  );

  if (failures.length > 0) {
    console.warn(`Skipped ${failures.length} links:`);
    for (const failure of failures) {
      console.warn(`- ${failure.title}: ${failure.reason}`);
    }
  }

  if (missingIds.length > 0) {
    console.warn(`Missing ${missingIds.length} allowlisted ids from the index:`);
    for (const id of missingIds) {
      console.warn(`- ${id}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
