// Sponsors and prizes: who sponsors Letters to Santa this year, each one's logo and link, and the prizes
// in the drawing. Everything here used to be SQL typed into Supabase and a file uploaded in its dashboard;
// now it's this page (migration 0013), and what's saved shows on the mailbag straight away. A presenting
// sponsor's banner ad is the one thing that isn't here: it's a file in the app (README).
import { useState, type FormEvent } from "react";
import { addPrizes, loadDraws, loadPrizes, loadSponsors, LOGO_BYTES, LOGO_TYPES, removePrize, removeSponsor, saveSponsor } from "../../data";
import { apNumber, capitalize } from "../../format";
import { PRESENTING_LIMIT } from "../../sales";
import { logoUrl } from "../../storage";
import type { Draw, Prize, Season, Sponsor, SponsorTier } from "../../types";
import { useDraft } from "../../useDraft";
import { useLoad } from "../../useLoad";

// The three levels the sponsor sheet sells, in the order the mailbag thanks them, and what each gets.
const LEVELS: { tier: SponsorTier; heading: string; one: string; gets: string }[] = [
  {
    tier: "presenting",
    heading: "Presenting sponsors",
    one: "Presenting sponsor",
    gets: "A stamp on the envelope, in the order they’re added here, and a prize of their own in the drawing. Four at most.",
  },
  {
    tier: "supporting",
    heading: "Supporting sponsors",
    one: "Supporting sponsor",
    gets: "Named in the “With support from” row under the envelope, and again at the foot.",
  },
  {
    tier: "donor",
    heading: "Prize donors",
    one: "Prize donor",
    gets: "Give a prize and pay nothing. Named with the prize, with its winner, and at the foot.",
  },
];

async function loadDesk(seasonId: string) {
  const [sponsors, prizes, draws] = await Promise.all([loadSponsors(seasonId), loadPrizes(seasonId), loadDraws(seasonId)]);
  // A sales preview's placeholders ("Your business here") aren't sponsors.
  return { sponsors: sponsors.filter((s) => !s.demo), prizes, draws };
}

export function Sponsors({ season }: { season: Season }) {
  const desk = useLoad(() => loadDesk(season.id));
  const [done, setDone] = useState<string | null>(null);

  if (desk.status === "loading") return <p className="status">Loading the sponsors…</p>;
  if (desk.status === "failed") return <p className="status">Couldn’t load the sponsors: {desk.error.message}</p>;

  const { sponsors, prizes, draws } = desk.data;
  const presenting = sponsors.filter((s) => s.tier === "presenting").length;
  const changed = (what: string) => {
    setDone(what);
    desk.reload();
  };

  return (
    <div className="sponsors-desk">
      <p className="hint">
        Everything saved here shows on the mailbag straight away. A presenting sponsor’s banner ad is the one thing
        that isn’t added here: it’s a file in the app (README, A presenting sponsor’s banner ad).
      </p>
      {draws.length > 0 && (
        <p className="hint">
          The prize drawing has run. A prize added now is drawn on its own, under Prize drawing; a prize that has been
          drawn stays on the list.
        </p>
      )}
      {done && (
        <p className="done" role="status">
          {done}
        </p>
      )}

      {LEVELS.map((level) => {
        const listed = sponsors.filter((s) => s.tier === level.tier);
        return (
          <section key={level.tier} aria-labelledby={`sponsors-${level.tier}`}>
            <h2 id={`sponsors-${level.tier}`}>
              {level.heading}
              {level.tier === "presenting" && ` (${presenting} of ${PRESENTING_LIMIT})`}
            </h2>
            <p className="hint">{level.gets}</p>
            {listed.length === 0 ? (
              <p>None yet.</p>
            ) : (
              <ol className="sponsor-rows">
                {listed.map((sponsor) => (
                  <SponsorRow
                    key={sponsor.id}
                    sponsor={sponsor}
                    prizes={prizes.filter((p) => p.sponsor_id === sponsor.id)}
                    draws={draws}
                    presentingFull={presenting >= PRESENTING_LIMIT}
                    onChange={changed}
                  />
                ))}
              </ol>
            )}
          </section>
        );
      })}

      <section aria-labelledby="sponsors-add">
        <h2 id="sponsors-add">Add a sponsor</h2>
        <SponsorForm current={null} presentingFull={presenting >= PRESENTING_LIMIT} onSaved={(name) => changed(`${name} is added, and on the mailbag now.`)} />
      </section>
    </div>
  );
}

function SponsorRow({
  sponsor,
  prizes,
  draws,
  presentingFull,
  onChange,
}: {
  sponsor: Sponsor;
  prizes: Prize[];
  draws: Draw[];
  presentingFull: boolean;
  onChange: (what: string) => void;
}) {
  const [open, setOpen] = useState<"change" | "prize" | "remove" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A prize given more than once is listed once, as the mailbag lists it, with how many there are to win.
  const groups = new Map<string, Prize[]>();
  for (const prize of prizes) groups.set(prize.description, [...(groups.get(prize.description) ?? []), prize]);
  const drawn = (prize: Prize) => draws.some((d) => d.prize_id === prize.id);

  const run = async (action: () => Promise<void>, what: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setOpen(null);
      onChange(what);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="sponsor-row">
      <div className="sponsor-logo">
        {sponsor.logo_path ? <img src={logoUrl(sponsor.logo_path)} alt={`${sponsor.name}’s logo`} /> : <span>No logo yet</span>}
      </div>
      <div className="sponsor-body">
        <h3>{sponsor.name}</h3>
        <p>
          {sponsor.website_url ? (
            <a href={sponsor.website_url} target="_blank" rel="noreferrer">
              {sponsor.website_url}
            </a>
          ) : (
            <span className="hint">No web address: its name and logo aren’t linked.</span>
          )}
        </p>
        {!sponsor.logo_path && sponsor.tier !== "donor" && (
          <p className="hint">
            Until a logo arrives, {sponsor.tier === "presenting" ? "the stamp sets the name in type" : "the row shows the name in type"}.
          </p>
        )}

        {groups.size > 0 && (
          <ul className="sponsor-prizes" aria-label={`${sponsor.name}’s prizes`}>
            {[...groups.entries()].map(([description, same]) => {
              // The newest one not yet drawn is the one that comes off.
              const removable = [...same].reverse().find((prize) => !drawn(prize));
              return (
                <li key={description}>
                  <span>
                    {capitalize(description)}
                    {same.length > 1 && ` (${apNumber(same.length)} to win)`}
                  </span>
                  {removable ? (
                    <button
                      type="button"
                      className="link-button"
                      disabled={busy}
                      onClick={() => run(() => removePrize(removable.id), `Took ${same.length > 1 ? "one of" : "the prize"} “${description}” off ${sponsor.name}’s list.`)}
                    >
                      {same.length > 1 ? "Take one off" : "Take it off"}
                    </button>
                  ) : (
                    <span className="hint">Drawn</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {groups.size === 0 && sponsor.tier !== "supporting" && <p className="hint">No prize listed yet.</p>}

        {open === "change" ? (
          <SponsorForm
            current={sponsor}
            presentingFull={presentingFull}
            onSaved={(name) => {
              setOpen(null);
              onChange(`${name} is saved.`);
            }}
            onCancel={() => setOpen(null)}
          />
        ) : open === "prize" ? (
          <PrizeForm sponsor={sponsor} onAdded={(what) => (setOpen(null), onChange(what))} onCancel={() => setOpen(null)} />
        ) : open === "remove" ? (
          <div className="actions">
            <span>
              {sponsor.name} comes off the mailbag{sponsor.logo_path ? ", and its logo is deleted" : ""}.
            </span>
            <button type="button" className="button" disabled={busy} onClick={() => run(() => removeSponsor(sponsor.id), `${sponsor.name} is off the list.`)}>
              Remove {sponsor.name}
            </button>
            <button type="button" className="link-button" onClick={() => setOpen(null)}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="actions">
            <button type="button" className="link-button" onClick={() => setOpen("prize")}>
              Add a prize
            </button>
            <button type="button" className="link-button" onClick={() => setOpen("change")}>
              Change
            </button>
            {prizes.length === 0 ? (
              <button type="button" className="link-button" onClick={() => setOpen("remove")}>
                Remove…
              </button>
            ) : (
              <span className="hint">To remove it, take its prizes off first.</span>
            )}
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </li>
  );
}

const BLANK = { name: "", tier: "presenting" as SponsorTier, website_url: "" };

// One form for a new sponsor and for changing one. A new sponsor's half-typed answers are kept if the
// staff member looks at another tool (invariant 17); a change in progress isn't, since its sponsor's row
// is right there to open again.
function SponsorForm({
  current,
  presentingFull,
  onSaved,
  onCancel,
}: {
  current: Sponsor | null;
  presentingFull: boolean;
  onSaved: (name: string) => void;
  onCancel?: () => void;
}) {
  const fresh = current
    ? { name: current.name, tier: current.tier, website_url: current.website_url ?? "" }
    : { ...BLANK, tier: (presentingFull ? "supporting" : "presenting") as SponsorTier };
  const [kept, setKept] = useDraft("sponsors:add", fresh);
  const [editing, setEditing] = useState(fresh);
  const [fields, setFields] = current ? [editing, setEditing] : [kept, setKept];
  // A file to use; null to take the current logo off; undefined to leave things as they are.
  const [logo, setLogo] = useState<File | null | undefined>(undefined);
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (field: keyof typeof BLANK, value: string) => setFields((was) => ({ ...was, [field]: value }));
  // The four places are taken: only a sponsor that already holds one can be a presenting sponsor, and a
  // form left on that level (the last sponsor added took the fourth place) moves to the next one down.
  const noRoom = presentingFull && current?.tier !== "presenting";
  const tier: SponsorTier = noRoom && fields.tier === "presenting" ? "supporting" : fields.tier;

  const choose = (file: File | undefined) => {
    setError(null);
    if (!file) return setLogo(undefined);
    // A file that can't be used empties the box, and with it whatever was chosen before: what the box
    // shows is what will be saved.
    const refuse = (why: string) => {
      setFileKey((n) => n + 1);
      setLogo(undefined);
      setError(why);
    };
    if (!LOGO_TYPES[file.type]) return refuse("A logo has to be a PNG, JPEG, WebP or SVG file.");
    if (file.size > LOGO_BYTES) return refuse("That file is over 1 MB. Save a smaller copy of the logo and choose it again.");
    setLogo(file);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await saveSponsor(current, { ...fields, tier }, logo);
      const name = fields.name.trim();
      if (!current) {
        setKept({ ...BLANK, tier });
        setLogo(undefined);
        setFileKey((n) => n + 1);
      }
      onSaved(name);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="sponsor-form" onSubmit={save}>
      <label>
        The business’s name, as it should read
        <input required maxLength={80} autoComplete="off" value={fields.name} onChange={(e) => set("name", e.target.value)} />
      </label>
      <label>
        Level
        <select value={tier} onChange={(e) => set("tier", e.target.value)}>
          {LEVELS.map((level) => (
            <option key={level.tier} value={level.tier} disabled={level.tier === "presenting" && noRoom}>
              {level.one}
              {level.tier === "presenting" && noRoom ? " (all four places are taken)" : ""}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>
          Web address <span className="optional">(optional)</span>
        </span>
        <input type="url" inputMode="url" placeholder="https://" maxLength={300} value={fields.website_url} onChange={(e) => set("website_url", e.target.value)} />
        <span className="hint">The whole address, starting with https://. A Facebook page is fine.</span>
      </label>
      <label>
        <span>
          Logo <span className="optional">(optional)</span>
        </span>
        <input key={fileKey} type="file" accept={Object.keys(LOGO_TYPES).join(",")} onChange={(e) => choose(e.target.files?.[0])} />
        <span className="hint">
          PNG or JPEG is best (the newsletter can’t show WebP or SVG), square or stacked, under 1 MB, readable on white.
          {current?.logo_path ? " Choosing a file replaces the logo it has." : " Without one, its name is set in type."}
        </span>
      </label>
      {current?.logo_path && (
        <label className="check">
          <input type="checkbox" checked={logo === null} disabled={logo instanceof File} onChange={(e) => setLogo(e.target.checked ? null : undefined)} />
          Take its logo off and set its name in type
        </label>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="submit" className="button button-airmail" disabled={busy}>
          {busy ? "Saving…" : current ? "Save" : "Add the sponsor"}
        </button>
        {onCancel && (
          <button type="button" className="link-button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function PrizeForm({ sponsor, onAdded, onCancel }: { sponsor: Sponsor; onAdded: (what: string) => void; onCancel: () => void }) {
  const [description, setDescription] = useState("");
  const [count, setCount] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const words = description.trim().replace(/\s+/g, " ");

  const add = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await addPrizes(sponsor.id, description, Number(count));
      onAdded(`Added ${Number(count) > 1 ? `${apNumber(Number(count))} of ` : ""}“${words}” from ${sponsor.name} to the drawing.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="sponsor-form" onSubmit={add}>
      <label>
        The prize
        <input required maxLength={120} autoComplete="off" placeholder="a family pizza night" value={description} onChange={(e) => setDescription(e.target.value)} />
        <span className="hint">It follows “wins”, so it starts in lowercase: “a $50 gift card”, “a family pizza night”.</span>
      </label>
      <label>
        How many of it there are to win
        <input type="number" required min={1} max={20} value={count} onChange={(e) => setCount(e.target.value)} />
        <span className="hint">Three gift cards are three prizes, each drawn for a different family.</span>
      </label>
      {words && (
        <p className="sponsor-reads">
          As the winners will read: <strong>Mia, 6, of Weston</strong>, wins {words} from {sponsor.name}.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="submit" className="button button-airmail" disabled={busy}>
          {busy ? "Adding…" : "Add to the drawing"}
        </button>
        <button type="button" className="link-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
