import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { Field, Modal } from '../leave/ui';
import { errorText, fieldErrors } from '../lib/http';
import { RECS, fmtWhen, recApi, recL, type MyInterview } from './api';
import { openResume } from './RecruitingPage';

/** Interviews I'm on the panel for, and the feedback I owe. Open to everyone; no recruiting access needed. */
export function MyInterviewsPage() {
  const q = useQuery({ queryKey: ['rec', 'mine'], queryFn: recApi.mine });
  const [open, setOpen] = useState<MyInterview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (q.isLoading) return <BlockLoader page label="Loading your interviews…" />;
  if (q.isError || !q.data) return <Alert>{errorText(q.error)}</Alert>;
  const now = Date.now();
  const upcoming = q.data.items.filter((i) => new Date(i.at).getTime() > now).reverse();
  const past = q.data.items.filter((i) => new Date(i.at).getTime() <= now);
  const owed = past.filter((i) => !i.myFeedback).length;

  const card = (i: MyInterview) => {
    const due = new Date(i.at).getTime() <= now;
    return (
      <div key={i.id} className="rc-mine">
        <span className="rc-when">{fmtWhen(i.at)}</span>
        <span>
          <b>{i.candidate.name}</b>
          <small>
            {i.round} · {i.job} · {i.durationMin} min · {i.mode}
            {i.place ? ` · ${i.place}` : ''}
          </small>
        </span>
        {i.candidate.hasResume && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => openResume(i.candidate.id).catch((e) => setErr(errorText(e)))}>
            {Icon.file} Résumé
          </button>
        )}
        {i.myFeedback ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(i)}>
            <span className={`pill ${i.myFeedback.recommendation.endsWith('YES') ? 'pill-ok' : 'pill-danger'}`}>{recL(i.myFeedback.recommendation)}</span> Edit
          </button>
        ) : due ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(i)}>
            Give feedback
          </button>
        ) : (
          <span className="pill pill-info">Upcoming</span>
        )}
      </div>
    );
  };

  return (
    <div className="py-page">
      <div className="ml-top">
        <span>
          <h1>My interviews</h1>
          <small>{owed ? `${owed} interview${owed === 1 ? '' : 's'} waiting for your feedback` : 'Interviews you’re on the panel for'}</small>
        </span>
      </div>
      {err && <Alert>{err}</Alert>}
      {q.data.items.length === 0 ? (
        <div className="py-empty">
          <b>No interviews yet</b>
          <span>When a recruiter adds you to an interview panel, it shows up here.</span>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div className="py-run">
              <span className="py-sec">Coming up</span>
              {upcoming.map(card)}
            </div>
          )}
          {past.length > 0 && (
            <div className="py-run">
              <span className="py-sec">Past</span>
              {past.map(card)}
            </div>
          )}
        </>
      )}
      {open && <FeedbackDialog iv={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function FeedbackDialog({ iv, onClose }: { iv: MyInterview; onClose: () => void }) {
  const qc = useQueryClient();
  const [rating, setRating] = useState(iv.myFeedback?.rating ?? 0);
  const [rec, setRec] = useState(iv.myFeedback?.recommendation ?? '');
  const [notes, setNotes] = useState(iv.myFeedback?.notes ?? '');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => recApi.feedback(iv.id, { rating, recommendation: rec, notes }),
    onSuccess: () => (qc.invalidateQueries({ queryKey: ['rec'] }), onClose()),
    onError: (e) => (setErrs(fieldErrors(e)), setErr(errorText(e))),
  });
  return (
    <Modal
      title={`Feedback · ${iv.candidate.name}`}
      sub={`${iv.round} · ${iv.job}`}
      onClose={onClose}
      foot={
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={save.isPending || !rating || !rec} onClick={() => save.mutate()}>
            {save.isPending ? 'Sending…' : 'Submit feedback'}
          </button>
        </>
      }
    >
      {err && <Alert>{err}</Alert>}
      <Field label="Overall rating" error={errs.rating}>
        <span className="rc-rate">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-pressed={rating >= n} aria-label={`${n} of 5`} onClick={() => setRating(n)}>
              ★
            </button>
          ))}
        </span>
      </Field>
      <Field label="Should we hire?" error={errs.recommendation}>
        <span className="seg">
          {RECS.map(([k, l]) => (
            <button key={k} type="button" aria-pressed={rec === k} onClick={() => setRec(k)}>
              {l}
            </button>
          ))}
        </span>
      </Field>
      <Field label="Notes" hint="Strengths, concerns, what to probe in the next round">
        <textarea className="input" rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </Modal>
  );
}
