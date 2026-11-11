import { useState } from "react";

// The photo of a mailed letter, to check typed words against (Add a letter): it stays beside the boxes on
// a wide screen, zooms in steps, and scrolls inside its own frame so the page doesn't move. The frame can
// be focused, so the arrow keys scroll it.
const ZOOMS = [1, 1.5, 2, 3];

export function PhotoViewer({ src }: { src: string }) {
  const [step, setStep] = useState(0);
  const zoom = ZOOMS[step];
  return (
    <div className="photo-viewer">
      <div className="photo-viewer-tools" role="group" aria-label="Zoom the photo">
        <button type="button" className="button" onClick={() => setStep(step - 1)} disabled={step === 0}>
          Zoom out
        </button>
        <button type="button" className="button" onClick={() => setStep(step + 1)} disabled={step === ZOOMS.length - 1}>
          Zoom in
        </button>
        <span className="hint" role="status">
          {zoom === 1 ? "Fits the frame" : `${zoom * 100}%`}
        </span>
      </div>
      <div className="photo-viewer-pane" tabIndex={0} role="group" aria-label="The letter’s photo. Scroll to move around it.">
        <img src={src} alt="The letter, as photographed" style={{ width: `${zoom * 100}%` }} />
      </div>
    </div>
  );
}
