<script lang="ts">
  let appVersion = $state('0.1.0');
  let ready = $state(false);

  $effect(() => {
    console.log('AU Archive Desktop App initialized');
    ready = true;
  });
</script>

<main class="h-screen w-screen bg-gray-100 flex items-center justify-center">
  <div class="text-center">
    <h1 class="text-4xl font-bold text-gray-800 mb-4">AU Archive</h1>
    <p class="text-xl text-gray-600 mb-2">Abandoned Locations Archive</p>
    <p class="text-sm text-gray-500">v{appVersion}</p>

    {#if ready}
      <div class="mt-8">
        <div class="inline-block px-4 py-2 bg-green-500 text-white rounded">
          Application Ready
        </div>
      </div>
    {/if}
  </div>
</main>

<style>
  main {
    overflow: hidden;
  }
</style>
