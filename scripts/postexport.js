// Post-export patch for the web build. Run after `expo export -p web`.
//
// Two things the export doesn't do for us (and that get wiped every rebuild):
//   1. Viewport meta — the default lacks `maximum-scale=1, user-scalable=no`,
//      so mobile browsers auto-zoom the whole page when an input is focused and
//      never zoom back out. (`app/+html.tsx` only applies with output:"static";
//      this app uses the default "single" output, so we patch the HTML here.)
//   2. Netlify SPA fallback — `dist/_redirects` so deep links resolve.
const fs = require("fs");
const path = require("path");

const dist = path.join(__dirname, "..", "dist");
const indexPath = path.join(dist, "index.html");

let html = fs.readFileSync(indexPath, "utf8");
const wanted =
  '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, shrink-to-fit=no" />';
html = html.replace(/<meta name="viewport"[^>]*>/, wanted);
fs.writeFileSync(indexPath, html);

fs.writeFileSync(path.join(dist, "_redirects"), "/*    /index.html   200\n");

console.log("postexport: patched viewport meta + wrote _redirects");
