// One-off brand icon generator. The repo shipped Expo's placeholder assets
// (grey cube favicon, concentric-circle icon) which is why the web tab showed
// no logo. This draws the Hereby mark — a white "H" with a blue accent dot on
// the brand orange — with 3x3 supersampling for smooth edges, using pngjs (no
// native image tooling available on this machine).
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");

const ORANGE = [0xff, 0x6b, 0x35];
const WHITE = [0xff, 0xff, 0xff];
const BLUE = [0x4c, 0x9e, 0xeb]; // accentBlue #4C9EEB

function insideRoundedRect(x, y, S, r) {
  const c = S / 2;
  const half = S / 2;
  const dx = Math.max(Math.abs(x - c) - (half - r), 0);
  const dy = Math.max(Math.abs(y - c) - (half - r), 0);
  return dx * dx + dy * dy <= r * r;
}

function insideCircle(x, y, cx, cy, r) {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

// Axis-aligned rect test in normalized centred units.
function inRectN(u, v, x0, x1, y0, y1) {
  return u >= x0 && u <= x1 && v >= y0 && v <= y1;
}

// Returns [r,g,b,a] for a sub-sample point in an "H + dot" icon of side S.
// `cornerR` = rounded-square background radius (0 => full-bleed square, good
// for Android adaptive foreground). `scale` shrinks the mark toward the centre
// (adaptive icons get cropped to a circle, so it must sit in the safe zone).
function sample(x, y, S, cornerR, scale) {
  const inBg = cornerR > 0 ? insideRoundedRect(x, y, S, cornerR) : true;
  if (!inBg) return [0, 0, 0, 0];

  // Normalised, centred coordinates (in units of S), un-scaled about centre.
  const u = (x - S / 2) / S / scale;
  const v = (y - S / 2) / S / scale;

  // H geometry (centred). Legs + crossbar.
  const legW = 0.088;
  const leftLeg = inRectN(u, v, -0.168, -0.168 + legW, -0.235, 0.195);
  const rightLeg = inRectN(u, v, 0.168 - legW, 0.168, -0.235, 0.195);
  const crossbar = inRectN(u, v, -0.168, 0.168, -0.03, 0.05);
  if (leftLeg || rightLeg || crossbar) return [...WHITE, 255];

  // Blue accent dot, top-right (in the same centred/scaled space).
  const dcx = S / 2 + 0.282 * S * scale;
  const dcy = S / 2 - 0.278 * S * scale;
  if (insideCircle(x, y, dcx, dcy, 0.052 * S * scale)) return [...BLUE, 255];

  return [...ORANGE, 255];
}

function render(S, file, { cornerR = S * 0.22, scale = 1 } = {}) {
  const png = new PNG({ width: S, height: S });
  const SS = 3; // supersample grid
  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = px + (sx + 0.5) / SS;
          const y = py + (sy + 0.5) / SS;
          const [cr, cg, cb, ca] = sample(x, y, S, cornerR, scale);
          const af = ca / 255;
          r += cr * af;
          g += cg * af;
          b += cb * af;
          a += ca;
        }
      }
      const n = SS * SS;
      const idx = (S * py + px) << 2;
      const aAvg = a / n;
      // Un-premultiply so edges keep colour against transparency.
      const cover = aAvg / 255 || 1;
      png.data[idx] = Math.round(r / n / cover);
      png.data[idx + 1] = Math.round(g / n / cover);
      png.data[idx + 2] = Math.round(b / n / cover);
      png.data[idx + 3] = Math.round(aAvg);
    }
  }
  const out = path.join(__dirname, "..", "assets", file);
  png.pack().pipe(fs.createWriteStream(out)).on("finish", () => console.log("wrote", file));
}

// Web favicon + browser tab + native app icon: rounded-square orange tile.
render(256, "favicon.png", {});
render(1024, "icon.png", {});
render(1024, "splash-icon.png", {});
// Android adaptive foreground: full-bleed (bg colour set in app.json), pin
// pulled into the circular safe zone.
render(1024, "adaptive-icon.png", { cornerR: 0, scale: 0.72 });
