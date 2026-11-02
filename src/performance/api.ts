import { api, del, get, post } from '../lib/http';

export type CycleStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED';
export type Cycle = { id: string; name: string; periodStart: string; periodEnd: string; selfDue: string; managerDue: string; status: CycleStatus; reviews?: number; done?: number };
export type ReviewRow = {
  id: string;
  employee: { id: string; name: string; title: string; department: string };
  reviewer: string | null;
  reviewerIsMe: boolean;
  selfDone: boolean;
  managerDone: boolean;
  selfRating: number | null;
  managerRating: number | null;
  finalRating: number | null;
  rating: string | null;
};
export type CycleView = Cycle & { rows: ReviewRow[]; total: number; done: number; selfPending: number; managerPending: number; distribution: { label: string; value: number; n: number }[]; canManage: boolean };
export type Goal = { id: string; title: string; detail: string | null; dueDate: string | null; progress: number; status: 'ACTIVE' | 'DONE' | 'DROPPED'; updatedAt: string };
export type Review = {
  id: string;
  cycleId: string;
  cycleName: string;
  cycleStatus: CycleStatus;
  selfDue: string;
  managerDue: string;
  periodStart: string;
  periodEnd: string;
  employeeId: string;
  employeeName: string;
  employeeTitle: string;
  department: string;
  reviewerName: string | null;
  selfAnswers: Record<string, string>;
  selfRating: number | null;
  selfSubmittedAt: string | null;
  managerAnswers: Record<string, string>;
  managerRating: number | null;
  managerSubmittedAt: string | null;
  finalRating: number | null;
  finalNote: string | null;
  can: { self: boolean; manager: boolean; calibrate: boolean };
  ratings: string[];
  goals: Goal[];
};

const P = '/performance';
export const perfApi = {
  cycles: () => get<{ items: Cycle[]; canManage: boolean; ratings: string[] }>(`${P}/cycles`),
  create: (b: Record<string, string>) => post<{ id: string }>(`${P}/cycles`, b),
  cycle: (id: string) => get<CycleView>(`${P}/cycles/${id}`),
  remove: (id: string) => del<void>(`${P}/cycles/${id}`),
  launch: (id: string) => post<{ reviews: number }>(`${P}/cycles/${id}/launch`),
  close: (id: string) => post<void>(`${P}/cycles/${id}/close`),
  remind: (id: string) => post<{ self: number; managers: number }>(`${P}/cycles/${id}/remind`),
  review: (id: string) => get<Review>(`${P}/reviews/${id}`),
  saveSelf: (id: string, b: { answers: Record<string, string>; rating: number | null; submit: boolean }) => api<Review>(`${P}/reviews/${id}/self`, { method: 'PUT', body: b }),
  saveManager: (id: string, b: { answers: Record<string, string>; rating: number | null; submit: boolean }) => api<Review>(`${P}/reviews/${id}/manager`, { method: 'PUT', body: b }),
  calibrate: (id: string, b: { rating: number | null; note: string }) => api<Review>(`${P}/reviews/${id}/final`, { method: 'PUT', body: b }),
  mine: () => get<{ reviews: { id: string; cycle: string; status: CycleStatus; selfDue: string; periodEnd: string; selfDone: boolean; managerDone: boolean }[]; goals: Goal[]; ratings: string[] }>(`${P}/me`),
  addGoal: (b: Record<string, unknown>) => post<{ id: string; goals: Goal[] }>(`${P}/goals`, b),
  updateGoal: (id: string, b: Record<string, unknown>) => api<{ id: string; goals: Goal[] }>(`${P}/goals/${id}`, { method: 'PUT', body: b }),
  deleteGoal: (id: string) => del<void>(`${P}/goals/${id}`),
};

export const SELF_Q: [string, string, string][] = [
  ['achievements', 'What did you achieve this period?', 'Your main results, with examples'],
  ['challenges', 'What was hard, and what would you do differently?', ''],
  ['growth', 'What do you want to learn or take on next?', ''],
];
export const MANAGER_Q: [string, string, string][] = [
  ['strengths', 'Strengths shown this period', ''],
  ['improvements', 'Where to grow', ''],
  ['summary', 'Overall summary', 'Shared with them when the cycle closes'],
];
export const fmtD = (d: string | null | undefined) => (d ? new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const RATE_C = ['#B91C1C', '#B45309', '#475569', '#0F766E', '#6D28D9'];
