import { api, blob, del, get, patch, post } from '../lib/http';

export type LayerKey = 'COMPANY' | 'MY' | 'TEAM' | 'DEPT' | 'LOC' | 'HR' | 'REC' | 'FIN';
export type Layer = { key: LayerKey; name: string; description: string; color: string; see: 'FULL' | 'BUSY' | 'NONE'; add: boolean; edit: 'ANY' | 'OWN' | 'NONE'; needsApproval: boolean };
export type Remind = 'NONE' | '15M' | '1H' | '1D';
export type Rsvp = 'YES' | 'MAYBE' | 'NO';

export type Me = {
  id: string;
  name: string;
  admin: boolean;
  manager: boolean;
  timeZone: string;
  layers: Layer[];
  bdayOptOut: boolean;
  remind: Remind;
  myTimeZone: string | null;
  subscribed: boolean;
  subscribedAt: string | null;
};

export type Item = {
  key: string;
  id: string | null;
  source: 'EVENT' | 'HOLIDAY' | 'BIRTHDAY' | 'ANNIVERSARY' | 'LEAVE';
  occurrence?: string;
  date: string;
  start: string | null;
  end: string | null;
  layer: LayerKey;
  vis: 'FULL' | 'BUSY';
  status: 'LIVE' | 'PENDING' | 'REJECTED';
  repeat?: 'NONE' | 'WEEKLY' | 'MONTHLY';
  tzNote?: string | null;
  title: string;
  type: { key: string; name: string; fg: string; bg: string };
  where?: string | null;
  room?: { id: string; name: string; capacity: number; location: string | null } | null;
  until?: string | null;
  private?: boolean;
  sensitive?: boolean;
  remind?: Remind;
  organiser?: { id: string; name: string } | null;
  audienceLabel?: string;
  canEdit: boolean;
  canRsvp: boolean;
  myRsvp?: Rsvp | null;
  auto?: boolean;
};

export type Feed = { from: string; to: string; items: Item[]; me: Me; pending: number; firstPending: string | null };

export type Detail = Item & {
  notes: string | null;
  version: number;
  timeZone: string;
  viewerZone: string;
  startsOn: string;
  startTime: string | null;
  endTime: string | null;
  typeId: string;
  audience: { type: string; ref: string | null; roles: string[]; people: { id: string; name: string }[] };
  invitedCount: number;
  responses?: { yes: number; maybe: number; no: number; none: number; list: { id: string; name: string; answer: Rsvp }[] };
  canApprove: boolean;
  canDelete: boolean;
  log: { at: string; action: string; by: string }[];
};

export type Room = { id: string; name: string; capacity: number; locationId: string | null; location: string | null; active: boolean; version: number; used: number };
export type Options = {
  layers: { key: LayerKey; name: string; color: string; needsApproval: boolean; audiences: { value: string; label: string }[] }[];
  types: { id: string; key: string; name: string; fg: string; bg: string; who: string }[];
  rooms: Room[];
  remind: Remind;
  timeZone: string;
};

export type EventBody = {
  editId?: string;
  title: string;
  layer: LayerKey;
  typeId: string;
  date: string;
  allDay: boolean;
  start: string;
  end: string;
  timeZone?: string;
  where: string;
  roomId: string;
  audience: string;
  people: string[];
  private: boolean;
  sensitive: boolean;
  repeat: 'NONE' | 'WEEKLY' | 'MONTHLY';
  until: string;
  remind: Remind;
  notes: string;
};
export type Check = { errors: { field: string; message: string }[]; warnings: string[]; needsApproval: boolean };

export const calApi = {
  feed: (from: string, to: string) => get<Feed>(`/calendar/feed?${new URLSearchParams({ from, to })}`),
  options: () => get<Options>('/calendar/options'),
  event: (id: string, date?: string) => get<Detail>(`/calendar/events/${id}${date ? `?date=${date}` : ''}`),
  check: (b: EventBody) => post<Check>('/calendar/events/check', b),
  create: (b: EventBody) => post<Detail>('/calendar/events', b),
  update: (id: string, b: EventBody, version: number) => api<Detail>(`/calendar/events/${id}`, { method: 'PATCH', body: b, headers: { 'If-Match': `"${version}"` } }),
  remove: (id: string) => del<void>(`/calendar/events/${id}`),
  approve: (id: string, note?: string) => post<Detail>(`/calendar/events/${id}/approve`, { note }),
  reject: (id: string, note?: string) => post<Detail>(`/calendar/events/${id}/reject`, { note }),
  rsvp: (id: string, answer: Rsvp) => api<{ answer: Rsvp }>(`/calendar/events/${id}/rsvp`, { method: 'PUT', body: { answer } }),
  eventIcs: (id: string, date?: string) => blob(`/calendar/events/${id}/ics${date ? `?date=${date}` : ''}`),
  exportIcs: (from: string, to: string) => blob(`/calendar/export.ics?${new URLSearchParams({ from, to })}`),
  settings: () => get<Me>('/calendar/settings'),
  saveSettings: (p: Partial<{ bdayOptOut: boolean; remind: Remind; timeZone: string | null }>) => patch<Me>('/calendar/settings', p),
  subscribe: () => post<{ token: string; path: string }>('/calendar/settings/subscription'),
  unsubscribe: () => del<void>('/calendar/settings/subscription'),
  rooms: (all = false) => get<Room[]>(`/calendar/rooms${all ? '?all=true' : ''}`),
  addRoom: (b: Partial<Room>) => post<Room>('/calendar/rooms', b),
  saveRoom: (id: string, b: Partial<Room>) => patch<Room>(`/calendar/rooms/${id}`, b),
  removeRoom: (id: string) => del<void>(`/calendar/rooms/${id}`),
};

export const REMIND: [Remind, string][] = [
  ['NONE', 'No reminder'],
  ['15M', '15 minutes before'],
  ['1H', '1 hour before'],
  ['1D', '1 day before'],
];

/** Common zones; the person's own zone is added if it isn't listed. */
export const ZONES: [string, string][] = [
  ['Asia/Kolkata', 'India (IST)'],
  ['Asia/Dubai', 'Dubai (GST)'],
  ['Asia/Singapore', 'Singapore (SGT)'],
  ['Asia/Tokyo', 'Tokyo (JST)'],
  ['Australia/Sydney', 'Sydney (AEST)'],
  ['Europe/London', 'London (GMT/BST)'],
  ['Europe/Berlin', 'Berlin (CET)'],
  ['America/New_York', 'New York (ET)'],
  ['America/Chicago', 'Chicago (CT)'],
  ['America/Los_Angeles', 'Los Angeles (PT)'],
  ['UTC', 'UTC'],
];
export const zoneLabel = (z: string) => ZONES.find(([k]) => k === z)?.[1] ?? z;
