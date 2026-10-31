import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '../components/icons';
import { leaveApi } from './api';
import { ApplyDrawer } from './ApplyDrawer';
import { AttendanceTab } from './AttendanceTab';
import { BalancesTab } from './BalancesTab';
import { EncashTab } from './EncashTab';
import { HolidaysTab } from './HolidaysTab';
import { LedgerTab } from './LedgerTab';
import { NoticesTab } from './NoticesTab';
import { RequestDrawer } from './RequestDrawer';
import { RequestsTab } from './RequestsTab';
import { YearEndTab } from './YearEndTab';

const TABS = ['requests', 'attendance', 'balances', 'holidays', 'notify'] as const;
const BAL = ['balances', 'ledger', 'encash', 'yearend'] as const;
type Tab = (typeof TABS)[number] | (typeof BAL)[number];

const ic = {
  inbox: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  ),
  clock: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  ),
  scale: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
      <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
      <path d="M7 21h10M12 3v18M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
    </svg>
  ),
  history: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5M12 7v5l4 2" />
    </svg>
  ),
  coins: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="8" r="6" />
      <path d="M18.09 10.37A6 6 0 1 1 10.34 18M7 6h1v4M16.71 13.88l.7.71-2.82 2.82" />
    </svg>
  ),
  flag: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7" />
    </svg>
  ),
  party: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5.8 11.3 2 22l10.7-3.79M4 3h.01M22 8h.01M15 2h.01M22 20h.01" />
      <path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10M22 13l-.82-.33c-.86-.34-1.82.2-1.98 1.11-.11.7-.72 1.22-1.43 1.22H17M11 2l.33.82c.34.86-.2 1.82-1.11 1.98-.7.1-1.22.72-1.22 1.43V7" />
      <path d="M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z" />
    </svg>
  ),
  mega: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3 11 18-5v12L3 14v-3z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  ),
};

export function LeavePage() {
  const [sp, setSp] = useSearchParams();
  const tab = ((sp.get('tab') as Tab) || 'requests') as Tab;
  const request = sp.get('request');
  const applying = sp.get('apply') === '1';
  const set = (patch: Record<string, string | null>) =>
    setSp(
      (p) => {
        const n = new URLSearchParams(p);
        for (const [k, v] of Object.entries(patch)) v == null || v === '' ? n.delete(k) : n.set(k, v);
        return n;
      },
      { replace: false },
    );
  const go = (t: Tab, extra: Record<string, string | null> = {}) =>
    setSp(() => {
      const n = new URLSearchParams();
      if (t !== 'requests') n.set('tab', t);
      for (const [k, v] of Object.entries(extra)) if (v) n.set(k, v);
      return n;
    });

  // Counts on the tabs: requests waiting, encashments waiting.
  const counts = useQuery({ queryKey: ['leave', 'requests', 'counts'], queryFn: () => leaveApi.requests({ view: 'pending', size: 1 }), staleTime: 30_000 });
  const enc = useQuery({ queryKey: ['leave', 'encash', 'PENDING'], queryFn: () => leaveApi.encashments('PENDING'), staleTime: 60_000, retry: false });
  const canManage = counts.data?.canManage ?? false;
  const pending = counts.data?.counts.pending ?? 0;
  const encN = canManage ? (enc.data?.pending.count ?? 0) : 0;
  const inBal = (BAL as readonly string[]).includes(tab);
  const subTabs = canManage ? BAL : (['balances', 'ledger'] as const);

  const top: [Tab, string, ReactNode, number][] = [
    ['requests', 'Requests', ic.inbox, pending],
    ['attendance', 'Attendance', ic.clock, 0],
    ['balances', 'Balances', ic.scale, encN],
    ['holidays', 'Holidays', ic.party, 0],
    ['notify', 'Notifications', ic.mega, 0],
  ];
  const sub: Record<(typeof BAL)[number], [string, ReactNode, number]> = {
    balances: ['Balances', ic.scale, 0],
    ledger: ['Leave history', ic.history, 0],
    encash: ['Encashment', ic.coins, encN],
    yearend: ['Year-end', ic.flag, 0],
  };

  return (
    <div className="lv-page">
      <div className="lv-top">
        <div className="dfx-tabbar lv-tabs" role="tablist">
          {top.map(([k, l, i, n]) => (
            <button key={k} type="button" role="tab" aria-selected={k === 'balances' ? inBal : tab === k} className={`dfx-tab${(k === 'balances' ? inBal : tab === k) ? ' active' : ''}`} onClick={() => go(k === 'balances' && inBal ? tab : k)}>
              <span className="lv-tab-ic">{i}</span>
              {l}
              {n > 0 && <span className="dfx-count red">{n}</span>}
            </button>
          ))}
        </div>
        <span className="lv-apply">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => set({ apply: '1' })}>
            {Icon.plus} Apply leave
          </button>
        </span>
      </div>
      {inBal && (
        <div className="lv-subtabs" role="tablist">
          {subTabs.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => go(k)}>
              <span className="lv-tab-ic">{sub[k][1]}</span>
              {sub[k][0]}
              {sub[k][2] > 0 && <span className="dfx-count red">{sub[k][2]}</span>}
            </button>
          ))}
        </div>
      )}

      {tab === 'requests' && <RequestsTab open={(id) => set({ request: id })} />}
      {tab === 'attendance' && <AttendanceTab />}
      {tab === 'balances' && <BalancesTab openLedger={(id) => go('ledger', { person: id })} />}
      {tab === 'ledger' && <LedgerTab person={sp.get('person')} setPerson={(id) => set({ person: id })} year={Number(sp.get('year')) || new Date().getFullYear()} setYear={(y) => set({ year: String(y) })} encash={(id) => go('encash', { new: id })} />}
      {tab === 'encash' && <EncashTab newFor={sp.get('new')} clearNew={() => set({ new: null })} openLedger={(id) => go('ledger', { person: id })} />}
      {tab === 'yearend' && <YearEndTab openLedger={(id, y) => go('ledger', { person: id, year: String(y) })} />}
      {tab === 'notify' && <NoticesTab />}
      {tab === 'holidays' && <HolidaysTab />}

      {request && <RequestDrawer id={request} onClose={() => set({ request: null })} openLedger={(id) => go('ledger', { person: id })} open={(id) => set({ request: id })} />}
      {applying && <ApplyDrawer canForOthers={counts.data?.canApplyForOthers ?? false} onClose={() => set({ apply: null })} onDone={(id) => set({ apply: null, request: id })} />}
    </div>
  );
}
