import { writable } from 'svelte/store';

export interface Route {
  path: string;
  params?: Record<string, string>;
}

function createRouter() {
  const { subscribe, set } = writable<Route>({ path: '/dashboard' });

  function navigate(path: string, params?: Record<string, string>) {
    set({ path, params });
    window.location.hash = path;
  }

  function parseRoute(hash: string): Route {
    const path = hash || '/dashboard';

    const locationMatch = path.match(/^\/location\/([^/]+)$/);
    if (locationMatch) {
      return {
        path: '/location/:id',
        params: { id: locationMatch[1] }
      };
    }

    const projectMatch = path.match(/^\/project\/([^/]+)$/);
    if (projectMatch) {
      return {
        path: '/project/:id',
        params: { id: projectMatch[1] }
      };
    }

    return { path };
  }

  function init() {
    const hash = window.location.hash.slice(1);
    set(parseRoute(hash));

    window.addEventListener('hashchange', () => {
      const newHash = window.location.hash.slice(1);
      set(parseRoute(newHash));
    });
  }

  return {
    subscribe,
    navigate,
    init
  };
}

export const router = createRouter();
