<script lang="ts">
  import Navigation from './Navigation.svelte';

  interface Props {
    children?: any;
  }

  let { children }: Props = $props();
</script>

<div class="flex h-screen overflow-hidden">
  <Navigation />

  <main class="flex-1 overflow-auto bg-background">
    {@render children?.()}
  </main>
</div>
