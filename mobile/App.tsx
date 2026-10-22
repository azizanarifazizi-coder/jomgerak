import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { GROUPS, currentSlot, parkName, type ParkId, type Person, type Report } from '../shared/jomgerak';
import { attempt, getDeviceId, isLive, loadLocal, saveLocal, supabase } from './src/backend';
import { BuddiesScreen, GroupsScreen, ParksScreen, ReportScreen, VerifyScreen } from './src/screens';
import { C } from './src/ui';

type Tab = 'parks' | 'groups' | 'buddies' | 'report';
const TITLES: Record<Tab, string> = { parks: 'When should you go?', groups: 'Join a session near you', buddies: 'Neighbours like you', report: 'Spotted a problem?' };
const weekStartIso = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString(); };

export default function App() {
  const [device, setDevice] = useState('');
  const [verified, setVerified] = useState<null | { precinct: number }>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>('parks');
  const [park, setPark] = useState<ParkId>('central');
  const [me, setMe] = useState<Person>({ name: 'Aina', level: 0, slots: ['evening'], precinct: 4, acts: ['Jogging', 'Walking'] });
  const [joins, setJoins] = useState<{ group_id: string; device_id: string }[]>([]);
  const [requests, setRequests] = useState<string[]>([]);
  const [myReports, setMyReports] = useState<Report[]>([]);
  const [checkins, setCheckins] = useState<{ park: string; slot: string; device_id: string; created_at: string }[]>([]);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = (m: string) => { setToast(m); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 2800); };
  const isBusy = (k: string) => !!busy[k];
  async function run(k: string, fn: () => Promise<void>) {
    if (busy[k]) return;
    setBusy((b) => ({ ...b, [k]: true }));
    try { await fn(); } finally { setBusy((b) => ({ ...b, [k]: false })); }
  }

  // ---------- load ----------
  const refresh = useCallback(async (dev: string) => {
    if (!supabase || !dev) return;
    const [j, r, c, rep] = await Promise.all([
      supabase.from('joins').select('group_id,device_id'),
      supabase.from('buddy_requests').select('to_name').eq('device_id', dev),
      supabase.from('checkins').select('park,slot,device_id,created_at').gte('created_at', weekStartIso()).limit(5000),
      supabase.from('reports').select('*').eq('device_id', dev).order('created_at', { ascending: false }),
    ]);
    if (!j.error) setJoins(j.data ?? []);
    if (!r.error) setRequests((r.data ?? []).map((x: { to_name: string }) => x.to_name));
    if (!c.error) setCheckins(c.data ?? []);
    if (!rep.error) setMyReports((rep.data ?? []) as Report[]);
  }, []);

  useEffect(() => {
    (async () => {
      const dev = await getDeviceId(); setDevice(dev);
      const v = await loadLocal<null | { precinct: number }>('verified', null);
      if (v) { setVerified(v); setMe((m) => ({ ...m, precinct: v.precinct })); }
      if (!isLive) { setJoins(await loadLocal('joins', [])); setRequests(await loadLocal('requests', [])); setMyReports(await loadLocal('reports', [])); }
      setReady(true);
      await refresh(dev);
    })();
  }, [refresh]);

  // Live updates: report status changes from the dashboard, joins and check-ins from other phones.
  useEffect(() => {
    if (!supabase || !device) return;
    const ch = supabase.channel('mobile-' + device)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, () => refresh(device))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'joins' }, () => refresh(device))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'checkins' }, () => refresh(device))
      .subscribe();
    return () => { supabase?.removeChannel(ch); };
  }, [device, refresh]);

  useEffect(() => { if (!isLive && ready) { saveLocal('joins', joins); saveLocal('requests', requests); saveLocal('reports', myReports); } }, [joins, requests, myReports, ready]);

  // ---------- actions ----------
  async function verify(precinct: number, house: number, code: string): Promise<string | null> {
    let err: string | null = null;
    await run('verify', async () => {
      if (supabase) {
        const res = await attempt<boolean>(() => supabase!.rpc<string, any>('verify_resident', { p_device: device, p_precinct: precinct, p_house: house, p_code: code }));
        if (!res.ok) { err = res.message ?? 'Could not verify.'; return; }
        if (!res.data) { err = 'We couldn’t match that house and code. Check your handover pack or ask the management office.'; return; }
      } else {
        const expected = `ELM-${precinct}-${((house * 37 + precinct * 11) % 900) + 100}`;
        if (code !== expected) { err = 'We couldn’t match that house and code. Check your handover pack or ask the management office.'; return; }
      }
      const v = { precinct }; setVerified(v); saveLocal('verified', v); setMe((m) => ({ ...m, precinct })); flash('Verified. Welcome to JomGerak.');
    });
    return err;
  }
  async function unverify() {
    if (supabase) await attempt(() => supabase!.rpc('unverify_resident', { p_device: device }));
    setVerified(null); saveLocal('verified', null); setTab('parks');
  }
  const going = (id: string) => (GROUPS.find((g) => g.id === id)?.going ?? 0) + joins.filter((j) => j.group_id === id).length;
  const joined = (id: string) => joins.some((j) => j.group_id === id && j.device_id === device);
  function toggleJoin(id: string) {
    run('j' + id, async () => {
      const leaving = joined(id);
      if (supabase) {
        const res = leaving
          ? await attempt(() => supabase!.from('joins').delete().eq('group_id', id).eq('device_id', device))
          : await attempt(() => supabase!.from('joins').insert({ group_id: id, device_id: device }));
        if (!res.ok) { flash(res.message ?? 'That did not save.'); return; }
        await refresh(device);
      } else {
        setJoins((js) => (leaving ? js.filter((j) => !(j.group_id === id && j.device_id === device)) : [...js, { group_id: id, device_id: device }]));
      }
      flash(leaving ? 'You left the session' : 'Joined. See you there.');
    });
  }
  function request(name: string) {
    run('r' + name, async () => {
      if (supabase) {
        const res = await attempt(() => supabase!.from('buddy_requests').insert({ to_name: name, device_id: device }));
        if (!res.ok && !/duplicate/i.test(res.message ?? '')) { flash(res.message ?? 'That did not save.'); return; }
      }
      setRequests((r) => (r.includes(name) ? r : [...r, name])); flash(`Request sent to ${name}`);
    });
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const slotNow = currentSlot();
  const checkedIn = !!slotNow && checkins.some((c) => c.park === park && c.device_id === device && c.slot === slotNow.id && new Date(c.created_at) >= today);
  function checkin() {
    const sl = currentSlot(); if (!sl) return;
    run('ci', async () => {
      const row = { park, slot: sl.id, device_id: device };
      if (supabase) {
        const res = await attempt(() => supabase!.from('checkins').insert(row));
        if (!res.ok) { flash(res.message ?? 'That did not save.'); return; }
        await refresh(device);
      } else setCheckins((c) => [...c, { ...row, created_at: new Date().toISOString() }]);
      flash(`Checked in at ${parkName(park)}`);
    });
  }
  async function sendReport(r: { type: string; park: ParkId; seg: string; spot: string; note: string }) {
    let ok = false;
    await run('rep', async () => {
      if (supabase) {
        const res = await attempt(() => supabase!.from('reports').insert({ ...r, device_id: device }));
        if (!res.ok) { flash(res.message ?? 'That did not save.'); return; }
        await refresh(device);
      } else {
        setMyReports((m) => [{ id: 'l' + Date.now(), ...r, status: 'Received', when_label: null, created_at: new Date().toISOString(), device_id: device, seed: false }, ...m]);
      }
      ok = true; flash('Report sent to township management');
    });
    return ok;
  }

  // ---------- render ----------
  return (
    <SafeAreaProvider>
      <SafeAreaView style={st.root} edges={['top', 'left', 'right']}>
        <StatusBar style="light" />
        <View style={st.head}>
          <View style={st.headRow}>
            <Text style={st.headSmall}>{verified ? `PRECINCT ${verified.precinct} · CITY OF ELMINA` : 'CITY OF ELMINA'}</Text>
            <Text style={st.headSmall}>{isLive ? '● Live' : '● Demo mode'}</Text>
          </View>
          <Text style={st.headTitle}>{!ready ? 'One moment' : verified ? (tab === 'parks' ? 'Hi Aina, when should you go?' : TITLES[tab]) : 'Verify you live here'}</Text>
          {verified && <Pressable onPress={unverify} accessibilityRole="button"><Text style={st.unv}>Reset verification (demo)</Text></Pressable>}
        </View>
        <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {!ready ? <Text style={{ color: C.muted }}>Loading…</Text>
            : !verified ? <VerifyScreen onVerify={verify} busy={isBusy('verify')} />
            : tab === 'parks' ? <ParksScreen park={park} setPark={setPark} liveCount={checkins.filter((c) => c.park === park).length} checkedIn={checkedIn} busy={isBusy('ci')} onCheckin={checkin} onGroups={() => setTab('groups')} going={going} />
            : tab === 'groups' ? <GroupsScreen going={going} joined={joined} busy={isBusy} onToggle={toggleJoin} />
            : tab === 'buddies' ? <BuddiesScreen me={me} setMe={setMe} requested={(n) => requests.includes(n)} busy={isBusy} onRequest={request} />
            : <ReportScreen mine={myReports} busy={isBusy('rep')} onSend={sendReport} />}
        </ScrollView>
        {verified && (
          <SafeAreaView edges={['bottom']} style={st.nav}>
            {(['parks', 'groups', 'buddies', 'report'] as Tab[]).map((t) => (
              <Pressable key={t} onPress={() => setTab(t)} style={st.navBtn} accessibilityRole="tab" accessibilityState={{ selected: tab === t }}>
                <Text style={[st.navIcon, tab === t && { color: C.green }]}>{{ parks: '▮▮', groups: '◉◉', buddies: '♥', report: '⚠' }[t]}</Text>
                <Text style={[st.navText, tab === t && { color: C.green }]}>{t[0].toUpperCase() + t.slice(1)}</Text>
              </Pressable>
            ))}
          </SafeAreaView>
        )}
        {!!toast && <View style={st.toast} pointerEvents="none"><Text style={{ color: '#fff', fontWeight: '600' }}>{toast}</Text></View>}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.green },
  head: { backgroundColor: C.green, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 14, gap: 4 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between' },
  headSmall: { color: '#fff', opacity: 0.85, fontSize: 11, letterSpacing: 0.6, fontWeight: '600' },
  headTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
  unv: { color: '#fff', opacity: 0.8, fontSize: 11, textDecorationLine: 'underline' },
  nav: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.surface },
  navBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, gap: 2 },
  navIcon: { fontSize: 16, color: C.muted },
  navText: { fontSize: 12, fontWeight: '600', color: C.muted },
  toast: { position: 'absolute', bottom: 90, left: 16, right: 16, backgroundColor: C.fg, borderRadius: 10, padding: 12, alignItems: 'center' },
});
