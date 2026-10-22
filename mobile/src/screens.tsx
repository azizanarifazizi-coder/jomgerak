import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import {
  DAYS, GROUPS, LVL, ACTS, MIN_GROUP, PARKS, REPORT_TYPES, SEGS, SLOTS, avgDay, currentSlot, parkName, reasons, resCode,
  slotOf, topMatches, type ParkId, type Person, type Report, type SlotId,
} from '../../shared/jomgerak';
import { Button, C, Card, Chip, Label, Meter, Note, Row, s } from './ui';

// ---------- Verify ----------
export function VerifyScreen({ onVerify, busy }: { onVerify: (precinct: number, house: number, code: string) => Promise<string | null>; busy: boolean }) {
  const [precinct, setPrecinct] = useState(4);
  const [house, setHouse] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [fails, setFails] = useState(0);
  const [lockUntil, setLockUntil] = useState(0);

  async function submit() {
    if (Date.now() < lockUntil) { setError('Too many tries. Wait a minute, then try again.'); return; }
    const h = /^\d{1,4}$/.test(house.trim()) ? +house.trim() : 0;
    if (!h || h > 500) { setError('Enter your house or unit number using digits only.'); return; }
    const c = code.trim().toUpperCase();
    if (!/^ELM-\d-\d{3}$/.test(c)) { setError('Resident codes look like ELM-4-123. Check your handover pack.'); return; }
    const err = await onVerify(precinct, h, c);
    if (err) {
      const f = fails + 1; setFails(f);
      if (f >= 5) { setLockUntil(Date.now() + 60000); setFails(0); setError('Too many tries. Wait a minute, then try again.'); }
      else setError(err);
    }
  }

  return (
    <View style={{ gap: 14 }}>
      <Text style={{ fontSize: 15, color: C.fg, lineHeight: 21 }}>JomGerak is only for people who live in City of Elmina. Enter the resident code from your key handover pack, or get one from the management office.</Text>
      <Label>Precinct</Label>
      <View style={s.chips}>{[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <Chip key={n} title={`P${n}`} on={precinct === n} onPress={() => setPrecinct(n)} />)}</View>
      <Label>House or unit number</Label>
      <TextInput style={s.input} value={house} onChangeText={(t) => { setHouse(t); setError(''); }} keyboardType="number-pad" maxLength={4} placeholder="e.g. 17" placeholderTextColor={C.muted} />
      <Label>Resident code</Label>
      <TextInput style={s.input} value={code} onChangeText={(t) => { setCode(t); setError(''); }} autoCapitalize="characters" maxLength={12} placeholder="ELM-0-000" placeholderTextColor={C.muted} />
      {!!error && <Text style={s.err}>{error}</Text>}
      <Button title={busy ? 'Checking…' : 'Verify my home'} onPress={submit} disabled={busy} />
      <Button ghost title="Fill in demo resident (Aina, P4, No. 17)" onPress={() => { setPrecinct(4); setHouse('17'); setCode(resCode(4, 17)); setError(''); }} />
      <Card style={{ backgroundColor: C.sunk, borderColor: C.sunk }}>
        <Label>Why we check</Label>
        <Text style={s.muted}>Only verified neighbours can see groups, send buddy requests or report problems, so strangers can’t use the app to learn when parks are busy.</Text>
      </Card>
      <Note>In a real pilot, codes come from SDP’s handover records. Your house number is never shown to anyone.</Note>
    </View>
  );
}

// ---------- Parks ----------
export function ParksScreen(p: { park: ParkId; setPark: (x: ParkId) => void; liveCount: number; checkedIn: boolean; busy: boolean; onCheckin: () => void; onGroups: () => void; going: (id: string) => number }) {
  const [day, setDay] = useState((new Date().getDay() + 6) % 7);
  const vals = SLOTS.map((sl, i) => ({ sl, v: avgDay(p.park, day, i, 4, 8) }));
  const max = Math.max(10, ...vals.map((x) => x.v));
  const best = vals.filter((x) => x.v >= 5).sort((a, b) => b.v - a.v)[0];
  const cs = currentSlot();
  const g = GROUPS.find((x) => x.park === p.park && x.lvl === 0) ?? GROUPS[0];
  return (
    <View style={{ gap: 14 }}>
      <View style={s.chips}>{PARKS.map((x) => <Chip key={x.id} title={x.name} on={x.id === p.park} onPress={() => p.setPark(x.id)} />)}</View>
      <Card>
        <Row>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.h}>At {parkName(p.park)} now?</Text>
            <Text style={s.muted}>{cs ? `Counts toward ${cs.label.toLowerCase()} (${cs.time}). Only the total is shown.` : 'Check-ins open 6 am to 10 pm.'}</Text>
          </View>
          <Button title={p.busy ? 'Checking in…' : p.checkedIn ? 'Checked in' : "I'm here"} onPress={p.onCheckin} disabled={!cs || p.checkedIn || p.busy} />
        </Row>
        <Text style={[s.muted, { fontVariant: ['tabular-nums'] }]}>{p.liveCount} check-ins here this week</Text>
      </Card>
      <Label>Usually busy on</Label>
      <View style={s.chips}>{DAYS.map((d, i) => <Chip key={d} title={d} on={i === day} onPress={() => setDay(i)} />)}</View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 170, gap: 8 }} accessibilityLabel="Typical number of people by time slot">
        {vals.map(({ sl, v }) => (
          <View key={sl.id} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 4 }}>
            {v < 5 ? <Text style={[s.note, { textAlign: 'center' }]}>under 5</Text> : <Text style={{ fontSize: 12, fontWeight: '600', color: C.fg }}>{Math.round(v)}</Text>}
            <View style={{ width: '70%', height: v < 5 ? 10 : `${Math.max(6, (v / max) * 75)}%`, backgroundColor: v < 5 ? 'transparent' : v >= 15 ? C.green : C.greenSoft, borderRadius: 6, borderWidth: v < 5 ? 1 : 0, borderStyle: 'dashed', borderColor: C.muted }} />
            <Text style={[s.note, { textAlign: 'center' }]} numberOfLines={2}>{sl.label.replace('Early morning', 'Early')}</Text>
          </View>
        ))}
      </View>
      {best && <Card><Label>Busiest, so most people around</Label><Text style={s.h}>{best.sl.label}, {best.sl.time}</Text><Text style={s.muted}>About {Math.round(best.v)} people usually at {parkName(p.park)}.</Text></Card>}
      <Card>
        <Label>Beginner session here</Label>
        <Text style={s.h}>{g.name}</Text>
        <Text style={s.muted}>{g.day} · {slotOf(g.slot).label} · {p.going(g.id)} going</Text>
        <Button ghost title="See all groups" onPress={p.onGroups} />
      </Card>
      <Note>Typical pattern from the last 4 weeks, never live and never individuals. Slots with fewer than 5 people are hidden.</Note>
    </View>
  );
}

// ---------- Groups ----------
export function GroupsScreen(p: { going: (id: string) => number; joined: (id: string) => boolean; busy: (k: string) => boolean; onToggle: (id: string) => void }) {
  const [begOnly, setBegOnly] = useState(true);
  const list = GROUPS.filter((g) => !begOnly || g.lvl === 0).sort((a, b) => Number(p.going(a.id) >= MIN_GROUP) - Number(p.going(b.id) >= MIN_GROUP));
  return (
    <View style={{ gap: 12 }}>
      <Row><Label>{list.length} sessions this week</Label><Chip title="Beginner-friendly only" on={begOnly} onPress={() => setBegOnly(!begOnly)} /></Row>
      {list.map((g) => {
        const n = p.going(g.id), need = Math.max(0, MIN_GROUP - n), j = p.joined(g.id), b = p.busy('j' + g.id), sl = slotOf(g.slot);
        return (
          <Card key={g.id} style={need ? { borderColor: C.orange } : undefined}>
            <Row><Text style={[s.h, { flex: 1 }]}>{g.name}</Text><Text style={{ fontSize: 11, fontWeight: '700', color: g.lvl === 0 ? C.orange : C.muted }}>{LVL[g.lvl]}</Text></Row>
            {need > 0 ? <Text style={{ fontSize: 12, fontWeight: '700', color: C.orange }}>New group · needs {need} more to start</Text>
              : g.isNew ? <Text style={{ fontSize: 12, fontWeight: '700', color: C.ok }}>New group · ready to run</Text> : null}
            <Text style={s.muted}>{parkName(g.park)} · {g.day} · {sl.label}, {sl.time}</Text>
            <Row><Text style={{ fontVariant: ['tabular-nums'], color: C.fg }}>{n} going</Text><Button ghost={j} title={b ? 'Saving…' : j ? 'Leave session' : 'Join session'} onPress={() => p.onToggle(g.id)} disabled={b} /></Row>
          </Card>
        );
      })}
      <Note>New groups show from their first member, so they can grow. You join sessions, not people: others see how many are going, never who.</Note>
    </View>
  );
}

// ---------- Buddies (logistic regression model) ----------
export function BuddiesScreen(p: { me: Person; setMe: (m: Person) => void; requested: (n: string) => boolean; busy: (k: string) => boolean; onRequest: (n: string) => void }) {
  const m = p.me;
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? (arr.length > 1 ? arr.filter((x) => x !== v) : arr) : [...arr, v]);
  const matches = topMatches(m);
  return (
    <View style={{ gap: 12 }}>
      <Card style={{ backgroundColor: C.sunk, borderColor: C.sunk }}>
        <Label>Your preferences</Label>
        <View style={s.chips}>{LVL.map((l, i) => <Chip key={l} title={l} on={m.level === i} onPress={() => p.setMe({ ...m, level: i })} />)}</View>
        <View style={s.chips}>{SLOTS.map((sl) => <Chip key={sl.id} title={sl.label} on={m.slots.includes(sl.id)} onPress={() => p.setMe({ ...m, slots: toggle<SlotId>(m.slots, sl.id) })} />)}</View>
        <View style={s.chips}>{ACTS.map((a) => <Chip key={a} title={a} on={m.acts.includes(a)} onPress={() => p.setMe({ ...m, acts: toggle(m.acts, a) })} />)}</View>
      </Card>
      <Label>Top matches</Label>
      {matches.map((r) => {
        const sent = p.requested(r.person.name), b = p.busy('r' + r.person.name), why = reasons(r.contrib);
        return (
          <Card key={r.person.name}>
            <Row>
              <View style={{ flex: 1 }}><Text style={s.h}>{r.person.name}</Text><Text style={s.note}>{LVL[r.person.level]} · Precinct {r.person.precinct} · {r.person.acts.join(', ')}</Text></View>
              <View style={{ alignItems: 'flex-end' }}><Text style={{ fontSize: 22, fontWeight: '800', color: C.green }}>{Math.round(r.prob * 100)}%</Text><Text style={s.note}>likely to keep meeting</Text></View>
            </Row>
            {why.length > 0 && <Text style={s.note}>Why: {why.join(', ')}</Text>}
            {Object.entries(r.factors).map(([k, v]) => (
              <Row key={k} style={{ flexWrap: 'nowrap' }}><Text style={[s.note, { width: 78 }]}>{k[0].toUpperCase() + k.slice(1)}</Text><Meter value={v} /><Text style={[s.note, { width: 28, textAlign: 'right' }]}>{Math.round(v * 100)}</Text></Row>
            ))}
            <Button ghost={sent} title={b ? 'Sending…' : sent ? 'Request sent' : 'Send buddy request'} onPress={() => p.onRequest(r.person.name)} disabled={sent || b} />
          </Card>
        );
      })}
      <Note>A logistic regression model ranks neighbours by how likely a pair is to keep exercising together. Both people must accept, and the first meetup is suggested inside a group session.</Note>
    </View>
  );
}

// ---------- Report ----------
export function ReportScreen(p: { mine: Report[]; busy: boolean; onSend: (r: { type: string; park: ParkId; seg: string; spot: string; note: string }) => Promise<boolean> }) {
  const [type, setType] = useState('Lighting');
  const [park, setPark] = useState<ParkId>('lake');
  const [seg, setSeg] = useState(SEGS.lake[0].id);
  const [spot, setSpot] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  async function send() {
    if (spot.trim().length < 3) { setErr('Add where the problem is, so the team can find it.'); return; }
    const ok = await p.onSend({ type, park, seg, spot: spot.trim().slice(0, 120), note: note.trim().slice(0, 500) });
    if (ok) { setSpot(''); setNote(''); setErr(''); }
  }
  return (
    <View style={{ gap: 12 }}>
      <Label>What’s wrong?</Label>
      <View style={s.chips}>{REPORT_TYPES.map((t) => <Chip key={t} title={t} on={t === type} onPress={() => setType(t)} />)}</View>
      <Label>Park</Label>
      <View style={s.chips}>{PARKS.map((x) => <Chip key={x.id} title={x.name} on={x.id === park} onPress={() => { setPark(x.id); setSeg(SEGS[x.id][0].id); }} />)}</View>
      <Label>Which part of the park?</Label>
      <View style={s.chips}>{SEGS[park].map((x) => <Chip key={x.id} title={x.name} on={x.id === seg} onPress={() => setSeg(x.id)} />)}</View>
      <Label>Where exactly?</Label>
      <TextInput style={s.input} value={spot} onChangeText={(t) => { setSpot(t); setErr(''); }} maxLength={120} placeholder="e.g. Second lamp after the jetty" placeholderTextColor={C.muted} />
      <Label>Details (optional)</Label>
      <TextInput style={[s.input, { minHeight: 70, textAlignVertical: 'top' }]} value={note} onChangeText={setNote} maxLength={500} multiline placeholder="What did you notice?" placeholderTextColor={C.muted} />
      {!!err && <Text style={s.err}>{err}</Text>}
      <Button title={p.busy ? 'Sending…' : 'Send report'} onPress={send} disabled={p.busy} />
      <Label>Your reports</Label>
      {p.mine.length ? p.mine.map((h) => (
        <Card key={h.id}><Row><Text style={[s.h, { flex: 1 }]}>{h.type} · {parkName(h.park)}</Text><Text style={{ fontSize: 12, fontWeight: '700', color: h.status === 'Fixed' ? C.ok : C.muted }}>{h.status}</Text></Row><Text style={s.muted}>{h.spot}</Text></Card>
      )) : <Text style={[s.muted, { borderWidth: 1, borderStyle: 'dashed', borderColor: C.line, borderRadius: 10, padding: 12 }]}>No reports yet. Anything you send shows here with its status until it is fixed.</Text>}
    </View>
  );
}
