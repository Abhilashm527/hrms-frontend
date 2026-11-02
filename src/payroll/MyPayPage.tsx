import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { errorText } from '../lib/http';
import { inr, lakh, payApi, save } from './api';
import { SlipView } from './PayrollPage';

/** Employee self-service: payslips, an estimate of this year's tax under each regime, and yearly statements. */
export function MyPayPage() {
  const q = useQuery({ queryKey: ['payroll', 'me'], queryFn: payApi.mine });
  const [tab, setTab] = useState<'slips' | 'tax' | 'statements'>('slips');
  const [sel, setSel] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const slips = q.data?.slips ?? [];
  const cur = sel ?? slips[0]?.id ?? null;
  const slip = useQuery({ queryKey: ['payroll', 'slip', cur], queryFn: () => payApi.slip(cur!), enabled: !!cur });
  useEffect(() => setErr(null), [tab]);
  if (q.isLoading) return <BlockLoader page label="Loading your pay…" />;
  if (q.isError || !q.data) return <Alert>{errorText(q.error)}</Alert>;
  const t = q.data.tax;
  return (
    <div className="ma-page">
      <div className="ml-top">
        <span>
          <h1>Payslips & tax</h1>
          <small>{t?.fy ?? 'Your pay'}</small>
        </span>
      </div>
      <div className="dfx-tabbar" role="tablist">
        {(
          [
            ['slips', 'Payslips'],
            ['tax', 'Tax'],
            ['statements', 'Statements'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`dfx-tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      {err && <Alert>{err}</Alert>}
      {tab === 'slips' &&
        (slips.length === 0 ? (
          <div className="ml-empty mo-card">Your first payslip appears here after your first payday.</div>
        ) : (
          <div className="mp-slips">
            <div className="mp-months" role="listbox" aria-label="Month">
              {slips.map((s) => (
                <button key={s.id} type="button" role="option" aria-selected={s.id === cur} className={s.id === cur ? 'on' : undefined} onClick={() => setSel(s.id)}>
                  <span>{s.label}</span>
                  <b>{inr(s.net)}</b>
                </button>
              ))}
            </div>
            <div className="mo-card mp-detail">
              {slip.isLoading || !slip.data ? (
                <BlockLoader label="Loading…" height={200} />
              ) : (
                <>
                  <div className="mp-detail-h">
                    <span>
                      <b>Payslip · {slip.data.label}</b>
                      <small>Net pay {inr(slip.data.net)}</small>
                    </span>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => void payApi.slipPdf(slip.data!.id).then((b) => save(b, `payslip-${slip.data!.period.slice(0, 7)}.pdf`)).catch((e) => setErr(errorText(e)))}>
                      {Icon.download} Download PDF
                    </button>
                  </div>
                  <SlipView s={slip.data} />
                </>
              )}
            </div>
          </div>
        ))}
      {tab === 'tax' &&
        (!t ? (
          <div className="ml-empty mo-card">Your salary isn't set up in payroll yet.</div>
        ) : (
          <div className="mo-card mp-tax">
            <span>
              Estimated on your annual CTC of <b>{lakh(t.ctcAnnual)}</b>. Payroll deducts tax under the <b>{t.regime === 'OLD' ? 'old' : 'new'}</b> regime.
            </span>
            <div className="mp-regimes">
              {(
                [
                  ['NEW', 'New regime', t.newRegime],
                  ['OLD', 'Old regime', t.oldRegime],
                ] as const
              ).map(([k, l, v]) => (
                <div key={k} className={`mp-regime${t.regime === k ? ' on' : ''}`}>
                  <span>
                    <b>{l}</b>
                    {v <= Math.min(t.newRegime, t.oldRegime) && <span className="pill no-dot pill-ok">Lower tax</span>}
                    {t.regime === k && <span className="pill no-dot pill-info">Yours</span>}
                  </span>
                  <span className="ml-muted">
                    Est. tax {inr(v)} a year · {inr(v / 12)} a month
                  </span>
                </div>
              ))}
            </div>
            <span className="ml-muted">
              {t.declared ? 'The old-regime figure uses your submitted declaration.' : 'The old-regime figure assumes no investments.'} Declare investments and choose a regime under{' '}
              <Link to="/me/requests?tab=tax">Requests → Tax declaration</Link>; HR updates the regime payroll uses.
            </span>
          </div>
        ))}
      {tab === 'statements' && (
        <div className="mo-card mo-list">
          {q.data.statements.map((s) => (
            <div key={s.fyStart} className="mo-task">
              <span className="mo-task-t">
                <b>Pay and tax statement · {s.label}</b>
                <small>Your gross pay, PF, professional tax and TDS for the year, from your payslips</small>
              </span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void payApi.statement(s.fyStart).then((b) => save(b, `tax-statement-FY${s.fyStart}.pdf`)).catch((e) => setErr(errorText(e)))}>
                {Icon.download} Download
              </button>
            </div>
          ))}
          {!q.data.statements.length && <div className="ml-empty">Statements appear once you've been paid in a financial year.</div>}
          <div className="mo-task">
            <span className="mo-task-t">
              <small>Form 16 is issued by the company from the income-tax TRACES portal after the year's returns are filed, usually by 15 June.</small>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
