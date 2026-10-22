import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  ANOMALY, BUDDY, BUDDY_FEATURES, DAYS, PARKS, SEGS, SLOTS, STATUSES, avgDay, computeAlerts, mean, parkName,
  segName, segUse, weekly, weeklyExpected, HISTORY, type Report, type Checkin,
} from '../../shared/jomgerak';
import { supabase } from './supabase';

const DEMO_REPORTS: Report[] = [
  { id: 'd1', park: 'lake', seg: 'l-n', type: 'Lighting', spot: 'North stretch near the jetty', note: 'Two lamps out, very dark after 7 pm.', status: 'Received', when_label: 'Wk 7, Tue', created_at: '2026-01-01T00:00:01Z', device_id: null, seed: true },
  { id: 'd2', park: 'lake', seg: 'l-e', type: 'Lighting', spot: 'Bend by the wetland boardwalk', note: 'Lamp flickering then off.', status: 'Received', when_label: 'Wk 7, Thu', created_at: '2026-01-01T00:00:02Z', device_id: null, seed: true },
  { id: 'd3', park: 'lake', seg: 'l-n', type: 'Lighting', spot: 'North stretch', note: 'Still dark, I walked Central Park instead.', status: 'Received', when_label: 'Wk 8, Mon', created_at: '2026-01-01T00:00:03Z', device_id: null, seed: true },
  { id: 'd4', park: 'central', seg: 'c-s', type: 'Damaged path', spot: 'Loop near playground', note: 'Raised paving slab, tripping risk.', status: 'In progress', when_label: 'Wk 8, Sat', created_at: '2026-01-01T00:00:04Z', device_id: null, seed: true },
];

const weekStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
const whenText = (r: Report) => r.when_label || new Date(r.created_at).toLocaleString('en-MY', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export default function App() {
  const [reports, setReports] = useState<Report[]>(supabase ? [] : DEMO_REPORTS);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [verified, setVerified] = useState(0);
  const [status, setStatus] = useState<'connecting' | 'live' | 'demo' | 'error'>(supabase ? 'connecting' : 'demo');
  const [thr, setThr] = useState(2);
  const [heatPark, setHeatPark] = useState('lake');
  const [mapSlot, setMapSlot] = useState(3);
  const [mapMode, setMapMode] = useState<'change' | 'usage'>('change');
  const [toast, setToast] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);

  const flash = (m: string) => { setToast(m); window.setTimeout(() => setToast(''), 3000); };

  async function loadAll() {
    if (!supabase) return;
    const [r, c, v] = await Promise.all([
      supabase.from('reports').select('*').order('created_at', { ascending: false }).limit(300),
      supabase.from('checkins').select('*').gte('created_at', new Date(weekStart()).toISOString()).limit(5000),
      supabase.from('verifications').select('device_id', { count: 'exact', head: true }),
    ]);
    if (r.error || c.error) { setStatus('error'); return; }
    setReports(r.data as Report[]); setCheckins(c.data as Checkin[]); setVerified(v.count ?? 0); setStatus('live');
  }

  useEffect(() => {
    if (!supabase) return;
    loadAll();
    const ch = supabase.channel('dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, () => loadAll())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'checkins' }, () => loadAll())
      .subscribe();
    const poll = window.setInterval(loadAll, 15000); // verified count and safety net
    return () => { supabase?.removeChannel(ch); window.clearInterval(poll); };
  }, []);

  async function setReportStatus(r: Report, s: string) {
    setReports((rs) => rs.map((x) => (x.id === r.id ? { ...x, status: s } : x)));
    if (!supabase) { flash(`Marked "${s}"`); return; }
    const { error } = await supabase.from('reports').update({ status: s }).eq('id', r.id);
    if (error) { flash('That did not save. Check your connection and try again.'); loadAll(); } else flash(`Marked "${s}". The resident sees this in the app.`);
  }
  async function resetDemo() {
    setConfirmReset(false);
    if (!supabase) { setReports(DEMO_REPORTS); flash('Demo data reset'); return; }
    const { error } = await supabase.rpc('reset_demo');
    if (error) flash('Reset failed: ' + error.message); else { flash('Demo data reset'); loadAll(); }
  }

  const alerts = useMemo(() => computeAlerts(thr, reports), [thr, reports]);
  const open = reports.filter((r) => r.status !== 'Fixed').length;
  const liveByPark = (p: string) => checkins.filter((c) => c.park === p).length;

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">
          <h1>Jom<span>Gerak</span></h1>
          <span className="tag">Management dashboard · City of Elmina pilot</span>
        </div>
        <span className={`live ${status}`}><i />{{ connecting: 'Connecting…', live: 'Live', demo: 'Demo mode · not connected to the database', error: 'Connection problem · retrying' }[status]}</span>
      </header>

      <div className="kpis">
        <Kpi value={String(312 + verified)} label={`Verified residents (${verified} new this week)`} />
        <Kpi value={String(checkins.length)} label="Live check-ins this week" />
        <Kpi value="46%" label="Beginners still active at week 4 (simulated)" />
        <Kpi value={String(open)} label="Open resident reports" />
      </div>

      <div className="panes">
        <section className="pane">
          <div className="row"><h2>Anomaly alerts</h2><span className="muted small">Weeks 7–8 vs what the model expects</span></div>
          <label className="slider">Flag when usage is
            <input type="range" min={1} max={6} step={0.5} value={thr} onChange={(e) => setThr(+e.target.value)} />
            <b className="mono">{thr.toFixed(1)}σ</b> below the model’s expectation
          </label>
          {alerts.length ? alerts.map((a) => {
            const high = a.reports.length > 0;
            const types: Record<string, number> = {}; a.reports.forEach((h) => (types[h.type] = (types[h.type] || 0) + 1));
            const top = high ? Object.entries(types).sort((x, y) => y[1] - x[1])[0][0].toLowerCase() : '';
            return (
              <div key={a.park.id + a.slot.id} className={`alert ${high ? 'high' : ''}`}>
                <div>
                  <span className="pri">{high ? 'High priority' : 'Check on site'}</span>
                  <h3>{a.park.name}, {a.slot.label.toLowerCase()}: unusually quiet <span className="z">{a.z.toFixed(1)}σ</span></h3>
                  <p>Model expected about {Math.round(a.e)} people per session; actual {Math.round(a.a)}. {a.abn} of {a.n} sessions were abnormal.
                    {high ? ` ${a.reports.length} open report${a.reports.length > 1 ? 's' : ''} at this park, mostly ${top}, so that is the likely cause.` : ' No open reports here. Worth a site visit.'}</p>
                </div>
                <Spark actual={weekly(a.park.id, a.si)} exp={weeklyExpected(a.park.id, a.si)} />
              </div>
            );
          }) : <div className="empty">Nothing is {thr.toFixed(1)}σ below what the model expects.</div>}
          <p className="note">Solid line: actual weekly check-ins. Dashed: what the model expected. People quietly avoid broken or unsafe areas before anyone complains.</p>
          <details className="model"><summary>How the anomaly model works</summary>
            <p>One ridge regression per park on log(people + 1), trained on weeks 1–6 ({ANOMALY.central.n} sessions per park). Inputs: day of week, time slot, weekend × slot, week trend (17 features). A slot is flagged when its average z-score over weeks 7–8 is at or below −{thr.toFixed(1)}σ.</p>
            <dl>{PARKS.map((p) => <Fragment key={p.id}><dt>{p.name}</dt><dd className="mono">R² {ANOMALY[p.id].r2.toFixed(2)} · held-out error ±{ANOMALY[p.id].mae.toFixed(1)} people ({Math.round(ANOMALY[p.id].mape * 100)}%)</dd></Fragment>)}</dl>
          </details>
          <details className="model"><summary>How buddy matching learns</summary>
            <p>Logistic regression trained on {BUDDY.nTrain} simulated past pairings, tested on {BUDDY.nTest}. It predicts whether a pair meets 3+ times in their first month.</p>
            <dl>
              {BUDDY.weights.slice(1).map((w, k) => ({ w, k })).sort((a, b) => b.w - a.w).map((o) => <Fragment key={o.k}><dt>{BUDDY_FEATURES[o.k]}</dt><dd className="mono">{o.w >= 0 ? '+' : ''}{o.w.toFixed(2)}</dd></Fragment>)}
              <dt>Ranking quality (AUC)</dt><dd className="mono">{BUDDY.auc.toFixed(2)} learned · {BUDDY.ruleAuc.toFixed(2)} hand-set rule</dd>
              <dt>Accuracy</dt><dd className="mono">{Math.round(BUDDY.accuracy * 100)}% ({Math.round(BUDDY.base * 100)}% of pairs kept meeting)</dd>
            </dl>
          </details>
        </section>

        <section className="pane">
          <div className="row"><h2>When parks are used</h2>
            <select value={heatPark} onChange={(e) => setHeatPark(e.target.value)} aria-label="Park">{PARKS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <TimeHeat park={heatPark} />
          <div className="row"><span className="legend">Fewer<i />More</span><span className="muted small">Average check-ins, weeks 7–8 (simulated)</span></div>
          <span className="label">Weekly check-ins by park · simulated · live this week</span>
          {PARKS.map((p) => {
            const v = mean([6, 7].map((w) => HISTORY[p.id][w].flat().reduce((a, b) => a + b, 0)));
            const mx = Math.max(...PARKS.map((q) => mean([6, 7].map((w) => HISTORY[q.id][w].flat().reduce((a, b) => a + b, 0)))));
            return <div key={p.id} className="usage-row"><span>{p.name}</span><div className="meter"><i style={{ width: `${(v / mx) * 100}%` }} /></div><span className="mono">{Math.round(v)} · {liveByPark(p.id)}</span></div>;
          })}
        </section>
      </div>

      <section className="pane">
        <div className="row"><h2>Path heat map</h2>
          <div className="row">
            <select value={mapSlot} onChange={(e) => setMapSlot(+e.target.value)} aria-label="Time slot">{SLOTS.map((s, i) => <option key={s.id} value={i}>{s.label}, {s.time}</option>)}</select>
            <div className="seg">{(['change', 'usage'] as const).map((m) => <button key={m} aria-pressed={mapMode === m} onClick={() => setMapMode(m)}>{m === 'change' ? 'Change vs normal' : 'Usage'}</button>)}</div>
          </div>
        </div>
        <PathMap slot={mapSlot} mode={mapMode} reports={reports} />
      </section>

      <section className="pane">
        <div className="row"><h2>Resident reports</h2><span className="muted small">Change a status and the resident sees it in their app</span></div>
        <div className="tbl"><table>
          <thead><tr><th>Reported</th><th>Issue</th><th>Location</th><th>Details</th><th>Status</th></tr></thead>
          <tbody>{reports.length ? reports.map((r) => (
            <tr key={r.id}>
              <td className="mono nowrap">{whenText(r)}</td>
              <td><b>{r.type}</b>{r.seed && <><br /><span className="muted small">example</span></>}</td>
              <td>{parkName(r.park)}<br /><span className="muted small">{r.seg ? segName(r.seg) + ' · ' : ''}{r.spot}</span></td>
              <td>{r.note || '–'}</td>
              <td><select value={r.status} onChange={(e) => setReportStatus(r, e.target.value)} aria-label="Status">{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></td>
            </tr>)) : <tr><td colSpan={5} className="muted">No reports yet. Reports residents send from the app appear here.</td></tr>}</tbody>
        </table></div>
        <div className="row end">
          {confirmReset ? <div className="confirm">Remove all demo activity and restore the example reports?
            <button className="danger" onClick={resetDemo}>Reset</button><button onClick={() => setConfirmReset(false)}>Cancel</button></div>
            : <button onClick={() => setConfirmReset(true)}>Reset demo data</button>}
        </div>
      </section>
      <p className="foot">JomGerak prototype · SDP University Hackathon 2026. Weeks 1–8 of park history and resident profiles are simulated; reports, check-ins and verifications are live.</p>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function Kpi({ value, label }: { value: string; label: string }) {
  return <div className="kpi"><b>{value}</b><span>{label}</span></div>;
}

function Spark({ actual, exp }: { actual: number[]; exp: number[] }) {
  const W = 130, H = 40, max = Math.max(...actual, ...exp) * 1.1 || 1;
  const x = (i: number) => 4 + (i * (W - 8)) / (actual.length - 1), y = (v: number) => H - 4 - (v / max) * (H - 8);
  const pts = (a: number[]) => a.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Weekly check-ins, actual and expected">
      <polyline points={pts(exp)} fill="none" stroke="var(--muted)" strokeWidth={1.4} strokeDasharray="3 3" />
      <polyline points={pts(actual)} fill="none" stroke="var(--green)" strokeWidth={1.8} />
      {actual.map((v, i) => (i >= 6 ? <circle key={i} cx={x(i)} cy={y(v)} r={3} fill="var(--orange)" /> : null))}
    </svg>
  );
}

function TimeHeat({ park }: { park: string }) {
  const vals = SLOTS.map((_, si) => DAYS.map((_, di) => avgDay(park, di, si, 6, 8)));
  const mx = Math.max(...vals.flat()) || 1;
  return (
    <div className="heat-wrap"><div className="heat">
      <div />{DAYS.map((d) => <div key={d} className="h">{d}</div>)}
      {SLOTS.map((s, si) => [
        <div key={s.id} className="rl">{s.label}<br /><small>{s.time}</small></div>,
        ...vals[si].map((v, di) => { const pc = Math.round((v / mx) * 85); return <div key={s.id + di} className="c" style={{ background: `color-mix(in srgb, var(--green) ${pc}%, var(--sunk))`, color: pc > 50 ? 'var(--green-ink)' : 'var(--fg)' }}>{v < 5 ? '–' : Math.round(v)}</div>; }),
      ])}
    </div></div>
  );
}

const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number) => {
  const p = (a: number) => [cx + rx * Math.cos((a * Math.PI) / 180), cy + ry * Math.sin((a * Math.PI) / 180)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1), mid = p((a0 + a1) / 2);
  return { d: `M${x0.toFixed(1)} ${y0.toFixed(1)} A${rx} ${ry} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`, mid };
};
const GEO: Record<string, { d: string; mid: number[] }> = {
  'c-n': { d: 'M70 64 H230', mid: [150, 64] }, 'c-e': { d: 'M256 90 V230', mid: [256, 160] },
  'c-s': { d: 'M230 256 H70', mid: [150, 256] }, 'c-w': { d: 'M44 230 V90', mid: [44, 160] },
  'p-a': { d: 'M520 286 H612 Q624 286 624 298 V318 Q624 330 612 330 H520 Q508 330 508 318 V298 Q508 286 520 286 Z', mid: [566, 286] },
  'l-n': arc(450, 140, 140, 92, 229, 311), 'l-e': arc(450, 140, 140, 92, 319, 401), 'l-s': arc(450, 140, 140, 92, 409, 491), 'l-w': arc(450, 140, 140, 92, 499, 581),
};

function PathMap({ slot, mode, reports }: { slot: number; mode: 'change' | 'usage'; reports: Report[] }) {
  const segs = Object.keys(GEO).map((k) => ({ k, b: segUse(k, slot, false), r: segUse(k, slot, true) }));
  const mx = Math.max(...segs.map((s) => s.r)) || 1;
  const col = (s: { b: number; r: number }) => {
    if (mode === 'usage') return `color-mix(in srgb, var(--green) ${Math.round(15 + (s.r / mx) * 85)}%, var(--line))`;
    const ratio = s.b ? s.r / s.b : 1;
    if (ratio < 0.9) return `color-mix(in srgb, var(--red) ${Math.min(100, Math.round(30 + (1 - ratio) * 110))}%, var(--line))`;
    return ratio > 1.1 ? 'var(--green)' : 'color-mix(in srgb, var(--muted) 45%, var(--line))';
  };
  const pins: Record<string, Report[]> = {};
  reports.filter((r) => r.status !== 'Fixed').forEach((r) => { const k = r.seg && GEO[r.seg] ? r.seg : SEGS[r.park]?.[0]?.id; if (k) (pins[k] = pins[k] || []).push(r); });
  const worst = segs.filter((s) => s.b >= 2).map((s) => ({ ...s, ratio: s.r / s.b })).sort((a, b) => a.ratio - b.ratio)[0];
  return (
    <>
      <div className="heat-wrap"><svg className="map" viewBox="0 0 660 366" role="img" aria-label="Map of park paths coloured by usage">
        <rect x={22} y={40} width={256} height={240} rx={28} fill="color-mix(in srgb, var(--green) 10%, var(--surface))" />
        <ellipse cx={450} cy={140} rx={104} ry={58} fill="var(--water)" />
        <text x={450} y={144} textAnchor="middle" className="map-water">Elmina lake</text>
        <rect x={496} y={276} width={140} height={64} rx={16} fill="color-mix(in srgb, var(--green) 10%, var(--surface))" />
        <text x={150} y={30} textAnchor="middle" className="map-park">Central Park</text>
        <text x={450} y={26} textAnchor="middle" className="map-park">Lakeside Track</text>
        <text x={566} y={358} textAnchor="middle" className="map-park">Precinct 4 Pocket Park</text>
        {segs.map((s) => { const ch = s.b ? Math.round((s.r / s.b - 1) * 100) : 0; return <path key={s.k} d={GEO[s.k].d} fill="none" stroke={col(s)} strokeWidth={14} strokeLinecap="round"><title>{`${segName(s.k)}: about ${Math.round(s.r)} people per session, ${ch >= 0 ? '+' : ''}${ch}% vs normal`}</title></path>; })}
        {Object.entries(pins).map(([k, rs]) => { const [x, y] = GEO[k].mid; return (
          <g key={k}><title>{`${rs.length} open report${rs.length > 1 ? 's' : ''}: ${segName(k)}`}</title>
            <circle cx={x} cy={y - 20} r={11} fill="var(--orange)" stroke="var(--surface)" strokeWidth={2} />
            <text x={x} y={y - 16} textAnchor="middle" className="map-pin">{rs.length}</text>
            <path d={`M${x - 4} ${y - 11} L${x} ${y - 4} L${x + 4} ${y - 11}`} fill="var(--orange)" /></g>); })}
      </svg></div>
      <div className="row">
        {mode === 'usage' ? <span className="legend">Quieter<i />Busier</span>
          : <span className="legend"><span className="sw" style={{ background: 'var(--red)' }} />Below normal<span className="sw" style={{ background: 'color-mix(in srgb, var(--muted) 45%, var(--line))' }} />Normal<span className="sw" style={{ background: 'var(--green)' }} />Above normal</span>}
        <span className="muted small">Orange pins: open resident reports</span>
      </div>
      <p className="note">{worst && worst.ratio < 0.9 ? `Biggest drop at ${SLOTS[slot].label.toLowerCase()}: ${segName(worst.k)}, down ${Math.round((1 - worst.ratio) * 100)}% vs weeks 1–6.` : `No path is below normal at ${SLOTS[slot].label.toLowerCase()}.`}</p>
    </>
  );
}

