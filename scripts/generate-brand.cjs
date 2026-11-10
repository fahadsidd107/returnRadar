const fs = require("fs");
const path = require("path");
const { Resvg } = require("../apps/mobile/node_modules/@resvg/resvg-js");
const root = path.resolve(__dirname, "..");
const arrow =
  '<path d="M101 43A45 45 0 1 1 72 20M80 9 101 23 78 34" fill="none" stroke="#53E0BA" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>';
const parcel =
  '<path d="m42 55 22-12 22 12v27L64 95 42 82Z" fill="#F7F8F4"/><path d="m42 55 22 13 22-13M64 68v27m-11-46 22 13" fill="none" stroke="#102A43" stroke-width="3"/>';
const mark = arrow + parcel;
const svg = (body, view = "0 0 128 128") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}">${body}</svg>`;
function save(file, s) {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), s);
}
function raster(file, source, size) {
  save(
    file,
    new Resvg(source, { fitTo: { mode: "width", value: size } })
      .render()
      .asPng(),
  );
}
save("assets/brand/source/symbol.svg", svg(mark));
save(
  "assets/brand/source/icon.svg",
  svg(
    '<path fill="#102A43" d="M0 0h128v128H0z"/>' +
      `<g transform="translate(16 16) scale(.75)">${mark}</g>`,
  ),
);
for (const [name, color, bg] of [
  ["light", "#102A43", ""],
  ["dark", "#F7F8F4", "#102A43"],
  ["mono", "#102A43", ""],
]) {
  const symbol =
    name === "mono"
      ? mark
          .replaceAll("#53E0BA", color)
          .replaceAll("#F7F8F4", color)
          .replaceAll('stroke="#102A43"', 'stroke="#FFFFFF"')
      : mark;
  const font = 'font-family="Manrope" font-weight="700"';
  save(
    `assets/brand/logo/horizontal-${name}.svg`,
    svg(
      `${bg ? `<path fill="${bg}" d="M0 0h500v128H0z"/>` : ""}${symbol}<text x="150" y="79" fill="${color}" font-size="42" ${font}>Return Radar</text>`,
      "0 0 500 128",
    ),
  );
  save(
    `assets/brand/logo/stacked-${name}.svg`,
    svg(
      `${bg ? `<path fill="${bg}" d="M0 0h300v230H0z"/>` : ""}<g transform="translate(86 16)">${symbol}</g><text x="150" y="198" text-anchor="middle" fill="${color}" font-size="34" ${font}>Return Radar</text>`,
      "0 0 300 230",
    ),
  );
  save(`assets/brand/logo/symbol-${name}.svg`, svg(symbol));
}
const icon = fs.readFileSync(
  path.join(root, "assets/brand/source/icon.svg"),
  "utf8",
);
raster("assets/brand/icon/app-1024.png", icon, 1024);
raster("apps/mobile/assets/icon.png", icon, 1024);
raster("apps/mobile/assets/favicon.png", icon, 64);
const adaptive = svg(`<g transform="translate(24 24) scale(.625)">${mark}</g>`);
save("assets/brand/source/adaptive-foreground.svg", adaptive);
raster("apps/mobile/assets/android-icon-foreground.png", adaptive, 432);
raster(
  "apps/mobile/assets/android-icon-background.png",
  svg('<path fill="#102A43" d="M0 0h128v128H0z"/>'),
  432,
);
raster(
  "apps/mobile/assets/android-icon-monochrome.png",
  adaptive
    .replaceAll("#53E0BA", "#FFFFFF")
    .replaceAll("#F7F8F4", "#FFFFFF")
    .replaceAll("#102A43", "#FFFFFF"),
  432,
);
raster("apps/mobile/assets/splash-icon.png", svg(mark), 512);
raster("assets/brand/splash/mark.png", svg(mark), 512);
console.log("Brand vectors and raster assets generated.");
