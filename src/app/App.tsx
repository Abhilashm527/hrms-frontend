import { Route, Routes } from 'react-router-dom';
import { GuestOnly, RequireAuth } from '../auth/guards';
import { ActivatePage } from '../pages/ActivatePage';
import { ComingSoonPage } from '../pages/ComingSoonPage';
import { DashboardPage } from '../pages/DashboardPage';
import { LoginPage } from '../pages/LoginPage';
import { ResetPasswordPage } from '../pages/ResetPasswordPage';
import { SignedInPage } from '../pages/SignedInPage';
import { AppShell } from './AppShell';

export function App() {
  return (
    <Routes>
      <Route element={<GuestOnly />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/activate" element={<ActivatePage />} />
      </Route>
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/signed-in" element={<SignedInPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="*" element={<ComingSoonPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
