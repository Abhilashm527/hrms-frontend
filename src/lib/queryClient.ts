import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './http';

/**
 * Server data is cached in memory only (never persisted to storage: it is personal data) and dropped on sign-out.
 * Fresh for 30s, kept 5 min after the last screen using it goes away, refetched when the window regains focus.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
    mutations: { retry: false },
  },
});
