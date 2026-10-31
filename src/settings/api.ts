import { api, del, get, post } from '../lib/http';

type Ref = { id: string; name: string };
type Head = { employeeId: string; name: string; initials: string } | null;

export type Department = {
  id: string;
  name: string;
  code: string | null;
  parentId: string | null;
  parentName: string | null;
  path: string[];
  level: number | null;
  head: Head;
  costCentre: string | null;
  defaultLocation: Ref | null;
  active: boolean;
  description: string | null;
  sort: number;
  headcount: number | null;
  headcountTotal: number | null;
  childCount: number | null;
  version: number;
  warnings?: string[];
};

export type EmploymentType = {
  id: string;
  name: string;
  code: string;
  probationMonths: number;
  noticeDays: number;
  leaveEligible: boolean;
  payrollEligible: boolean;
  fixedTerm: boolean;
  sort: number;
  active: boolean;
  headcount: number | null;
  version: number;
  warnings?: string[];
};

export type Location = {
  id: string;
  name: string;
  code: string;
  type: string;
  typeLabel: string;
  address: { line: string; city: string; state: string; postalCode: string; country: string };
  timezone: string;
  phone: string | null;
  email: string | null;
  head: Head;
  schedule: { weekPattern: string; weekLabel: string; start: string; end: string; graceMinutes: number };
  holidayCalendar: { id: string; name: string; label: string } | null;
  attendance: { methods: string[]; geoRadiusM: number | null; latitude: number | null; longitude: number | null; wfhAllowed: boolean };
  statutory: { lwf: boolean; esiNotified: boolean; shopsEstabRegNo: string | null; gstin: string | null; ptLabel: string | null; ptApplies: boolean };
  seatCapacity: number | null;
  assetStore: boolean;
  active: boolean;
  stats?: { headcount: number; utilisation: number | null; free: number | null };
  version: number;
  warnings?: string[];
};

export type LocationMeta = {
  types: { value: string; label: string; fg: string; bg: string }[];
  methods: { value: string; label: string }[];
  weekPatterns: { value: string; label: string }[];
  states: { name: string; code: string; gst: string; pt: boolean; lwf: boolean }[];
  timezones: { id: string; label: string }[];
  holidayCalendars: { id: string; name: string; state: string; label: string }[];
};

const ifMatch = (version: number) => ({ 'If-Match': `"${version}"` });
const merge = (path: string, body: unknown, version: number) => api<unknown>(path, { method: 'PATCH', body, headers: ifMatch(version) });

export const settingsApi = {
  departments: () => get<Department[]>('/departments?view=flat&include=stats'),
  createDepartment: (body: Record<string, unknown>) => post<Department>('/departments', body),
  updateDepartment: (id: string, body: Record<string, unknown>, version: number) => merge(`/departments/${id}`, body, version),
  deleteDepartment: (id: string, reassignTo?: string) => del<void>(`/departments/${id}${reassignTo ? `?reassignTo=${reassignTo}` : ''}`),

  employmentTypes: () => get<EmploymentType[]>('/employment-types?include=stats'),
  createEmploymentType: (body: Record<string, unknown>) => post<EmploymentType>('/employment-types', body),
  updateEmploymentType: (id: string, body: Record<string, unknown>, version: number) => merge(`/employment-types/${id}`, body, version),
  deleteEmploymentType: (id: string, reassignTo?: string) => del<void>(`/employment-types/${id}${reassignTo ? `?reassignTo=${reassignTo}` : ''}`),

  locations: () => get<Location[]>('/locations?include=stats'),
  locationMeta: () => get<LocationMeta>('/locations/meta'),
  statutoryPreview: (state: string, locationId?: string) =>
    get<{ ptTitle: string | null; ptRule: string | null; lwfDefault: boolean; affectedEmployees: number }>(`/locations/statutory-preview?${new URLSearchParams({ state, ...(locationId ? { locationId } : {}) })}`),
  createLocation: (body: Record<string, unknown>) => post<Location>('/locations', body),
  updateLocation: (id: string, body: Record<string, unknown>, version: number) => api<Location>(`/locations/${id}`, { method: 'PATCH', body, headers: ifMatch(version) }),
  deleteLocation: (id: string) => del<void>(`/locations/${id}`),
};
