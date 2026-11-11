// The published words of a letter, as staff type them in or fix them: the same rules as the form
// (supabase letter_words), so what saves here is what the mailbag can show.
import type { LetterWords } from "../data";
import { AGES } from "../format";
import { describeFlags, privacyFlags } from "../privacy";

export function LetterFields({
  words,
  onChange,
}: {
  words: LetterWords;
  onChange: (words: LetterWords) => void;
}) {
  const set = (field: keyof LetterWords, value: string) => onChange({ ...words, [field]: value });
  const flags = privacyFlags(words.body, words.first_name);
  return (
    <>
      <div className="field-row">
        <label>
          First name
          <input
            name="first_name"
            required
            maxLength={30}
            value={words.first_name}
            onChange={(e) => set("first_name", e.target.value)}
          />
        </label>
        <label>
          Age
          <select required value={words.age} onChange={(e) => set("age", e.target.value)}>
            <option value="">Choose</option>
            {AGES.map((age) => (
              <option key={age} value={age}>
                {age === 0 ? "Under 1" : age}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>
            Town <span className="optional">(optional)</span>
          </span>
          <input maxLength={40} value={words.town} onChange={(e) => set("town", e.target.value)} />
        </label>
      </div>
      <label>
        The letter
        <textarea
          className="ruled"
          required
          rows={8}
          maxLength={2000}
          value={words.body}
          onChange={(e) => set("body", e.target.value)}
        />
      </label>
      {flags.length > 0 && (
        <p className="privacy-note" role="status">
          Check before it goes up: {describeFlags(flags)}.
        </p>
      )}
      <p className="hint">
        Keep the child’s spelling. Take out last names, street addresses and school names. A blank line starts a new
        paragraph.
      </p>
    </>
  );
}
