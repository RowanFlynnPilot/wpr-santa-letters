// Decode the chosen photo with its orientation applied, then encode two JPEGs: a full-size
// view and a thumbnail for the gallery grid and front-page strip. Output is always upright
// and small enough for phones on rural connections; the server strips any location
// metadata that survives.
const FULL = { edge: 1600, quality: 0.82 };
const THUMB = { edge: 640, quality: 0.76 };

export interface PreparedPhoto {
  full: Blob;
  thumb: Blob;
}

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  // Decoded as an <img>, which applies the photo's orientation in every browser in use (Safari since
  // 13.1). createImageBitmap's option for that needs Safari 17, and iPhones stuck on iOS 16 can't run it.
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode().catch(() => {
      throw new Error("That photo couldn't be read. Try a JPEG or a photo straight from your phone's camera.");
    });
    const [full, thumb] = await Promise.all([encode(image, FULL), encode(image, THUMB)]);
    return { full, thumb };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function encode(image: HTMLImageElement, size: { edge: number; quality: number }): Promise<Blob> {
  const scale = Math.min(1, size.edge / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);

  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser can't prepare photos. Try another browser.");
  // A drawing saved with a transparent background lands on white paper, not black.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("This browser can't prepare photos. Try another browser."))),
      "image/jpeg",
      size.quality,
    );
  });
}
