import { writable } from 'svelte/store';

export interface Route {
  path: string;
  params?: Record<string, string>;
  query?: Record<string, string>;
}

function createRouter() {
  const { subscribe, set } = writable<Route>({ path: '/dashboard' });

  function navigate(path: string, params?: Record<string, string>, query?: Record<string, string>) {
    let hash = path;
    if (query && Object.keys(query).length > 0) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value) searchParams.set(key, value);
      }
      const queryString = searchParams.toString();
      if (queryString) hash += '?' + queryString;
    }
    set({ path, params, query });
    window.location.hash = hash;
  }

  function parseRoute(hash: string): Route {
    // Split path from query string
    const [pathPart, queryPart] = (hash || '/dashboard').split('?');
    const path = pathPart;

    // Parse query parameters
    const query: Record<string, string> = {};
    if (queryPart) {
      const searchParams = new URLSearchParams(queryPart);
      searchParams.forEach((value, key) => {
        query[key] = value;
      });
    }

    const locationMatch = path.match(/^\/location\/([^/]+)$/);
    if (locationMatch) {
      return {
        path: '/location/:id',
        params: { id: locationMatch[1] },
        query
      };
    }

    const projectMatch = path.match(/^\/project\/([^/]+)$/);
    if (projectMatch) {
      return {
        path: '/project/:id',
        params: { id: projectMatch[1] },
        query
      };
    }

    return { path, query };
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
