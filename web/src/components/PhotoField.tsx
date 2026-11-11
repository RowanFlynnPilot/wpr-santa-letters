import { useState } from "react";
import { preparePhoto, type PreparedPhoto } from "../photo";

export type ChosenPhoto = PreparedPhoto & { preview: string };

// An optional photo of the handwritten letter or a drawing, shared by the form and the staff page.
// The browser turns it upright and makes the two sizes before anything is sent. A photo that won't
// read leaves the one already chosen, if any, in place.
export function PhotoField({
  photo,
  onChange,
  onPreparing,
  label,
  hint,
}: {
  photo: ChosenPhoto | null;
  onChange: (photo: ChosenPhoto | null) => void;
  onPreparing: (preparing: boolean) => void;
  label: string;
  hint: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);

  // The preview lives as long as the photo is chosen (the form's confirmation shows it too), and is
  // let go when it's replaced or removed.
  const replace = (next: ChosenPhoto | null) => {
    if (photo) URL.revokeObjectURL(photo.preview);
    onChange(next);
  };

  const choose = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    setPreparing(true);
    onPreparing(true);
    try {
      const prepared = await preparePhoto(file);
      replace({ ...prepared, preview: URL.createObjectURL(prepared.full) });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPreparing(false);
      onPreparing(false);
    }
  };

  return (
    <div className="photo-field">
      <label className="photo-picker">
        <span className="photo-picker-label">{preparing ? "Getting the photo ready…" : photo ? "Choose a different photo" : label}</span>
        {photo && <img src={photo.preview} alt="The photo you chose" />}
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            void choose(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      <p className="hint">{hint}</p>
      {photo && (
        <button type="button" className="link-button" onClick={() => replace(null)}>
          Remove the photo
        </button>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
