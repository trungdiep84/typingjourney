import { Delete } from "lucide-react";

const keyboardRows = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", "'"],
  ["z", "x", "c", "v", "b", "n", "m", ",", ".", "?"],
  ["space", "backspace"]
];

type VirtualKeyboardProps = {
  activeKey: string | null;
  targetKey: string | null;
};

function normalizeKey(key: string | null): string | null {
  if (key === null) {
    return null;
  }

  if (key === " ") {
    return "space";
  }

  if (key === "Backspace") {
    return "backspace";
  }

  return key.toLowerCase();
}

export function VirtualKeyboard({ activeKey, targetKey }: VirtualKeyboardProps) {
  const active = normalizeKey(activeKey);
  const target = normalizeKey(targetKey);

  return (
    <section className="keyboard" aria-label="Virtual keyboard">
      {keyboardRows.map((row, rowIndex) => (
        <div className="keyboard-row" key={`row-${rowIndex}`}>
          {row.map((key) => {
            const isSpace = key === "space";
            const isBackspace = key === "backspace";
            const className = [
              "key",
              isSpace ? "key-space" : "",
              isBackspace ? "key-wide" : "",
              active === key ? "key-active" : "",
              target === key ? "key-target" : ""
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <div className={className} key={key}>
                {isBackspace ? <Delete size={18} /> : isSpace ? "Space" : key}
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
