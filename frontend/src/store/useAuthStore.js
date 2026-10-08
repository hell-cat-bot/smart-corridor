import { create } from 'zustand';
import api, { ApiError, tokenStore, setSessionExpiredHandler } from '../lib/apiClient';

/**
 * Who is signed in.
 *
 * `status` is what the router keys off:
 *
 *   loading   still checking a stored token — render nothing route-specific yet
 *   authed    `user` is populated
 *   guest     nobody is signed in
 *
 * The distinction matters on a hard refresh: without `loading`, a protected
 * route would bounce you to /login for a moment before the stored token had
 * been checked, which reads as being logged out at random.
 */

const ROLE_RANK = { viewer: 0, dispatcher: 1, admin: 2 };

const useAuthStore = create((set, get) => ({
  status: 'loading',
  user: null,
  error: null,
  busy: false,

  /**
   * Runs once at startup. If a token is stored, it is verified against the
   * backend rather than trusted, so a deactivated or deleted account does not
   * get a usable-looking session.
   */
  bootstrap: async () => {
    if (!tokenStore.access && !tokenStore.refresh) {
      set({ status: 'guest', user: null });
      return;
    }
    try {
      const user = await api.auth.me();
      set({ status: 'authed', user, error: null });
    } catch (err) {
      // A backend that is down must not silently log someone out, so the stored
      // token is only discarded when the backend actually rejected it.
      if (err instanceof ApiError && err.status === 0) {
        set({ status: 'guest', user: null, error: err.message });
        return;
      }
      tokenStore.clear();
      set({ status: 'guest', user: null });
    }
  },

  login: async ({ email, password }) => {
    set({ busy: true, error: null });
    try {
      const session = await api.auth.login({ email, password });
      tokenStore.set(session);
      set({ status: 'authed', user: session.user, busy: false, error: null });
      return session.user;
    } catch (err) {
      set({ busy: false, error: err.message });
      throw err;
    }
  },

  register: async ({ name, email, password }) => {
    set({ busy: true, error: null });
    try {
      const session = await api.auth.register({ name, email, password });
      tokenStore.set(session);
      set({ status: 'authed', user: session.user, busy: false, error: null });
      return session.user;
    } catch (err) {
      set({ busy: false, error: err.message });
      throw err;
    }
  },

  logout: async () => {
    const refreshToken = tokenStore.refresh;
    // Local state is cleared first: signing out must feel instant and must
    // succeed even if the backend is unreachable.
    tokenStore.clear();
    set({ status: 'guest', user: null, error: null });
    if (refreshToken) {
      try {
        await api.auth.logout(refreshToken);
      } catch {
        /* the token expires on its own */
      }
    }
  },

  clearError: () => set({ error: null }),

  /** True when the signed-in user is at least `role`. */
  hasRole: (role) => {
    const user = get().user;
    if (!user) return false;
    return (ROLE_RANK[user.role] ?? -1) >= (ROLE_RANK[role] ?? 99);
  },

  canWrite: () => get().hasRole('dispatcher'),
  isAdmin: () => get().hasRole('admin'),
}));

// When a refresh fails for good, the client tells the store rather than the
// other way round, so nothing outside this file needs to know about tokens.
setSessionExpiredHandler(() => {
  useAuthStore.setState({ status: 'guest', user: null, error: 'Your session expired.' });
});

export default useAuthStore;
