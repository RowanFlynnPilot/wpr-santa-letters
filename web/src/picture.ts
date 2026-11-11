// A letter as a picture a family can post (Facebook is where Wausau's parents are): the airmail envelope's
// stripes around it, the letter on ruled paper (its photo first, when it has one), the presenting sponsor's
// stamp, a postmark with the day it arrived, and WPR's flag with the mailbag's address along the foot.
// Drawn in the reader's browser on a canvas, 1080 by 1350 (4:5, the tallest shape a feed shows whole):
// nothing is uploaded, and it shows only what the mailbag already shows. Loaded on demand (ShareButton),
// so the mailbag doesn't carry it.
import { env } from "./env";
import { apDate, byline } from "./format";
import { widestWord } from "./looks";
import { firstLines, wrapText } from "./pictureText";
import { logoUrl, photoUrl } from "./storage";
import type { Letter, Sponsor } from "./types";

const W = 1080;
const H = 1350;
// styles.css's colors: a canvas can't read custom properties.
const INK = "#1e2622";
const SHEET = "#fffdf8";
const TEAL = "#3a867c";
const TEAL_DEEP = "#2c6a62";
const RED = "#b3261e";
const BARK = "#6e6353";
const LINE = "#dcd3c1";
const RULE = "#a9cdc7";
const MARGIN = "#eba59e";
const SLATE = "#32373c";
const DISPLAY = '"Fraunces", Georgia, serif';
const BODY = '"Public Sans", system-ui, sans-serif';

// The inside of the envelope, and the letter's sheet on it.
const EDGE = 34;
const LEFT = 94;
const RIGHT = W - 94;
const PAGE = { x: LEFT, y: 318, w: RIGHT - LEFT, h: 826 };
// The words are set as large as fits the page: a four-line letter fills it, a long one runs small.
const SIZES = [68, 58, 50, 42];
const rowFor = (size: number) => Math.round(size * 1.52);
const FOOT = 1176;

type Ctx = CanvasRenderingContext2D;

function image(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// A photo or logo from storage, fetched so the canvas may read it back (an <img> from another site would
// lock the canvas). If the browser's cached copy came without permission to read it, ask the server again.
// A picture that can't be fetched is left out; the letter's words still make the picture.
async function storageImage(url: string): Promise<HTMLImageElement | null> {
  for (const cache of ["default", "reload"] as const) {
    try {
      const response = await fetch(url, { mode: "cors", cache });
      if (!response.ok) return null;
      const objectUrl = URL.createObjectURL(await response.blob());
      const img = await image(objectUrl);
      URL.revokeObjectURL(objectUrl);
      if (img) return img;
    } catch {
      // Try once more, past the cache.
    }
  }
  return null;
}

function contain(img: HTMLImageElement, box: { x: number; y: number; w: number; h: number }) {
  const scale = Math.min(box.w / img.naturalWidth, box.h / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

function envelope(ctx: Ctx) {
  ctx.fillStyle = SHEET;
  ctx.fillRect(0, 0, W, H);
  // Airmail stripes, red and teal, running off every edge.
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-Math.PI / 4);
  const reach = W + H;
  for (let x = -reach, i = 0; x < reach; x += 44, i++) {
    ctx.fillStyle = i % 2 ? TEAL_DEEP : RED;
    ctx.fillRect(x, -reach, 26, reach * 2);
  }
  ctx.restore();
  ctx.fillStyle = SHEET;
  ctx.fillRect(EDGE, EDGE, W - EDGE * 2, H - EDGE * 2);
}

function spaced(ctx: Ctx, px: number) {
  // Letter-spacing on a canvas is newer than the rest; without it the words are simply set tighter.
  if ("letterSpacing" in ctx) (ctx as Ctx & { letterSpacing: string }).letterSpacing = `${px}px`;
}

function head(ctx: Ctx, letter: Letter) {
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = SLATE;
  ctx.font = `700 22px ${BODY}`;
  spaced(ctx, 4);
  ctx.fillText("WAUSAU PILOT & REVIEW", LEFT, 116);
  spaced(ctx, 0);

  ctx.fillStyle = INK;
  ctx.font = `650 88px ${DISPLAY}`;
  ctx.fillText("Letters to Santa", LEFT - 4, 204);

  // Who it's from, with the envelope's red bar beside it; set smaller for a long name and town.
  const from = `From ${byline(letter)}`;
  // Short of the stamp's caption.
  const room = 600;
  let size = 42;
  do ctx.font = `600 ${size}px ${DISPLAY}`; while (ctx.measureText(from).width > room && --size > 26);
  ctx.fillStyle = RED;
  ctx.fillRect(LEFT, 232, 5, 46);
  ctx.fillStyle = INK;
  ctx.fillText(from, LEFT + 22, 270);
}

// The presenting sponsor's stamp, as on the envelope: its logo, or its name in type sized to its widest
// word, or WPR's badge on teal until the slot sells.
function stamp(ctx: Ctx, sponsor: Sponsor | undefined, logo: HTMLImageElement | null, badge: HTMLImageElement | null) {
  const w = 150;
  const h = 188;
  const cx = RIGHT - w / 2 - 4;
  const top = 64;
  const cy = top + h / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((3 * Math.PI) / 180);
  ctx.shadowColor = "rgba(30, 38, 34, 0.28)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = "#fff";
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.shadowColor = "transparent";
  // Perforations: bites out of the edge, in the envelope's color.
  ctx.fillStyle = SHEET;
  for (let x = -w / 2; x <= w / 2 + 1; x += 12.5) {
    for (const y of [-h / 2, h / 2]) {
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (let y = -h / 2; y <= h / 2 + 1; y += 12.53) {
    for (const x of [-w / 2, w / 2]) {
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const inner = { x: -w / 2 + 12, y: -h / 2 + 12, w: w - 24, h: h - 24 };
  if (!sponsor) {
    ctx.fillStyle = TEAL;
    ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
    if (badge) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, 44, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(badge, -44, -44, 88, 88);
      ctx.restore();
    }
  } else {
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(inner.x, inner.y, inner.w, inner.h);
    const face = { x: inner.x + 10, y: inner.y + 10, w: inner.w - 20, h: inner.h - 20 };
    if (logo) {
      const at = contain(logo, face);
      ctx.drawImage(logo, at.x, at.y, at.w, at.h);
    } else {
      const size = Math.max(11, Math.min(26, face.w / (widestWord(sponsor.name) * 0.66)));
      ctx.font = `650 ${size}px ${DISPLAY}`;
      ctx.fillStyle = INK;
      ctx.textAlign = "center";
      const lines = wrapText(sponsor.name, face.w, (text) => ctx.measureText(text).width);
      const leading = size * 1.15;
      lines.forEach((line, i) => ctx.fillText(line, 0, (i - (lines.length - 1) / 2) * leading + size * 0.35));
    }
  }
  ctx.restore();

  if (sponsor) {
    ctx.font = `600 18px ${BODY}`;
    ctx.fillStyle = BARK;
    ctx.textAlign = "right";
    const lines = wrapText(`Presented by ${sponsor.name}`, 300, (text) => ctx.measureText(text).width).slice(0, 2);
    lines.forEach((line, i) => ctx.fillText(line, RIGHT, top + h + 30 + i * 22));
    ctx.textAlign = "left";
  }
}

// The letter's sheet: its photo first when it has one, then the words on ruled rows, as many as fit.
function page(ctx: Ctx, letter: Letter, photo: HTMLImageElement | null) {
  ctx.save();
  ctx.shadowColor = "rgba(30, 38, 34, 0.14)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = "#fff";
  ctx.fillRect(PAGE.x, PAGE.y, PAGE.w, PAGE.h);
  ctx.restore();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(PAGE.x, PAGE.y, PAGE.w, PAGE.h);

  let top = PAGE.y + 20;
  if (photo) {
    const box = { x: PAGE.x + 36, y: PAGE.y + 36, w: PAGE.w - 72, h: 540 };
    if (photo.naturalWidth / photo.naturalHeight < 0.8) {
      // A tall page, as in the mailbag: the width of the frame, showing its top (the greeting and the
      // first lines, large enough to read the child's hand).
      const scale = box.w / photo.naturalWidth;
      ctx.drawImage(photo, 0, 0, photo.naturalWidth, box.h / scale, box.x, box.y, box.w, box.h);
      ctx.strokeRect(box.x, box.y, box.w, box.h);
      top = box.y + box.h + 12;
    } else {
      // A drawing or a squarer page shows whole, and the words get the room it leaves.
      const at = contain(photo, box);
      ctx.drawImage(photo, at.x, box.y, at.w, at.h);
      ctx.strokeRect(at.x, box.y, at.w, at.h);
      top = box.y + at.h + 12;
    }
  }

  const textX = PAGE.x + 92;
  const width = PAGE.w - 92 - 40;
  const room = PAGE.y + PAGE.h - 24 - top;
  const measure = (text: string) => ctx.measureText(text).width;
  // The largest size at which the whole letter fits; at the smallest, as much of it as fits.
  let size = SIZES[SIZES.length - 1];
  let lines: string[] = [];
  for (size of SIZES) {
    ctx.font = `400 ${size}px ${DISPLAY}`;
    lines = wrapText(letter.body, width, measure);
    if (lines.length <= Math.floor(room / rowFor(size))) break;
  }
  const row = rowFor(size);
  const rows = Math.max(1, Math.floor(room / row));
  lines = firstLines(lines, rows, width, measure).lines;

  // The rules and the red margin run the height of the words' part of the page.
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 2;
  for (let i = 0; i < rows; i++) {
    const y = top + (i + 1) * row + 0.5;
    ctx.beginPath();
    ctx.moveTo(PAGE.x + 1, y);
    ctx.lineTo(PAGE.x + PAGE.w - 1, y);
    ctx.stroke();
  }
  ctx.strokeStyle = MARGIN;
  ctx.beginPath();
  ctx.moveTo(PAGE.x + 70.5, top + 8);
  ctx.lineTo(PAGE.x + 70.5, PAGE.y + PAGE.h - 1);
  ctx.stroke();

  ctx.fillStyle = INK;
  lines.forEach((line, i) => ctx.fillText(line, textX, top + (i + 1) * row - Math.round(size * 0.28)));
}

// Text around a circle, centered on `middle` (radians; 0 points right, so the top is -π/2).
function arcText(ctx: Ctx, text: string, cx: number, cy: number, radius: number, middle: number, spread: number) {
  const step = spread / Math.max(1, text.length - 1);
  [...text].forEach((char, i) => {
    const angle = middle + (i - (text.length - 1) / 2) * step;
    ctx.save();
    ctx.translate(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillText(char, 0, 0);
    ctx.restore();
  });
}

function postmark(ctx: Ctx, date: string, cx: number, cy: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((-9 * Math.PI) / 180);
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = RED;
  ctx.fillStyle = RED;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 56, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 35, 0, Math.PI * 2);
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 12.5px ${BODY}`;
  arcText(ctx, "SANTA’S MAILBAG", 0, 0, 45.5, -Math.PI / 2, 2.5);
  ctx.font = `600 11px ${BODY}`;
  for (const angle of [Math.PI / 2 - 0.3, Math.PI / 2, Math.PI / 2 + 0.3]) {
    ctx.fillText("★", Math.cos(angle) * 45.5, Math.sin(angle) * 45.5);
  }
  ctx.font = `700 15px ${BODY}`;
  ctx.fillText(date.toUpperCase(), 0, 1);
  ctx.restore();
}

// WPR's flag on white under the thick-over-thin rule, with where to read the rest.
function foot(ctx: Ctx, letter: Letter, badge: HTMLImageElement | null, wordmark: HTMLImageElement | null) {
  const bottom = H - EDGE;
  ctx.fillStyle = "#fff";
  ctx.fillRect(EDGE, FOOT, W - EDGE * 2, bottom - FOOT);
  ctx.fillStyle = SLATE;
  ctx.fillRect(EDGE, FOOT, W - EDGE * 2, 4);
  ctx.fillRect(EDGE, FOOT + 8, W - EDGE * 2, 1);

  if (badge) ctx.drawImage(badge, LEFT, FOOT + 28, 84, 84);
  const x = LEFT + 104;
  if (wordmark) {
    const height = 40;
    ctx.drawImage(wordmark, x, FOOT + 30, (wordmark.naturalWidth / wordmark.naturalHeight) * height, height);
  } else {
    ctx.fillStyle = INK;
    ctx.font = `700 34px ${BODY}`;
    ctx.fillText("Wausau Pilot & Review", x, FOOT + 62);
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = TEAL_DEEP;
  ctx.font = `600 23px ${BODY}`;
  ctx.fillText(`Read every letter: ${env.mailbagPageUrl.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}`, x, FOOT + 104);

  postmark(ctx, apDate(letter.created_at), RIGHT - 60, FOOT + 70);
}

export async function letterPicture(letter: Letter, sponsor: Sponsor | undefined): Promise<Blob> {
  const base = import.meta.env.BASE_URL;
  // The page's own faces, in every weight the picture uses, before anything is drawn with them.
  const fonts = Promise.all([
    ...["650 88px", "600 42px", "400 42px", "400 68px"].map((font) => document.fonts.load(`${font} "Fraunces"`)),
    ...["600 23px", "700 22px"].map((font) => document.fonts.load(`${font} "Public Sans"`)),
  ]);
  const [badge, wordmark, photo, logo] = await Promise.all([
    image(`${base}wpr-typewriter-badge.png`),
    image(`${base}wpr-wordmark.png`),
    letter.photo_id ? storageImage(photoUrl(letter.photo_id, "full")) : null,
    sponsor?.logo_path ? storageImage(logoUrl(sponsor.logo_path)) : null,
  ]);
  await fonts;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can’t make the picture.");
  envelope(ctx);
  head(ctx, letter);
  stamp(ctx, sponsor, logo, badge);
  page(ctx, letter, photo);
  foot(ctx, letter, badge, wordmark);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("This browser can’t make the picture."))),
      "image/jpeg",
      0.92,
    );
  });
}
