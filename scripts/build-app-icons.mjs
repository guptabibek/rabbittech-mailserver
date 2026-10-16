// Builds the icons of the installable webmail (data/web/webmail.webmanifest) from the RabbitTech
// mark, data/web/img/rabbittech_mark.svg, into data/web/img/app/:
//   webmail-192.png, webmail-512.png  the mark as it is (rounded tile, transparent corners)
//   webmail-maskable-512.png          the rabbit on a full violet square, inside the circle
//                                     Android may cut the icon to (80% of the width)
//   apple-touch-icon.png              180px, opaque square; iOS rounds the corners itself
// Uses Playwright from tests/ui. Run: cd tests/ui && npm ci && node ../../scripts/build-app-icons.mjs
// /img/ is served with a long cache lifetime, so give changed icons new file names.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(join(repo, 'tests/ui/package.json'))('playwright');
const out = join(repo, 'data/web/img/app');
mkdirSync(out, { recursive: true });

const mark = readFileSync(join(repo, 'data/web/img/rabbittech_mark.svg'), 'utf8');
const defs = mark.match(/<defs>[\s\S]*?<\/defs>/)[0];
// Everything drawn on the tile: the rabbit outline, eyes and smile
const rabbit = mark.slice(mark.indexOf('/>', mark.indexOf('<rect')) + 2, mark.lastIndexOf('</svg>'));

const browser = await chromium.launch();
const page = await browser.newPage();

// The rabbit's bounding box, to centre and scale it on the full-bleed icons
await page.setContent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 104 104"><g id="r">${rabbit}</g></svg>`);
const box = await page.evaluate(() => {
  const b = document.getElementById('r').getBBox();
  return { x: b.x, y: b.y, width: b.width, height: b.height };
});

// share: the part of the icon's width the rabbit's diagonal may take
const square = share => {
  const scale = share * 104 / Math.hypot(box.width, box.height);
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 104 104">${defs}` +
    `<rect width="104" height="104" fill="url(#rtMark)"/>` +
    `<g transform="translate(52 52) scale(${scale}) translate(${-cx} ${-cy})">${rabbit}</g></svg>`;
};

const icons = [
  ['webmail-192.png', 192, mark, true],
  ['webmail-512.png', 512, mark, true],
  // A circle of 80% of the width is the safe zone of a maskable icon
  ['webmail-maskable-512.png', 512, square(0.78), false],
  ['apple-touch-icon.png', 180, square(1.05), false],
];
for (const [name, size, svg, transparent] of icons) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>` +
    svg.replace(/<svg [^>]*?>/, m => m.replace(/ width="\d+"| height="\d+"/g, '')));
  await page.screenshot({ path: join(out, name), omitBackground: transparent });
  console.log('wrote', join('data/web/img/app', name));
}
await browser.close();
