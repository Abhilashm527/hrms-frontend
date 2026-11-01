(() => {
  const real = window.fetch.bind(window);
  const AS = (localStorage.getItem('hrms-test-as') || 'c8e580cf-0dba-3ecb-bbe4-387642cfa6c9');
  const user = { id: 'u1', employeeId: AS, code: 'EMP', name: 'Test user', email: 'test@ivoyant.com', initials: 'TU', photoUrl: '' };
  const ok = { status: 'OK', accessToken: 'fake.jwt', expiresIn: 900, landing: 'ADMIN', user };
  const J = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
  window.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.includes('/auth/login') || u.includes('/auth/refresh')) return J(ok);
    if (u.includes('/auth/me')) return J({ user, landing: 'ADMIN', consoleAccess: true, amr: ['pwd', 'otp'], session: { id: 's1', remember: true, expiresAt: new Date(Date.now() + 6e8).toISOString() } });
    if (u.includes('/auth/config')) return J({ ssoEnabled: false, passwordEnabled: true, domains: ['ivoyant.com'], supportEmail: 'it@ivoyant.com', pwPolicy: 'STRONG' });
    if (u.includes('/api/')) {
      const h = new Headers(init.headers || {});
      h.delete('Authorization');
      h.set('X-Dev-User', AS);
      return real(url, { ...init, headers: h });
    }
    return real(url, init);
  };
})();
