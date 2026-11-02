import { get, post, api } from '../lib/http';

export type Stage = 'APPLIED' | 'SCREENING' | 'INTERVIEW' | 'OFFER' | 'HIRED' | 'REJECTED';
export const STAGES: Stage[] = ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED'];
export const STAGE_L: Record<Stage, string> = { APPLIED: 'Applied', SCREENING: 'Screening', INTERVIEW: 'Interview', OFFER: 'Offer', HIRED: 'Hired', REJECTED: 'Rejected' };
export const STAGE_C: Record<Stage, string> = { APPLIED: 'pill-muted', SCREENING: 'pill-info', INTERVIEW: 'pill-info', OFFER: 'pill-warn', HIRED: 'pill-ok', REJECTED: 'pill-danger' };
export const SOURCES = ['Careers page', 'Referral', 'LinkedIn', 'Naukri', 'Agency', 'Campus', 'Other'];
export const RECS: [string, string][] = [
  ['STRONG_YES', 'Strong yes'],
  ['YES', 'Yes'],
  ['NO', 'No'],
  ['STRONG_NO', 'Strong no'],
];
export const recL = (r: string) => RECS.find((x) => x[0] === r)?.[1] ?? r;

export type JobStatus = 'DRAFT' | 'OPEN' | 'ON_HOLD' | 'CLOSED';
export type Job = {
  id: string;
  code: string;
  title: string;
  department: string | null;
  location: string | null;
  openings: number;
  experience: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  hiringManager: string | null;
  recruiter: string | null;
  targetDate: string | null;
  status: JobStatus;
  createdAt: string;
  departmentId: string | null;
  locationId: string | null;
  hiringManagerId: string | null;
  recruiterId: string | null;
  description: string | null;
  skills: string | null;
  stages: Record<Stage, number>;
};
export type CandRow = {
  id: string;
  name: string;
  stage: Stage;
  source: string;
  company: string | null;
  title: string | null;
  experience: number | null;
  expectedCtc: number | null;
  noticeDays: number | null;
  since: string;
  job: { id: string; title: string };
  nextInterview: string | null;
  score: number | null;
};
export type Feedback = { by: string; rating: number; recommendation: string; notes: string | null; at: string; employeeId: string };
export type Interview = {
  id: string;
  round: string;
  at: string;
  durationMin: number;
  mode: string;
  place: string | null;
  status: 'SCHEDULED' | 'DONE' | 'CANCELLED';
  candidate: { id: string; name: string };
  job: string;
  panel: string;
  panelIds: string[];
  feedbackCount: number;
  feedback: Feedback[];
};
export type Offer = { id: string; ctc: number; joiningDate: string; note: string | null; status: 'SENT' | 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN'; createdAt: string; decidedAt: string | null };
export type Candidate = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: string;
  referredBy: string | null;
  company: string | null;
  title: string | null;
  experience: number | null;
  noticeDays: number | null;
  expectedCtc: number | null;
  stage: Stage;
  rejectedReason: string | null;
  resumeName: string | null;
  notes: string | null;
  createdAt: string;
  since: string;
  job: { id: string; title: string; department: string; location: string; departmentId: string; locationId: string; hiringManagerId: string; hiringManager: string };
  interviews: Interview[];
  offers: Offer[];
  events: { text: string; at: string; by: string }[];
  canEdit: boolean;
};
export type Overview = {
  funnel: { stage: Stage; n: number }[];
  kpis: { openJobs: number; openings: number; active: number; interviewsWeek: number; offersOut: number; hired90: number };
  sources: { source: string; n: number; interviewed: number }[];
  todo: { candidateId: string; text: string; sub: string; action: string }[];
  upcoming: Interview[];
  canEdit: boolean;
};
export type MyInterview = {
  id: string;
  round: string;
  at: string;
  durationMin: number;
  mode: string;
  place: string | null;
  status: string;
  candidate: { id: string; name: string; hasResume: boolean };
  job: string;
  myFeedback: { rating: number; recommendation: string; notes: string } | null;
};

const R = '/recruiting';
export const recApi = {
  overview: () => get<Overview>(`${R}/overview`),
  jobs: () => get<{ items: Job[]; canEdit: boolean }>(`${R}/jobs`),
  saveJob: (id: string | null, b: Record<string, unknown>) => (id ? api<{ id: string }>(`${R}/jobs/${id}`, { method: 'PUT', body: b }) : post<{ id: string }>(`${R}/jobs`, b)),
  pipeline: (jobId?: string) => get<{ items: CandRow[]; canEdit: boolean }>(`${R}/candidates${jobId ? `?jobId=${jobId}` : ''}`),
  add: (f: FormData) => post<Candidate>(`${R}/candidates`, f),
  candidate: (id: string) => get<Candidate>(`${R}/candidates/${id}`),
  update: (id: string, b: Record<string, unknown>) => api<Candidate>(`${R}/candidates/${id}`, { method: 'PUT', body: b }),
  move: (id: string, stage: Stage, reason?: string) => post<Candidate>(`${R}/candidates/${id}/stage`, { stage, reason }),
  uploadResume: (id: string, f: File) => {
    const fd = new FormData();
    fd.append('resume', f);
    return post<Candidate>(`${R}/candidates/${id}/resume`, fd);
  },
  resumeUrl: (id: string) => `${R}/candidates/${id}/resume`,
  schedule: (id: string, b: Record<string, unknown>) => post<Candidate>(`${R}/candidates/${id}/interviews`, b),
  offer: (id: string, b: Record<string, unknown>) => post<Candidate>(`${R}/candidates/${id}/offers`, b),
  interviews: () => get<{ items: Interview[] }>(`${R}/interviews`),
  interviewStatus: (id: string, status: string) => post<Candidate>(`${R}/interviews/${id}/status`, { status }),
  feedback: (id: string, b: Record<string, unknown>) => post<{ items: MyInterview[] }>(`${R}/interviews/${id}/feedback`, b),
  mine: () => get<{ items: MyInterview[] }>(`${R}/me/interviews`),
  offers: () => get<{ items: (Offer & { candidate: { id: string; name: string }; job: string })[] }>(`${R}/offers`),
  decide: (id: string, status: string) => post<Candidate>(`${R}/offers/${id}/decision`, { status }),
};

const dt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
export const fmtWhen = (s: string) => dt.format(new Date(s));
export const lakh = (n: number | null | undefined) => (n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })} L`);
export const ago = (s: string) => {
  const d = Math.floor((Date.now() - new Date(s).getTime()) / 86_400_000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
};
