// Test della logica di calcolo (blocco CORE di index.html).
// Uso: node test/core.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/\/\/ =+ CORE-START[\s\S]*?\/\/ =+ CORE-END =+/);
if (!m) { console.error('Blocco CORE non trovato in index.html'); process.exit(1); }
const ctx = {};
vm.createContext(ctx);
vm.runInContext(m[0] + '\n;Object.assign(this,{EPS,DEFAULT_CONTAINERS,DEFAULT_OPTS,expandRows,bestPack,autoPlan,autoPlanCost,planCombo,analyze,parseTable,cvol});', ctx);
const C = ctx;

let fail = 0, pass = 0;
function check(name, ok, info) {
  if (ok) { pass++; console.log('ok   ' + name); }
  else { fail++; console.log('FAIL ' + name + (info ? '  -> ' + info : '')); }
}
const conts = () => JSON.parse(JSON.stringify(C.DEFAULT_CONTAINERS));
const opts = (o) => ({ ...C.DEFAULT_OPTS, ...o });
const units = (rows) => C.expandRows(rows);
const names = (sol, cs) => sol.conts.map(k => cs[k.ci].name).join(' + ');
const placed = (sol) => sol.conts.reduce((s, k) => s + k.boxes.length, 0);
function noErrors(sol, cs, o) {
  return sol.conts.every(k => C.analyze(k.boxes, cs[k.ci], o).errs.size === 0);
}
function uniqueUids(sol) {
  const all = sol.conts.flatMap(k => k.boxes.map(b => b.uid)).concat(sol.unplaced.map(u => u.uid));
  return new Set(all).size === all.length;
}
function time(fn) { const t = Date.now(); const r = fn(); return [r, Date.now() - t]; }

// 1. 11 europallet non sovrapponibili in un 20'
{
  const cs = conts(), o = opts();
  const sols = C.autoPlan(units([{ code: 'EUR', l: 120, w: 80, h: 150, kg: 300, qty: 11, stack: false }]), cs, o);
  const s = sols[0];
  check('11 europallet non sovrapponibili -> 1 x 20\'', s.fit && s.conts.length === 1 && cs[s.conts[0].ci].name === "20' Standard", names(s, cs));
  check('11 europallet: nessun errore', noErrors(s, cs, o));
}

// 2. 22 europallet sovrapponibili alti 100 in un 20'
{
  const cs = conts(), o = opts();
  const s = C.autoPlan(units([{ code: 'EUR', l: 120, w: 80, h: 100, kg: 200, qty: 22, stack: true }]), cs, o)[0];
  check('22 europallet sovrapponibili -> 1 x 20\'', s.fit && s.conts.length === 1 && cs[s.conts[0].ci].name === "20' Standard", names(s, cs));
  check('22 europallet: nessun errore', noErrors(s, cs, o));
}

// 3. carico che non entra in un 45' -> più container
{
  const cs = conts(), o = opts();
  const u = units([{ code: 'CASSA', l: 120, w: 100, h: 200, kg: 300, qty: 60, stack: false }]);
  const [sols, ms] = time(() => C.autoPlan(u, cs, o));
  const s = sols[0];
  check('60 casse non sovrapponibili -> più container, tutto caricato', s.fit && s.conts.length > 1 && placed(s) === 60 && !s.unplaced.length, names(s, cs) + ', fuori ' + s.unplaced.length);
  check('60 casse: nessun errore in nessun container', noErrors(s, cs, o));
  check('60 casse: ogni collo una volta sola', uniqueUids(s));
  check('60 casse: nessun container vuoto', s.conts.every(k => k.boxes.length > 0));
  console.log('     soluzioni: ' + sols.map(x => names(x, cs)).join(' | ') + '  (' + ms + ' ms)');
}

// 4. limite di peso: forza più container anche se il volume basterebbe
{
  const cs = conts(), o = opts();
  const u = units([{ code: 'ACCIAIO', l: 100, w: 100, h: 50, kg: 2000, qty: 20, stack: true }]); // 40 t
  const s = C.autoPlan(u, cs, o)[0];
  const okKg = s.conts.every(k => k.boxes.reduce((t, b) => t + b.kg, 0) <= cs[k.ci].maxKg);
  check('40 t di acciaio -> 2 container, peso nei limiti', s.fit && s.conts.length === 2 && okKg, names(s, cs));
}

// 5. massimo container rispettato; con maxCont=1 si comporta come prima
{
  const cs = conts(), o = opts({ maxCont: 1 });
  const u = units([{ code: 'CASSA', l: 120, w: 100, h: 200, kg: 300, qty: 60, stack: false }]);
  const sols = C.autoPlan(u, cs, o);
  check('maxCont=1: un solo container e colli fuori', sols.length === 1 && sols[0].conts.length === 1 && !sols[0].fit && sols[0].unplaced.length > 0);
}
{
  const cs = conts(), o = opts();
  const u = units([{ code: 'CASSA', l: 120, w: 100, h: 200, kg: 100, qty: 400, stack: false }]);
  const [sols, ms] = time(() => C.autoPlan(u, cs, o));
  const s = sols[0];
  check('400 casse (troppo): massimo 5 container, colli fuori segnalati', s.conts.length <= 5 && !s.fit && s.unplaced.length > 0 && uniqueUids(s), s.conts.length + ' container, fuori ' + s.unplaced.length + ' (' + ms + ' ms)');
}

// 6. alternative: al massimo 3, la prima con meno container, riempimento entro la soglia
{
  const cs = conts(), o = opts({ altGap: 30 });
  const u = units([{ code: 'CASSA', l: 120, w: 100, h: 200, kg: 300, qty: 40, stack: false }]);
  const sols = C.autoPlan(u, cs, o);
  const fill = s => s.conts.reduce((t, k) => t + k.boxes.reduce((a, b) => a + b.l * b.w * b.h, 0), 0) / s.conts.reduce((t, k) => t + C.cvol(cs[k.ci]), 0);
  const f0 = fill(sols[0]);
  check('alternative: da 1 a 3 soluzioni', sols.length >= 1 && sols.length <= 3, sols.length);
  check('alternative: la prima ha il minor numero di container', sols.every(s => s.conts.length >= sols[0].conts.length));
  check('alternative: riempimento simile', sols.every(s => fill(s) >= f0 * 0.7 - 1e-9));
  check('alternative: tutte complete e senza errori', sols.every(s => s.fit && noErrors(s, cs, o) && uniqueUids(s)));
  check('alternative: combinazioni diverse', new Set(sols.map(s => s.conts.map(k => k.ci).sort().join())).size === sols.length);
  console.log('     soluzioni: ' + sols.map(s => names(s, cs) + ' ' + Math.round(fill(s) * 100) + '%').join(' | '));
}
{
  const cs = conts(), o = opts({ altGap: 0 });
  const u = units([{ code: 'EUR', l: 120, w: 80, h: 100, kg: 200, qty: 22, stack: true }]);
  check('altGap=0: una sola soluzione se le altre riempiono meno', C.autoPlan(u, cs, o).length === 1);
}

// 7. collo che non passa da nessuna porta
{
  const cs = conts(), o = opts();
  const u = units([{ code: 'OK', l: 120, w: 80, h: 100, kg: 100, qty: 2, stack: true }, { code: 'ENORME', l: 300, w: 300, h: 100, kg: 100, qty: 1, stack: true }]);
  const s = C.autoPlan(u, cs, o)[0];
  check('collo troppo grande: resta fuori, gli altri in un container', s.conts.length === 1 && s.unplaced.length === 1 && s.unplaced[0].code === 'ENORME' && placed(s) === 2);
}

// 8. planCombo (Ricalcola con container scelti)
{
  const cs = conts(), o = opts();
  const u = units([{ code: 'CASSA', l: 120, w: 100, h: 200, kg: 300, qty: 30, stack: false }]);
  const s = C.planCombo(u, [0, 0], cs, o);
  check('planCombo 2 x 20\': due container, nessun errore', s.conts.length === 2 && s.forced && noErrors(s, cs, o) && uniqueUids(s) && placed(s) + s.unplaced.length === 30);
}

// 9. container preferiti: a parità di numero di container si scelgono prima
{
  const u = units([{ code: 'EUR', l: 120, w: 80, h: 100, kg: 200, qty: 30, stack: true }]);
  const cs = conts(), o = opts();
  const s = C.autoPlan(u, cs, o)[0];
  check("preferiti: 30 europallet -> 40' Standard (preferito)", cs[s.conts[0].ci].name === "40' Standard", names(s, cs));
  const cs2 = conts(); cs2.forEach(c => c.pref = c.name === "40' High Cube");
  const s2 = C.autoPlan(u, cs2, o)[0];
  check("preferiti: se il preferito è il 40' High Cube, usa quello", s2.conts.length === 1 && cs2[s2.conts[0].ci].name === "40' High Cube", names(s2, cs2));
  const cs3 = conts(), o3 = opts({ timeLimit: 0 });
  const u3 = units([{ code: 'C', l: 120, w: 100, h: 200, kg: 300, qty: 30, stack: false }]);
  const s3 = C.autoPlan(u3, cs3, o3)[0];
  check('preferiti: 30 casse -> nessun container non preferito', s3.fit && s3.conts.every(k => cs3[k.ci].pref), names(s3, cs3));
}

// 10. ricerca migliorata: con il tempo a disposizione trova soluzioni più piccole di quella veloce
{
  const rows = [
    { code: 'PAL-A', l: 120, w: 80, h: 110, kg: 450, qty: 12, stack: true }, { code: 'PAL-B', l: 120, w: 100, h: 105, kg: 600, qty: 6, stack: true },
    { code: 'CASSA 1', l: 200, w: 110, h: 90, kg: 380, qty: 5, stack: true }, { code: 'CASSA 2', l: 150, w: 90, h: 60, kg: 120, qty: 6, stack: false },
    { code: 'MACCHINA', l: 240, w: 150, h: 180, kg: 1500, qty: 2, stack: false }];
  const cs = conts();
  const fast = C.autoPlan(units(rows), cs, opts({ timeLimit: 0 }))[0];
  const [slow, ms] = time(() => C.autoPlan(units(rows), cs, opts())[0]);
  check('ricerca migliorata: container più piccolo della ricerca veloce', slow.fit && C.cvol(cs[slow.conts[0].ci]) < C.cvol(cs[fast.conts[0].ci]), names(fast, cs) + ' -> ' + names(slow, cs) + ' (' + ms + ' ms)');
  check('ricerca migliorata: nessun errore', noErrors(slow, cs, opts()));
  check('ricerca migliorata: sotto i 10 secondi', ms < 10000, ms + ' ms');
}

// 11. parseTable
{
  const r = C.parseTable([['Codice', 'Lunghezza', 'Larghezza', 'Altezza', 'Peso', 'Quantità', 'Sovrapponibile'], ['A', '1,2', '0,8', '1', '100', '2', 'no']]);
  check('parseTable: virgola e metri -> cm', r.rows.length === 1 && r.rows[0].l === 120 && r.rows[0].h === 100 && r.rows[0].stack === false && r.rows[0].qty === 2);
}

// 12. esempio: colli già messi nel primo container possono servire a riempire gli spazi del secondo
{
  const cs = conts(), o = opts();
  const u = units([
    { code: 'PAL-A', l: 120, w: 80, h: 110, kg: 450, qty: 24, stack: true },
    { code: 'PAL-B', l: 120, w: 100, h: 105, kg: 600, qty: 10, stack: true },
    { code: 'CASSA 1', l: 200, w: 110, h: 90, kg: 380, qty: 8, stack: true },
    { code: 'CASSA 2', l: 150, w: 90, h: 60, kg: 120, qty: 10, stack: false },
    { code: 'MACCHINA', l: 240, w: 150, h: 180, kg: 1500, qty: 3, stack: false }]);
  const [sols, ms] = time(() => C.autoPlan(u, cs, o));
  const s = sols[0];
  console.log('     soluzioni: ' + sols.map(x => names(x, cs)).join(' | ') + '  (' + ms + ' ms)');
  check('esempio: 2 x 40\' Standard', s.fit && names(s, cs) === "40' Standard + 40' Standard", names(s, cs));
  check('esempio: nessun errore, ogni collo una volta sola', noErrors(s, cs, o) && uniqueUids(s) && placed(s) === u.length);
  check('esempio: c\'è un\'alternativa con 3 container', sols.some(x => x.conts.length === 3));
}

// 13. metodo per costo
{
  const cs = conts(), o = opts({ stepTime: 1500 });
  const s1 = C.autoPlanCost(units([{ code: 'EUR', l: 120, w: 80, h: 150, kg: 300, qty: 11, stack: false }]), cs, o)[0];
  check('costo: 11 europallet -> 1 x 20\'', s1.fit && names(s1, cs) === "20' Standard", names(s1, cs));
  const u = units([{ code: 'EUR', l: 120, w: 80, h: 130, kg: 350, qty: 40, stack: false }]);
  const s2 = C.autoPlanCost(u, cs, o)[0];
  const cost = s2.conts.reduce((a, k) => a + cs[k.ci].cost, 0);
  check('costo: 40 europallet non sovrapp. -> tutto dentro, senza errori', s2.fit && placed(s2) === u.length && noErrors(s2, cs, o) && uniqueUids(s2), names(s2, cs));
  check('costo: non usa il 45\' (costo 0)', s2.conts.every(k => cs[k.ci].cost > 0));
  check('costo: 40 europallet -> costo al massimo 3,6 (2 x 40\')', cost <= 3.6 + 1e-9, names(s2, cs) + ' costo ' + cost);
  const tall = C.autoPlanCost(units([{ code: 'ALTA', l: 120, w: 100, h: 250, kg: 500, qty: 4, stack: false }]), cs, o)[0];
  check('costo: colli alti 250 -> 40\' High Cube', tall.fit && names(tall, cs) === "40' High Cube", names(tall, cs));
}

console.log('\n' + pass + ' ok, ' + fail + ' falliti');
process.exit(fail ? 1 : 0);
