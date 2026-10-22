// JomGerak shared logic: simulated park history, groups, people and the two ML models.
// Used by both the mobile app and the web dashboard so they always agree.

// ---------- seeded random numbers (same data every run) ----------
export function rng(seed: number) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = rng(2026);

// ---------- places and times ----------
export type ParkId = 'central' | 'lake' | 'pocket';
export const PARKS: { id: ParkId; name: string; scale: number }[] = [
  { id: 'central', name: 'Central Park', scale: 1 },
  { id: 'lake', name: 'Lakeside Track', scale: 0.8 },
  { id: 'pocket', name: 'Precinct 4 Pocket Park', scale: 0.35 },
];
export const PARK_IDS = PARKS.map((p) => p.id);
export const parkName = (id: string) => PARKS.find((p) => p.id === id)?.name ?? 'Unknown park';

export type SlotId = 'early' | 'morning' | 'midday' | 'evening' | 'night';
export const SLOTS: { id: SlotId; label: string; time: string; from: number; to: number }[] = [
  { id: 'early', label: 'Early morning', time: '6–8 am', from: 6, to: 8 },
  { id: 'morning', label: 'Morning', time: '8–11 am', from: 8, to: 11 },
  { id: 'midday', label: 'Midday', time: '11 am–5 pm', from: 11, to: 17 },
  { id: 'evening', label: 'Evening', time: '5–7 pm', from: 17, to: 19 },
  { id: 'night', label: 'Night', time: '7–10 pm', from: 19, to: 22 },
];
export const SLOT_IDS = SLOTS.map((s) => s.id);
export const slotOf = (id: string) => SLOTS.find((s) => s.id === id)!;
export const currentSlot = (d = new Date()) => SLOTS.find((s) => d.getHours() >= s.from && d.getHours() < s.to) ?? null;
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKS = 8;

// ---------- simulated check-in history, weeks 1–8 ----------
// A lighting fault is injected on Lakeside Track evenings and nights in weeks 7–8.
const BASE = { wk: [22, 10, 3, 28, 14], we: [30, 20, 6, 26, 12] };
export const HISTORY: Record<string, number[][][]> = {};
PARKS.forEach((p) => {
  HISTORY[p.id] = [];
  for (let w = 0; w < WEEKS; w++) {
    const wk: number[][] = [];
    for (let d = 0; d < 7; d++) {
      const b = d >= 5 ? BASE.we : BASE.wk;
      wk.push(b.map((v, s) => {
        let x = v * p.scale * (1 + w * 0.012) * (0.85 + R() * 0.3);
        if (p.id === 'lake' && w >= 6 && (s === 3 || s === 4)) x *= 0.55;
        return Math.round(x);
      }));
    }
    HISTORY[p.id].push(wk);
  }
});
export const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
export function avgDay(p: string, d: number, s: number, from: number, to: number) {
  const v: number[] = []; for (let w = from; w < to; w++) v.push(HISTORY[p][w][d][s]); return mean(v);
}
export function avgSlot(p: string, s: number, from: number, to: number) {
  const v: number[] = []; for (let w = from; w < to; w++) for (let d = 0; d < 7; d++) v.push(HISTORY[p][w][d][s]); return mean(v);
}
export const weekly = (p: string, s: number) => HISTORY[p].map((wk) => wk.reduce((t, day) => t + day[s], 0));

// ---------- park paths (for the path heat map and report pins) ----------
export const SEGS: Record<ParkId, { id: string; name: string }[]> = {
  central: [{ id: 'c-n', name: 'North path' }, { id: 'c-e', name: 'East path' }, { id: 'c-s', name: 'Playground loop' }, { id: 'c-w', name: 'West path' }],
  lake: [{ id: 'l-n', name: 'North stretch (jetty)' }, { id: 'l-e', name: 'Wetland boardwalk bend' }, { id: 'l-s', name: 'South shore' }, { id: 'l-w', name: 'West shore' }],
  pocket: [{ id: 'p-a', name: 'Loop path' }],
};
const SHARE: Record<string, number> = { 'c-n': 0.3, 'c-e': 0.2, 'c-s': 0.3, 'c-w': 0.2, 'l-n': 0.3, 'l-e': 0.25, 'l-s': 0.25, 'l-w': 0.2, 'p-a': 1 };
const LAKE_MOD: Record<string, number> = { 'l-n': 0.3, 'l-e': 0.3, 'l-s': 0.8, 'l-w': 0.8 };
export const segPark = (id: string) => (Object.keys(SEGS) as ParkId[]).find((p) => SEGS[p].some((x) => x.id === id)) ?? null;
export const segName = (id: string) => { for (const p of Object.keys(SEGS) as ParkId[]) { const x = SEGS[p].find((x) => x.id === id); if (x) return x.name; } return ''; };
export function segUse(seg: string, si: number, recent: boolean) {
  const p = segPark(seg)!; const base = avgSlot(p, si, 0, 6) * SHARE[seg];
  if (!recent) return base;
  if (p === 'lake' && (si === 3 || si === 4)) return base * LAKE_MOD[seg];
  return avgSlot(p, si, 6, 8) * SHARE[seg];
}

// ---------- reports, groups, residents ----------
export const REPORT_TYPES = ['Lighting', 'Damaged path', 'Flooding', 'Stray animals', 'Other'];
export const STATUSES = ['Received', 'In progress', 'Fixed'];
export type Report = { id: string; park: ParkId; seg: string | null; type: string; spot: string; note: string; status: string; when_label: string | null; created_at: string; device_id: string | null; seed: boolean };
export type Checkin = { id: string; park: ParkId; slot: SlotId; created_at: string; device_id: string };
export type Join = { group_id: string; device_id: string };

export const MIN_GROUP = 5;
export const LVL = ['Beginner', 'Casual', 'Regular'];
export const ACTS = ['Jogging', 'Walking', 'Cycling', 'Badminton', 'Yoga'];
export type Group = { id: string; name: string; park: ParkId; day: string; slot: SlotId; lvl: number; going: number; isNew?: boolean };
export const GROUPS: Group[] = [
  { id: 'g1', name: 'Beginner Jog', park: 'central', day: 'Tue', slot: 'evening', lvl: 0, going: 8 },
  { id: 'g2', name: 'Sunrise Walk Club', park: 'central', day: 'Sat', slot: 'early', lvl: 0, going: 14 },
  { id: 'g3', name: 'Lakeside 5K Pace Group', park: 'lake', day: 'Thu', slot: 'evening', lvl: 2, going: 11 },
  { id: 'g4', name: 'Pocket Park Stretch & Walk', park: 'pocket', day: 'Wed', slot: 'night', lvl: 0, going: 6 },
  { id: 'g5', name: 'Weekend Cycling Loop', park: 'lake', day: 'Sun', slot: 'early', lvl: 1, going: 9 },
  { id: 'g6', name: 'After-work Badminton', park: 'central', day: 'Fri', slot: 'night', lvl: 1, going: 7 },
  { id: 'g7', name: 'Night Walk Starters', park: 'pocket', day: 'Mon', slot: 'night', lvl: 0, going: 2, isNew: true },
];

export type Person = { name: string; level: number; slots: SlotId[]; precinct: number; acts: string[] };
function pick<T>(arr: T[], n: number) { const a = [...arr]; const out: T[] = []; while (out.length < n && a.length) out.push(a.splice(Math.floor(R() * a.length), 1)[0]); return out; }
const NAMES = ['Hafiz', 'Mei Ling', 'Arjun', 'Nurul', 'Daniel', 'Siti', 'Kumar', 'Farah', 'Jason', 'Aisyah', 'Ravi', 'Liyana', 'Wei Jie', 'Amir', 'Priya', 'Zara', 'Iqbal', 'Hui Min', 'Syafiq', 'Kavitha', 'Adam', 'Chloe', 'Faiz', 'Nadia', 'Kelvin', 'Sofia', 'Haziq', 'Anis', 'Marcus', 'Deepa', 'Rizal', 'Yen', 'Hana', 'Ezra', 'Lina', 'Ganesh', 'Alya', 'Ming', 'Irfan'];
export const PEOPLE: Person[] = [{ name: 'Sarah', level: 0, slots: ['evening', 'night'], precinct: 4, acts: ['Jogging'] } as Person].concat(
  NAMES.map((n) => ({ name: n, level: Math.floor(R() * 3), slots: pick(SLOT_IDS.filter((s) => s !== 'midday'), 1 + Math.floor(R() * 2)), precinct: 1 + Math.floor(R() * 8), acts: pick(ACTS, 1 + Math.floor(R() * 2)) })),
);

// Demo resident code. In a pilot, codes come from SDP's handover records.
// The database checks the same formula in its verify_resident() function.
export const resCode = (precinct: number, house: number) => `ELM-${precinct}-${String(((house * 37 + precinct * 11) % 900) + 100)}`;

// =====================================================================
// MODEL 1 · Anomaly detection: ridge regression on log(people + 1), one per park
// Features: intercept, day of week (6), time slot (4), weekend x slot (5), week trend (1) = 17
// =====================================================================
function feats(w: number, d: number, s: number) {
  const x = new Array(17).fill(0); x[0] = 1; if (d > 0) x[d] = 1; if (s > 0) x[6 + s] = 1; if (d >= 5) x[11 + s] = 1; x[16] = w / 7; return x;
}
function solve(A: number[][], b: number[]) {
  const n = b.length; const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const v = M[c][c] || 1e-9;
    for (let r = 0; r < n; r++) { if (r === c) continue; const f = M[r][c] / v; if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / (r[i] || 1e-9));
}
type Obs = { w: number; d: number; s: number; x: number[]; y: number; raw: number };
function fitRidge(rows: Obs[], lambda: number) {
  const k = 17, A = Array.from({ length: k }, () => new Array(k).fill(0)), b = new Array(k).fill(0);
  rows.forEach(({ x, y }) => { for (let i = 0; i < k; i++) { b[i] += x[i] * y; for (let j = 0; j < k; j++) A[i][j] += x[i] * x[j]; } });
  for (let i = 1; i < k; i++) A[i][i] += lambda;
  return solve(A, b);
}
const dot = (a: number[], b: number[]) => a.reduce((t, v, i) => t + v * b[i], 0);
function obs(p: string, w0: number, w1: number): Obs[] {
  const r: Obs[] = [];
  for (let w = w0; w < w1; w++) for (let d = 0; d < 7; d++) for (let s = 0; s < 5; s++)
    r.push({ w, d, s, x: feats(w, d, s), y: Math.log1p(HISTORY[p][w][d][s]), raw: HISTORY[p][w][d][s] });
  return r;
}
export const ANOMALY: Record<string, { beta: number[]; sigma: number; r2: number; mae: number; mape: number; n: number }> = {};
PARKS.forEach((p) => {
  const train = obs(p.id, 0, 6), beta = fitRidge(train, 1);
  const res = train.map((o) => o.y - dot(beta, o.x));
  const sigma = Math.sqrt(res.reduce((t, v) => t + v * v, 0) / (train.length - 17));
  const my = mean(train.map((q) => q.y));
  const r2 = 1 - res.reduce((t, v) => t + v * v, 0) / train.reduce((t, o) => t + (o.y - my) ** 2, 0);
  const b5 = fitRidge(obs(p.id, 0, 5), 1), test = obs(p.id, 5, 6);
  const mae = mean(test.map((o) => Math.abs(Math.expm1(dot(b5, o.x)) - o.raw)));
  const mape = mean(test.filter((o) => o.raw >= 5).map((o) => Math.abs(Math.expm1(dot(b5, o.x)) - o.raw) / o.raw));
  ANOMALY[p.id] = { beta, sigma, r2, mae, mape, n: train.length };
});
export const expected = (p: string, w: number, d: number, s: number) => Math.expm1(dot(ANOMALY[p].beta, feats(w, d, s)));
export const zScore = (p: string, w: number, d: number, s: number) => (Math.log1p(HISTORY[p][w][d][s]) - dot(ANOMALY[p].beta, feats(w, d, s))) / ANOMALY[p].sigma;
export const weeklyExpected = (p: string, s: number) => Array.from({ length: WEEKS }, (_, w) => { let t = 0; for (let d = 0; d < 7; d++) t += expected(p, w, d, s); return t; });

export type Alert = { park: (typeof PARKS)[number]; slot: (typeof SLOTS)[number]; si: number; z: number; e: number; a: number; abn: number; n: number; reports: Report[] };
export function computeAlerts(threshold: number, reports: Report[]): Alert[] {
  const out: Alert[] = [];
  PARKS.forEach((p) => SLOTS.forEach((s, si) => {
    const zs: number[] = [], ex: number[] = [], ac: number[] = [];
    for (let w = 6; w < 8; w++) for (let d = 0; d < 7; d++) { zs.push(zScore(p.id, w, d, si)); ex.push(expected(p.id, w, d, si)); ac.push(HISTORY[p.id][w][d][si]); }
    const z = mean(zs), e = mean(ex), a = mean(ac), abn = zs.filter((v) => v <= -2).length;
    if (e >= 5 && z <= -threshold) out.push({ park: p, slot: s, si, z, e, a, abn, n: zs.length, reports: reports.filter((h) => h.park === p.id && h.status !== 'Fixed') });
  }));
  return out.sort((a, b) => Number(b.reports.length > 0) - Number(a.reports.length > 0) || a.z - b.z);
}

// =====================================================================
// MODEL 2 · Buddy matching: logistic regression on past pairings
// Label: did a matched pair meet 3+ times in their first month? (simulated history)
// =====================================================================
const jac = (a: string[], b: string[]) => { const B = new Set(b); const i = a.filter((x) => B.has(x)).length; const u = new Set([...a, ...b]).size; return u ? i / u : 0; };
export const BUDDY_FEATURES = ['Schedule overlap', 'Fitness level match', 'Same precinct', 'Next-door precinct', 'Shared activities', 'Both beginners'];
export function factors(me: Person, p: Person) {
  return { schedule: jac(me.slots, p.slots), level: 1 - Math.abs(me.level - p.level) / 2, nearby: me.precinct === p.precinct ? 1 : Math.abs(me.precinct - p.precinct) === 1 ? 0.5 : 0, activities: jac(me.acts, p.acts) };
}
const ruleScore = (a: Person, b: Person) => { const f = factors(a, b); return 0.4 * f.schedule + 0.25 * f.level + 0.2 * f.nearby + 0.15 * f.activities; };
const pairX = (a: Person, b: Person) => [jac(a.slots, b.slots), 1 - Math.abs(a.level - b.level) / 2, a.precinct === b.precinct ? 1 : 0, Math.abs(a.precinct - b.precinct) === 1 ? 1 : 0, jac(a.acts, b.acts), a.level === 0 && b.level === 0 ? 1 : 0];
const sig = (z: number) => 1 / (1 + Math.exp(-z));
function auc(scores: number[], ys: number[]) {
  const pos: number[] = [], neg: number[] = []; scores.forEach((s, i) => (ys[i] ? pos : neg).push(s));
  if (!pos.length || !neg.length) return 0.5;
  let w = 0; pos.forEach((p) => neg.forEach((n) => { w += p > n ? 1 : p === n ? 0.5 : 0; })); return w / (pos.length * neg.length);
}
export const BUDDY = (() => {
  const R2 = rng(77);
  const pickN = <T,>(arr: T[], n: number) => { const o: T[] = []; while (o.length < n) { const s = arr[Math.floor(R2() * arr.length)]; if (!o.includes(s)) o.push(s); } return o; };
  const pool: Person[] = Array.from({ length: 160 }, () => ({ name: '', level: Math.floor(R2() * 3), slots: pickN(SLOT_IDS.filter((s) => s !== 'midday'), 1 + Math.floor(R2() * 2)), precinct: 1 + Math.floor(R2() * 8), acts: pickN(ACTS, 1 + Math.floor(R2() * 2)) }));
  const TRUE = [-2.6, 3.0, 1.2, 1.3, 0.5, 0.9, 0.8]; // hidden rule that generates the simulated outcomes
  const rows: { x: number[]; y: number; rule: number }[] = [];
  for (let i = 0; i < 900; i++) {
    const a = pool[Math.floor(R2() * pool.length)], b = pool[Math.floor(R2() * pool.length)]; if (a === b) continue;
    const x = pairX(a, b);
    rows.push({ x, y: R2() < sig(TRUE[0] + x.reduce((t, v, k) => t + v * TRUE[k + 1], 0)) ? 1 : 0, rule: ruleScore(a, b) });
  }
  const cut = Math.floor(rows.length * 0.8), train = rows.slice(0, cut), test = rows.slice(cut);
  let w = new Array(7).fill(0); const lr = 0.5, l2 = 0.001;
  for (let it = 0; it < 1500; it++) {
    const g = new Array(7).fill(0);
    train.forEach((r) => { const e = sig(w[0] + r.x.reduce((t, v, k) => t + v * w[k + 1], 0)) - r.y; g[0] += e; r.x.forEach((v, k) => (g[k + 1] += e * v)); });
    w = w.map((v, k) => v - lr * (g[k] / train.length + (k ? l2 * v : 0)));
  }
  const pred = (x: number[]) => sig(w[0] + x.reduce((t, v, k) => t + v * w[k + 1], 0));
  return {
    weights: w, n: rows.length, nTrain: train.length, nTest: test.length, base: mean(rows.map((r) => r.y)),
    accuracy: mean(test.map((r) => ((pred(r.x) >= 0.5 ? 1 : 0) === r.y ? 1 : 0))),
    auc: auc(test.map((r) => pred(r.x)), test.map((r) => r.y)),
    ruleAuc: auc(test.map((r) => r.rule), test.map((r) => r.y)),
    match: (me: Person, p: Person) => { const x = pairX(me, p); return { prob: pred(x), contrib: x.map((v, k) => v * w[k + 1]) }; },
  };
})();
export function topMatches(me: Person, n = 3) {
  return PEOPLE.map((p) => ({ person: p, factors: factors(me, p), ...BUDDY.match(me, p) })).sort((a, b) => b.prob - a.prob).slice(0, n);
}
export const reasons = (contrib: number[]) => contrib.map((c, k) => ({ c, k })).filter((o) => o.c > 0.15).sort((a, b) => b.c - a.c).slice(0, 3).map((o) => BUDDY_FEATURES[o.k].toLowerCase());
