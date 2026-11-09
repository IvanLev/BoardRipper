// Rewrite an Altium .PcbDoc keeping only the streams BoardRipper's parser reads.
// Produced tests/fixtures/altium-comments.PcbDoc (2.2 MB → 241 KB; the parsed
// BoardData is identical to the original's — 3D models, rules, fonts and the
// Board6 layer caches are what goes).
//
//   node tests/fixtures/make-altium-fixture.cjs <in.PcbDoc> <out.PcbDoc>
const CFB = require('cfb');
const fs = require('fs');
const [src, dst] = process.argv.slice(2);
const c = CFB.read(fs.readFileSync(src), { type: 'buffer' });
const keep = ['FileHeader', 'Board6', 'Components6', 'Pads6', 'Nets6', 'Classes6', 'WideStrings6', 'Texts6',
  'Tracks6', 'Vias6', 'Arcs6', 'Fills6', 'Regions6', 'ShapeBasedRegions6'];
const out = CFB.utils.cfb_new();
for (let i = 0; i < c.FullPaths.length; i++) {
  const p = c.FullPaths[i].replace(/^Root Entry\//, '');
  const e = c.FileIndex[i];
  if (e.type !== 2) continue; // streams only
  const top = p.split('/')[0];
  if (!keep.includes(top)) continue;
  let body = Buffer.from(e.content ?? []);
  if (p === 'Board6/Data') {
    // Board6 is one length-prefixed property bag, mostly layer caches and 3D
    // configuration. Keep only the keys the parser reads.
    const text = body.subarray(4).toString('latin1');
    const kept = text.split('|').filter(kv => /^(LAYER\d+NAME|ORIGINX|ORIGINY|VERSION|BOARDDESCRIPTION)=/.test(kv));
    const bag = Buffer.from('|' + kept.join('|') + '|\0', 'latin1');
    const len = Buffer.alloc(4); len.writeUInt32LE(bag.length);
    body = Buffer.concat([len, bag]);
  }
  CFB.utils.cfb_add(out, '/' + p, body);
}
CFB.utils.cfb_del(out, '/\u0001Sh33tJ5');
fs.writeFileSync(dst, CFB.write(out, { type: 'buffer', fileType: 'cfb' }));
