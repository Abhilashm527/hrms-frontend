import type { ReactNode } from 'react';
import { Icon } from '../components/icons';

export type NavItem = { path: string; label: string; icon: ReactNode };
export type NavGroup = { label: string; items: NavItem[] };

/** Admin console menu, as in the UX. Only the dashboard is built so far; the rest open a placeholder. */
export const ADMIN_NAV: NavGroup[] = [
  { label: 'Overview', items: [{ path: '/', label: 'Dashboard', icon: Icon.dash }, { path: '/calendar', label: 'Calendar', icon: Icon.cal }, { path: '/inbox', label: 'Employee requests', icon: Icon.file }] },
  {
    label: 'People',
    items: [
      { path: '/employees', label: 'Employees', icon: Icon.users },
      { path: '/org', label: 'Org chart', icon: Icon.org },
      { path: '/onboarding', label: 'Onboarding', icon: Icon.userPlus },
      { path: '/assets', label: 'Assets', icon: Icon.laptop },
    ],
  },
  { label: 'Time & pay', items: [{ path: '/leave', label: 'Leave & attendance', icon: Icon.cal }, { path: '/payroll', label: 'Payroll', icon: Icon.wallet }] },
  { label: 'Talent', items: [{ path: '/recruiting', label: 'Recruiting', icon: Icon.briefcase }, { path: '/performance', label: 'Performance', icon: Icon.chart }] },
  {
    label: 'Admin',
    items: [
      { path: '/policies', label: 'Policies', icon: Icon.file },
      { path: '/documents', label: 'Documents', icon: Icon.file },
      { path: '/reports', label: 'Reports', icon: Icon.chart },
      { path: '/settings', label: 'Settings & roles', icon: Icon.settings },
    ],
  },
];

/** Employee self-service menu. */
export const ESS_NAV: NavGroup[] = [
  { label: 'Me', items: [{ path: '/', label: 'Home', icon: Icon.dash }, { path: '/me/profile', label: 'My profile', icon: Icon.user }, { path: '/me/onboarding', label: 'Onboarding', icon: Icon.userPlus }] },
  {
    label: 'Time & pay',
    items: [
      { path: '/me/leave', label: 'Leave', icon: Icon.cal },
      { path: '/me/attendance', label: 'Attendance', icon: Icon.cal },
      { path: '/me/pay', label: 'Pay', icon: Icon.wallet },
    ],
  },
  {
    label: 'Company',
    items: [
      { path: '/me/policies', label: 'Policies', icon: Icon.file },
      { path: '/me/assets', label: 'My assets', icon: Icon.laptop },
      { path: '/me/requests', label: 'Requests', icon: Icon.file },
      { path: '/directory', label: 'Directory', icon: Icon.users },
    ],
  },
];

export const allItems = (groups: NavGroup[]) => groups.flatMap((g) => g.items);
