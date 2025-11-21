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

  function init() {
    const hash = window.location.hash.slice(1) || '/dashboard';
    set({ path: hash });

    window.addEventListener('hashchange', () => {
      const newHash = window.location.hash.slice(1) || '/dashboard';
      set({ path: newHash });
    });
  }

  return {
    subscribe,
    navigate,
    init
  };
}

export const router = createRouter();
