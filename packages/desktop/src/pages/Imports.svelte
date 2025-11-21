<script lang="ts">
  let selectedLocation = $state('');
  let isDragging = $state(false);

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    isDragging = true;
  }

  function handleDragLeave() {
    isDragging = false;
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragging = false;
    console.log('Files dropped:', event.dataTransfer?.files);
  }
</script>

<div class="p-8">
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-foreground mb-2">Imports</h1>
    <p class="text-gray-600">Import media files for your locations</p>
  </div>

  <div class="max-w-3xl">
    <div class="bg-white rounded-lg shadow p-6 mb-6">
      <label class="block text-sm font-medium text-gray-700 mb-2">
        Select Location
      </label>
      <select
        bind:value={selectedLocation}
        class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
      >
        <option value="">Choose a location...</option>
      </select>
      <p class="text-xs text-gray-500 mt-2">
        Create locations from the Atlas page first
      </p>
    </div>

    <div
      class="border-2 border-dashed rounded-lg p-12 text-center transition {isDragging ? 'border-accent bg-accent bg-opacity-10' : 'border-gray-300'}"
      ondragover={handleDragOver}
      ondragleave={handleDragLeave}
      ondrop={handleDrop}
    >
      <div class="text-gray-400">
        <svg class="mx-auto h-12 w-12 mb-4" stroke="currentColor" fill="none" viewBox="0 0 48 48">
          <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <p class="text-lg mb-2">Drag and drop files here</p>
        <p class="text-sm">or click to browse</p>
        <p class="text-xs mt-4">Supported: Images, Videos, Documents, Maps</p>
      </div>
    </div>

    <div class="mt-8">
      <h2 class="text-lg font-semibold mb-4 text-foreground">Recent Imports</h2>
      <div class="bg-white rounded-lg shadow p-6 text-center text-gray-400">
        No recent imports
      </div>
    </div>
  </div>
</div>
