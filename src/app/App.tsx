import { Navigate, Route, Routes } from 'react-router-dom';
import { GuestOnly, RequireAuth } from '../auth/guards';
import { ActivatePage } from '../pages/ActivatePage';
import { ComingSoonPage } from '../pages/ComingSoonPage';
import { DashboardPage } from '../pages/DashboardPage';
import { OnboardingPage } from '../onboarding/OnboardingPage';
import { PortalPage } from '../onboarding/PortalPage';
import { LoginPage } from '../pages/LoginPage';
import { ResetPasswordPage } from '../pages/ResetPasswordPage';
import { SignedInPage } from '../pages/SignedInPage';
import { AppShell } from './AppShell';
import { useAuth } from '../auth/AuthProvider';
import { EmployeesPage } from '../employees/EmployeesPage';
import { ProfilePage } from '../employees/ProfilePage';
import { DepartmentsPage } from '../settings/DepartmentsPage';
import { EmploymentTypesPage } from '../settings/EmploymentTypesPage';
import { LocationsPage } from '../settings/LocationsPage';
import { OrganizationPage } from '../settings/OrganizationPage';
import { SetupChecklistPage } from '../settings/SetupChecklistPage';
import { PositionsPage } from '../settings/PositionsPage';
import { FieldsFormsPage } from '../settings/fields/FieldsFormsPage';
import { RolesPage } from '../access/RolesPage';
import { AssignmentsPage } from '../access/AssignmentsPage';
import { AreaOwnersPage, EffectivePage, FieldSecurityPage } from '../access/AccessPages';
import { ACCESS_GROUPS, AccessComingNext, CONFIG_GROUPS, SectionLayout } from '../settings/SettingsLayout';
import { LeavePage } from '../leave/LeavePage';
import { CalendarPage } from '../calendar/CalendarPage';
import { InboxPage } from '../requests/InboxPage';
import { MyRequestsPage } from '../requests/MyRequestsPage';
import { AssetsPage } from '../assets/AssetsPage';
import { MyAssetsPage } from '../assets/MyAssetsPage';
import { ApprovalChainPage } from '../settings/leave/ApprovalChainPage';
import { HolidayTypesPage } from '../settings/leave/HolidayTypesPage';
import { LeavePolicyPage } from '../settings/leave/LeavePolicyPage';
import { ProjectsPage, TeamsPage, TitlesPage } from '../settings/OrgListsPages';
import { ReportingLinesPage } from '../settings/ReportingLinesPage';
import { RelationsPage } from '../settings/RelationsPage';
import { ConnectsPage } from '../settings/ConnectsPage';
import { EmployeeFieldsPage } from '../settings/EmployeeFieldsPage';
import { AssetConfigPage, CustomFieldsPage, OnboardingConfigPage } from '../settings/ModuleListsPage';
import { CalendarTypesPage, RequestTypesPage } from '../settings/ModuleTypesPages';
import { OpenFgaPage, TeamsIntegrationPage } from '../settings/IntegrationsPages';

export function App() {
  return (
    <Routes>
      <Route element={<GuestOnly />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/activate" element={<ActivatePage />} />
      </Route>
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/signed-in" element={<SignedInPage />} />
      <Route path="/portal" element={<PortalPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="/me/profile" element={<MyProfileRedirect />} />
          <Route path="/employees" element={<EmployeesPage />} />
          <Route path="/employees/:employeeId" element={<ProfilePage />} />
          <Route path="/directory" element={<EmployeesPage />} />
          <Route path="/leave" element={<LeavePage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/assets" element={<AssetsPage />} />
          <Route path="/me/assets" element={<MyAssetsPage />} />
          <Route path="/me/requests" element={<MyRequestsPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/onboarding/:hireId" element={<OnboardingPage />} />
          <Route path="/configuration" element={<SectionLayout groups={CONFIG_GROUPS} />}>
            <Route index element={<Navigate to="departments" replace />} />
            <Route path="fields/:area" element={<FieldsFormsPage />} />
            <Route path="setup" element={<SetupChecklistPage />} />
            <Route path="organization" element={<OrganizationPage />} />
            <Route path="departments" element={<DepartmentsPage />} />
            <Route path="positions" element={<PositionsPage />} />
            <Route path="locations" element={<LocationsPage />} />
            <Route path="employment-types" element={<EmploymentTypesPage />} />
            <Route path="titles" element={<TitlesPage />} />
            <Route path="reporting-lines" element={<ReportingLinesPage />} />
            <Route path="relations" element={<RelationsPage />} />
            <Route path="how-it-connects" element={<ConnectsPage />} />
            <Route path="employee-fields" element={<EmployeeFieldsPage />} />
            <Route path="custom-fields" element={<CustomFieldsPage />} />
            <Route path="onboarding" element={<OnboardingConfigPage />} />
            <Route path="assets" element={<AssetConfigPage />} />
            <Route path="calendar-types" element={<CalendarTypesPage />} />
            <Route path="request-types" element={<RequestTypesPage />} />
            <Route path="openfga" element={<OpenFgaPage />} />
            <Route path="microsoft-teams" element={<TeamsIntegrationPage />} />
            <Route path="teams" element={<TeamsPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="leave-policy" element={<LeavePolicyPage />} />
            <Route path="approval-chain" element={<ApprovalChainPage />} />
            <Route path="holiday-types" element={<HolidayTypesPage />} />
          </Route>
          <Route path="/settings" element={<SectionLayout groups={ACCESS_GROUPS} />}>
            <Route index element={<Navigate to="roles" replace />} />
            <Route path="roles" element={<RolesPage />} />
            <Route path="assignments" element={<AssignmentsPage />} />
            <Route path="field-security" element={<FieldSecurityPage />} />
            <Route path="effective" element={<EffectivePage />} />
            <Route path="area-owners" element={<AreaOwnersPage />} />
            <Route path="*" element={<AccessComingNext />} />
          </Route>
          {/* Earlier links to these pages lived under Settings. */}
          {['departments', 'locations', 'employment-types'].map((p) => (
            <Route key={p} path={`/settings/${p}`} element={<Navigate to={`/configuration/${p}`} replace />} />
          ))}
          <Route path="*" element={<ComingSoonPage />} />
        </Route>
      </Route>
    </Routes>
  );
}

function MyProfileRedirect() {
  const { user } = useAuth();
  return user ? <Navigate to={`/employees/${user.employeeId}`} replace /> : null;
}
