import type { ReactNode } from 'react';
import { Icon } from '../components/icons';

/** `key` is the menu's key in Module permissions. */
export type NavItem = { key: string; path: string; label: string; icon: ReactNode };
export type NavGroup = { label: string; items: NavItem[] };

/** Admin console menu, as in the UX. Only the dashboard is built so far; the rest open a placeholder. */
export const ADMIN_NAV: NavGroup[] = [
  { label: 'Overview', items: [{ key: 'dashboard', path: '/', label: 'Dashboard', icon: Icon.dash }, { key: 'calendar', path: '/calendar', label: 'Calendar', icon: Icon.cal }, { key: 'inbox', path: '/inbox', label: 'Employee requests', icon: Icon.file }] },
  {
    label: 'People',
    items: [
      { key: 'employees', path: '/employees', label: 'Employees', icon: Icon.users },
      { key: 'org', path: '/org', label: 'Org chart', icon: Icon.org },
      { key: 'onboarding', path: '/onboarding', label: 'Onboarding', icon: Icon.userPlus },
      { key: 'assets', path: '/assets', label: 'Assets', icon: Icon.laptop },
    ],
  },
  { label: 'Time & pay', items: [{ key: 'leave', path: '/leave', label: 'Leave & attendance', icon: Icon.cal }, { key: 'payroll', path: '/payroll', label: 'Payroll', icon: Icon.wallet }] },
  { label: 'Talent', items: [{ key: 'recruiting', path: '/recruiting', label: 'Recruiting', icon: Icon.briefcase }, { key: 'performance', path: '/performance', label: 'Performance', icon: Icon.chart }] },
  {
    label: 'Admin',
    items: [
      { key: 'policies', path: '/policies', label: 'Policies', icon: Icon.file },
      { key: 'documents', path: '/documents', label: 'Documents', icon: Icon.file },
      { key: 'reports', path: '/reports', label: 'Reports', icon: Icon.chart },
      { key: 'configuration', path: '/configuration', label: 'Configuration', icon: Icon.sliders },
      { key: 'settings', path: '/settings', label: 'Settings & roles', icon: Icon.settings },
    ],
  },
];

/** Employee self-service menu. */
export const ESS_NAV: NavGroup[] = [
  { label: 'Me', items: [{ key: 'e-home', path: '/', label: 'Home', icon: Icon.dash }, { key: 'e-profile', path: '/me/profile', label: 'My profile', icon: Icon.user }, { key: 'e-onboarding', path: '/me/onboarding', label: 'Onboarding', icon: Icon.userPlus }] },
  {
    label: 'Time & pay',
    items: [
      { key: 'e-leave', path: '/me/leave', label: 'Leave', icon: Icon.cal },
      { key: 'e-attendance', path: '/me/attendance', label: 'Attendance', icon: Icon.cal },
      { key: 'e-pay', path: '/me/pay', label: 'Pay', icon: Icon.wallet },
    ],
  },
  {
    label: 'Company',
    items: [
      { key: 'e-policies', path: '/me/policies', label: 'Policies', icon: Icon.file },
      { key: 'e-assets', path: '/me/assets', label: 'My assets', icon: Icon.laptop },
      { key: 'e-requests', path: '/me/requests', label: 'Requests', icon: Icon.file },
      { key: 'e-directory', path: '/directory', label: 'Directory', icon: Icon.users },
    ],
  },
];

export const allItems = (groups: NavGroup[]) => groups.flatMap((g) => g.items);
