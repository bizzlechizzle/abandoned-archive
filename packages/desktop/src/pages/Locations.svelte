<script lang="ts">
  let searchQuery = $state('');
  let filterState = $state('');
  let filterType = $state('');
</script>

<div class="p-8">
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-foreground mb-2">Locations</h1>
    <p class="text-gray-600">Browse and manage abandoned locations</p>
  </div>

  <div class="bg-white rounded-lg shadow p-6 mb-6">
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-2">Search</label>
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search by name..."
          class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 mb-2">State</label>
        <select
          bind:value={filterState}
          class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="">All States</option>
          <option value="NY">New York</option>
          <option value="PA">Pennsylvania</option>
        </select>
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 mb-2">Type</label>
        <select
          bind:value={filterType}
          class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="">All Types</option>
          <option value="Factory">Factory</option>
          <option value="Hospital">Hospital</option>
          <option value="School">School</option>
        </select>
      </div>
    </div>
  </div>

  <div class="bg-white rounded-lg shadow">
    <div class="p-6 text-center text-gray-400">
      <p class="text-lg">No locations found</p>
      <p class="text-sm mt-2">Add your first location from the Atlas page</p>
    </div>
  </div>
</div>
