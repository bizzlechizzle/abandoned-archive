<script lang="ts">
  import { onMount } from 'svelte';
  import { router } from './stores/router';
  import Layout from './components/Layout.svelte';
  import Dashboard from './pages/Dashboard.svelte';
  import Locations from './pages/Locations.svelte';
  import Atlas from './pages/Atlas.svelte';
  import Imports from './pages/Imports.svelte';
  import Settings from './pages/Settings.svelte';

  let currentRoute = $state({ path: '/dashboard', params: {} });

  onMount(() => {
    router.init();
  });

  $effect(() => {
    const unsubscribe = router.subscribe((route) => {
      currentRoute = route;
    });
    return () => unsubscribe();
  });

  function getComponent() {
    switch (currentRoute.path) {
      case '/dashboard':
        return Dashboard;
      case '/locations':
        return Locations;
      case '/atlas':
        return Atlas;
      case '/imports':
        return Imports;
      case '/settings':
        return Settings;
      default:
        return Dashboard;
    }
  }
</script>

<Layout>
  {#snippet children()}
    {#if currentRoute.path === '/dashboard'}
      <Dashboard />
    {:else if currentRoute.path === '/locations'}
      <Locations />
    {:else if currentRoute.path === '/atlas'}
      <Atlas />
    {:else if currentRoute.path === '/imports'}
      <Imports />
    {:else if currentRoute.path === '/settings'}
      <Settings />
    {:else}
      <Dashboard />
    {/if}
  {/snippet}
</Layout>
