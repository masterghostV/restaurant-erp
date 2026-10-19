'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useStore } from '../store/useStore';

/**
 * Patches `window.fetch` once, app-wide, to watch for 401 responses from
 * our own backend API. Without this, an expired/invalid JWT just makes
 * every API call silently fail with a generic error — the person stays
 * "logged in" on screen with a broken app until they manually log out.
 * This catches that and cleanly bounces them back to the login page.
 */
export default function AuthWatcher() {
  const router = useRouter();
  const pathname = usePathname();
  const clearAuth = useStore((state) => state.clearAuth);

  useEffect(() => {
    const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/+$/, '');
    const originalFetch = window.fetch;

    window.fetch = async (...args) => {
      const response = await originalFetch(...args);

      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request)?.url || '';
      const isOwnApi = url.startsWith(apiUrl);
      const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/register');

      if (isOwnApi && !isAuthEndpoint && response.status === 401) {
        clearAuth();
        if (!pathname.startsWith('/login') && pathname !== '/') {
          router.push('/login');
        }
      }

      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [clearAuth, router, pathname]);

  return null;
}
