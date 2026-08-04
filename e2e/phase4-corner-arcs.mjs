// Every corner arc of a link outline must bulge away from the body. A wrong
// sweep flag draws the same-radius arc on the other circle: it bulges inward
// and takes a bite out of the corner. Checked across a drag, because the hull
// order changes as joints move and the flag has to stay right at every step.
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';

const MECHS = {
  tlab: '?2P.Fe.K,0.1011.MA,A,0,0,0.GB,B,Nm,0,0.GC,C,126,lL,0.KD,D,17S,0,0.GE,E,1As,PW,0.GF,F,dq,Uc,0.GG,G,W5,tN,0.GH,H,Bu,G4,0.GI,I,11K,UW,0..YRABH,ABH,2ZQ,n9pzh4,01Zi,bM,c5cae9,A,B,H,,.YRBCFG,BCFG,9o,A80cTW,jM2,p3C,303e9f,B,C,F,G,,.YRCDEI,CDEI,1Cb,w-akVq,1pNm,0550,0d125a,C,D,E,I,,...N_U',
  watt: '?2P.Fe.K,0.1011.MA,A,0wS,0bg,0.GB,B,0gW,EE,0.GC,C,Oi,6k,0.GD,D,03m,_g,0.GE,E,1FO,1I_,0.GF,F,1-C,qM,0.KG,G,1oO,0ss,0..YRAB,AB,1E8,1a,0oU,0Bk,c5cae9,A,B,,.YRBCD,BCD,2SG,38,07C,Rt,303e9f,B,C,D,,.YRDE,DE,1E8,1a,bq,18q,0d125a,D,E,,.YREF,EF,2SG,38,1dI,13g,B2DFDB,E,F,,.YRCFG,CFG,1E8,1a,1Om,1Q,26A69A,C,F,G,,..2F1,CFG,F1,1Om,1Q,1ck,8P,DfU..N_O',
};
const DRAGS = { tlab: ['H', 'F', 'C'], watt: ['B', 'D', 'F'] };

const failures = [];
let frames = 0;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

/** Concave corner arcs in a link outline, by area sign. */
const concaveCorners = () =>
  page.evaluate(() => {
    const bad = [];
    for (const path of document.querySelectorAll('#linkHolder path[id]')) {
      // The outline only: subpaths after the first are channels cut into it,
      // whose winding is their own business.
      const d = (path.getAttribute('d') ?? '').split(/(?=M)/)[0] ?? '';
      if (!d.includes('A')) continue;
      const commands = [...d.matchAll(/([MLA])([^MLAZ]*)/g)].map(([, letter, body]) => ({
        letter,
        values: (body.match(/-?\d+(\.\d+)?(e-?\d+)?/g) ?? []).map(Number),
      }));
      const points = commands.map((c) => c.values.slice(-2));
      // The outline's own winding, from the polygon through its command ends.
      let area = 0;
      for (let i = 0; i < points.length; i++) {
        const [x1, y1] = points[i];
        const [x2, y2] = points[(i + 1) % points.length];
        area += x1 * y2 - x2 * y1;
      }
      const wanted = area > 0 ? 1 : 0;
      commands.forEach((command, index) => {
        if (command.letter !== 'A') return;
        const sweep = command.values[4];
        if (sweep !== wanted) {
          bad.push({ link: path.id, corner: index, sweep, wanted });
        }
      });
    }
    const joints = [...document.querySelectorAll('#jointHolder svg[x]')].map((s) => ({
      id: s.querySelector('[id^=joint_]')?.id,
      x: Number(s.getAttribute('x')),
      y: Number(s.getAttribute('y')),
    }));
    const paths = [...document.querySelectorAll('#linkHolder path[id]')].map((p) => ({
      id: p.id,
      d: p.getAttribute('d'),
    }));
    return { bad, joints, paths };
  });

const screenOf = (x, y) =>
  page.evaluate(
    ([mx, my]) => {
      const holder = document.querySelector('#linkHolder');
      const p = holder.ownerSVGElement.createSVGPoint();
      p.x = mx;
      p.y = my;
      const s = p.matrixTransform(holder.getScreenCTM());
      return { x: s.x, y: s.y };
    },
    [x, y]
  );
const jointAt = (id) =>
  page.evaluate((jid) => {
    const svg = document.querySelector(`#joint_${jid}`)?.closest('svg[x]');
    return svg ? { x: Number(svg.getAttribute('x')), y: Number(svg.getAttribute('y')) } : null;
  }, id);

for (const [name, query] of Object.entries(MECHS)) {
  for (const id of DRAGS[name]) {
    for (const [dx, dy] of [
      [1.6, 1.1],
      [-1.9, 0.8],
      [0.7, -1.7],
      [-1.2, -1.4],
    ]) {
      await page.goto(`${BASE}/${query}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(900);
      const from = await jointAt(id);
      if (!from) continue;
      const a = await screenOf(from.x, from.y);
      const b = await screenOf(from.x + dx, from.y + dy);
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      for (let step = 1; step <= 8; step++) {
        await page.mouse.move(a.x + ((b.x - a.x) * step) / 8, a.y + ((b.y - a.y) * step) / 8);
        await page.waitForTimeout(35);
        frames++;
        const shot = await concaveCorners();
        if (shot.bad.length) failures.push({ name, id, dx, dy, step, ...shot });
      }
      await page.mouse.up();
      await page.waitForTimeout(120);
      frames++;
      const shot = await concaveCorners();
      if (shot.bad.length) failures.push({ name, id, dx, dy, step: 'release', ...shot });
    }
  }
}

console.log(`${frames} frames checked, ${failures.length} with a corner arc on the wrong side`);
if (failures.length) console.log(JSON.stringify(failures.slice(0, 3), null, 1));
await browser.close();
process.exit(failures.length ? 1 : 0);
