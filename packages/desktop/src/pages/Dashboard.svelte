<script lang="ts">
  import { router } from '../stores/router';
</script>

<div class="p-8">
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-foreground mb-2">Dashboard</h1>
    <p class="text-gray-600">Overview of your abandoned location archive</p>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    <div class="bg-white rounded-lg shadow p-6">
      <h3 class="text-lg font-semibold mb-2 text-foreground">Recent Locations</h3>
      <p class="text-gray-500 text-sm">Last 5 added locations</p>
      <div class="mt-4 text-center text-gray-400">
        No locations yet
      </div>
    </div>

    <div class="bg-white rounded-lg shadow p-6">
      <h3 class="text-lg font-semibold mb-2 text-foreground">Top States</h3>
      <p class="text-gray-500 text-sm">Locations by state</p>
      <div class="mt-4 text-center text-gray-400">
        No data yet
      </div>
    </div>

    <div class="bg-white rounded-lg shadow p-6">
      <h3 class="text-lg font-semibold mb-2 text-foreground">Top Types</h3>
      <p class="text-gray-500 text-sm">Locations by type</p>
      <div class="mt-4 text-center text-gray-400">
        No data yet
      </div>
    </div>
  </div>

  <div class="mt-8">
    <h2 class="text-xl font-semibold mb-4 text-foreground">Quick Actions</h2>
    <div class="flex gap-4">
      <button
        onclick={() => router.navigate('/atlas')}
        class="px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition"
      >
        Open Atlas
      </button>
      <button
        onclick={() => router.navigate('/locations')}
        class="px-4 py-2 bg-gray-200 text-foreground rounded hover:bg-gray-300 transition"
      >
        View All Locations
      </button>
      <button
        onclick={() => router.navigate('/imports')}
        class="px-4 py-2 bg-gray-200 text-foreground rounded hover:bg-gray-300 transition"
      >
        Import Media
      </button>
    </div>
  </div>
</div>
