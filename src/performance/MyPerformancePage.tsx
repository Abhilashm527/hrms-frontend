import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { errorText } from '../lib/http';
import { fmtD, perfApi } from './api';
import { Goals, ReviewBody } from './PerformancePage';

/** Employee self-service: my reviews (self review to write, results once a cycle closes) and my goals. */
export function MyPerformancePage() {
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const open = sp.get('review');
  const q = useQuery({ queryKey: ['perf', 'me'], queryFn: perfApi.mine });
  const review = useQuery({ queryKey: ['perf', 'review', open], queryFn: () => perfApi.review(open!), enabled: !!open });
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);
  if (q.isLoading) return <BlockLoader page label="Loading…" />;
  if (q.isError || !q.data) return <Alert>{errorText(q.error)}</Alert>;
  if (open)
    return (
      <div className="ma-page">
        <div className="po-read-head">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSp({})}>
            {Icon.chevL} My performance
          </button>
          <b style={{ fontSize: 16 }}>{review.data?.cycleName}</b>
        </div>
        {review.isLoading || !review.data ? (
          <BlockLoader label="Loading…" height={200} />
        ) : (
          <div className="mo-card" style={{ padding: 16 }}>
            {review.data.cycleStatus === 'ACTIVE' && review.data.selfSubmittedAt && <Alert kind="info">Submitted. You'll see your manager's feedback when HR closes the cycle.</Alert>}
            <ReviewBody r={review.data} onSaved={(r, m) => (qc.setQueryData(['perf', 'review', open], r), qc.invalidateQueries({ queryKey: ['perf', 'me'] }), setToast(m))} />
          </div>
        )}
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </div>
    );
  return (
    <div className="ma-page">
      <div className="ml-top">
        <span>
          <h1>Performance</h1>
          <small>Your reviews and goals</small>
        </span>
      </div>
      <div className="mo-card mo-list">
        {q.data.reviews.map((r) => (
          <button key={r.id} type="button" className="po-ess-row" onClick={() => setSp({ review: r.id })}>
            <span className="po-ess-t">
              <b>{r.cycle}</b>
              <small>
                {r.status === 'ACTIVE' ? (r.selfDone ? 'Self review submitted · waiting for your manager' : `Self review due ${fmtD(r.selfDue)}`) : 'Closed · see your feedback'}
              </small>
            </span>
            <span className={`pill ${r.status === 'ACTIVE' && !r.selfDone ? 'pill-warn' : r.status === 'CLOSED' ? 'pill-ok' : 'pill-info'}`}>
              {r.status === 'ACTIVE' ? (r.selfDone ? 'Submitted' : 'To do') : 'Results'}
            </span>
            {Icon.chevR}
          </button>
        ))}
        {!q.data.reviews.length && <div className="ml-empty">No reviews yet. HR opens review cycles, usually twice a year.</div>}
      </div>
      <div className="mo-card" style={{ padding: 16 }}>
        <Goals goals={q.data.goals} canEdit />
      </div>
    </div>
  );
}
