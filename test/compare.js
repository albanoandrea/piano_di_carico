// Confronto tra il metodo normale (autoPlan) e il metodo per costo (autoPlanCost).
// Uso: node test/compare.js   (può durare qualche minuto)
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/\/\/ =+ CORE-START[\s\S]*?\/\/ =+ CORE-END =+/);
const ctx = {};
vm.createContext(ctx);
vm.runInContext(m[0] + '\n;Object.assign(this,{DEFAULT_CONTAINERS,DEFAULT_OPTS,expandRows,autoPlan,autoPlanCost,analyze,cvol});', ctx);
const C = ctx;

const r = (code, l, w, h, kg, qty, stack) => ({ code, l, w, h, kg, qty, stack });
const LOADS = [
  ['Esempio del programma', [r('PAL-A', 120, 80, 110, 450, 24, true), r('PAL-B', 120, 100, 105, 600, 10, true), r('CASSA 1', 200, 110, 90, 380, 8, true), r('CASSA 2', 150, 90, 60, 120, 10, false), r('MACCHINA', 240, 150, 180, 1500, 3, false)]],
  ['11 europallet non sovrapp.', [r('EUR', 120, 80, 150, 300, 11, false)]],
  ['22 europallet sovrapp. h100', [r('EUR', 120, 80, 100, 300, 22, true)]],
  ['30 europallet h120', [r('EUR', 120, 80, 120, 400, 30, true)]],
  ['45 pallet 120x100 non sovr.', [r('IND', 120, 100, 140, 500, 45, false)]],
  ['70 europallet non sovr.', [r('EUR', 120, 80, 130, 350, 70, false)]],
  ['Acciaio 40 t', [r('COILS', 120, 120, 80, 2000, 20, false)]],
  ['400 cartoni piccoli', [r('CART', 60, 40, 40, 15, 400, true)]],
  ['Tubi lunghi 6 m', [r('TUBI', 580, 50, 50, 300, 30, true), r('PAL', 120, 80, 100, 400, 8, true)]],
  ['Casse alte 250 cm', [r('ALTA', 120, 100, 250, 600, 8, false), r('EUR', 120, 80, 110, 300, 10, true)]],
  ['Macchine + pallet', [r('MAC', 300, 200, 200, 3000, 3, false), r('EUR', 120, 80, 100, 400, 20, true), r('CASSA', 100, 60, 50, 80, 30, true)]],
  ['Misto magazzino', [r('A', 120, 80, 140, 350, 18, true), r('B', 100, 100, 90, 250, 12, true), r('C', 80, 60, 70, 120, 25, true), r('D', 160, 120, 110, 700, 6, false), r('E', 200, 90, 60, 200, 10, false)]],
  ['Mobili leggeri', [r('ARMADIO', 200, 60, 210, 90, 12, false), r('TAVOLO', 180, 90, 40, 60, 15, true), r('SEDIE', 60, 60, 100, 25, 40, true)]]
];

const conts = () => JSON.parse(JSON.stringify(C.DEFAULT_CONTAINERS));
const opts = { ...C.DEFAULT_OPTS };
const fill = (s, cs, units) => units.reduce((a, u) => a + u.l * u.w * u.h, 0) / s.conts.reduce((a, k) => a + C.cvol(cs[k.ci]), 0);
const short = n => n.replace("' Standard", "'").replace("' High Cube", "'HC");
function describe(s, cs, units, ms) {
  const placed = s.conts.reduce((a, k) => a + k.boxes.length, 0);
  const ok = s.conts.every(k => C.analyze(k.boxes, cs[k.ci], opts).errs.size === 0);
  return {
    combo: s.conts.map(k => short(cs[k.ci].name)).join('+'),
    cost: s.conts.reduce((a, k) => a + (cs[k.ci].cost || 0), 0),
    fill: Math.round(fill(s, cs, units) * 100),
    out: units.length - placed, ok, sec: (ms / 1000).toFixed(1)
  };
}

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('Carico', 30) + pad('Normale', 26) + pad('costo', 7) + pad('s', 6) + pad('Per costo', 26) + pad('costo', 7) + 's');
let wins = { std: 0, cost: 0, same: 0 }, tStd = 0, tCost = 0;
for (const [name, rows] of LOADS) {
  const cs = conts(), units = C.expandRows(rows);
  let t = Date.now(); const a = C.autoPlan(units, cs, opts)[0]; const ma = Date.now() - t;
  t = Date.now(); const b = C.autoPlanCost(units, cs, opts)[0]; const mb = Date.now() - t;
  tStd += ma; tCost += mb;
  const da = describe(a, cs, units, ma), db = describe(b, cs, units, mb);
  // il 45' non ha costo nel metodo per costo: per confrontare vale 2.2
  const cost = (s) => s.conts.reduce((x, k) => x + (cs[k.ci].cost || 2.2), 0);
  const ca = cost(a), cb = cost(b);
  const tag = d => d.combo + (d.out ? ' (' + d.out + ' fuori)' : '') + (d.ok ? '' : ' ERR');
  console.log(pad(name, 30) + pad(tag(da), 26) + pad(ca.toFixed(2), 7) + pad(da.sec, 6) + pad(tag(db), 26) + pad(cb.toFixed(2), 7) + db.sec);
  const better = (x, y, dx, dy) => dx.out !== dy.out ? dx.out < dy.out : x < y - 1e-9;
  if (better(ca, cb, da, db)) wins.std++; else if (better(cb, ca, db, da)) wins.cost++; else wins.same++;
}
console.log('\nMigliore (meno colli fuori, poi costo minore): normale ' + wins.std + ', per costo ' + wins.cost + ', pari ' + wins.same);
console.log('Tempo totale: normale ' + (tStd / 1000).toFixed(1) + ' s, per costo ' + (tCost / 1000).toFixed(1) + ' s');
