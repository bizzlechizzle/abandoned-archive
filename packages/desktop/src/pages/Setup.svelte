<script lang="ts">
  /**
   * Setup.svelte - First-run setup wizard
   * Simplified: 2 steps - Welcome, then User + Archive setup
   */
  import logo from '../assets/abandoned-upstate-logo.png';

  interface Props {
    onComplete: (userId: string, username: string) => void;
  }

  let { onComplete }: Props = $props();

  let currentStep = $state(1);
  const totalSteps = 2;

  // Form state
  let username = $state('');
  let nickname = $state('');
  let pin = $state('');
  let confirmPin = $state('');
  let archivePath = $state('');
  let deleteOriginals = $state(false);
  let isProcessing = $state(false);
  let pinError = $state('');

  async function selectFolder() {
    try {
      const folder = await window.electronAPI.dialog.selectFolder();
      if (folder) {
        archivePath = folder;
      }
    } catch (error) {
      console.error('Error selecting folder:', error);
    }
  }

  function nextStep() {
    if (currentStep < totalSteps) {
      currentStep++;
    }
  }

  function previousStep() {
    if (currentStep > 1) {
      currentStep--;
    }
  }

  function validatePin(): boolean {
    pinError = '';
    if (pin.length < 4) {
      pinError = 'PIN must be at least 4 digits';
      return false;
    }
    if (pin.length > 6) {
      pinError = 'PIN must be 4-6 digits';
      return false;
    }
    if (!/^\d+$/.test(pin)) {
      pinError = 'PIN must contain only numbers';
      return false;
    }
    if (pin !== confirmPin) {
      pinError = 'PINs do not match';
      return false;
    }
    return true;
  }

  function canProceed(): boolean {
    switch (currentStep) {
      case 1:
        return true; // Welcome screen, always can proceed
      case 2:
        // Username, PIN, and archive path required
        if (username.trim().length === 0) return false;
        if (pin.length < 4 || pin.length > 6) return false;
        if (!/^\d+$/.test(pin)) return false;
        if (pin !== confirmPin) return false;
        if (archivePath.trim().length === 0) return false;
        return true;
      default:
        return false;
    }
  }

  async function completeSetup() {
    if (!canProceed()) return;
    if (!validatePin()) return;

    try {
      isProcessing = true;

      // Create user record in database
      const user = await window.electronAPI.users.create({
        username: username.trim(),
        display_name: nickname.trim() || null,
        pin: pin,
      });

      // Save all settings (single user mode)
      await Promise.all([
        window.electronAPI.settings.set('app_mode', 'single'),
        window.electronAPI.settings.set('current_user', username.trim()),
        window.electronAPI.settings.set('current_user_id', user.user_id),
        window.electronAPI.settings.set('archive_folder', archivePath),
        window.electronAPI.settings.set('delete_on_import', deleteOriginals.toString()),
        window.electronAPI.settings.set('setup_complete', 'true'),
      ]);

      // Notify parent that setup is complete
      onComplete(user.user_id, username.trim());
    } catch (error) {
      console.error('Error completing setup:', error);
      alert('Failed to complete setup. Please try again.');
    } finally {
      isProcessing = false;
    }
  }
</script>

<div class="h-full min-h-0 bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4 overflow-auto">
  <div class="max-w-xl w-full">
    <!-- Logo and Title -->
    <div class="text-center mb-6">
      <img src={logo} alt="Abandoned Upstate" class="h-14 w-auto mx-auto mb-3" />
      <p class="text-gray-600">Archive Setup</p>
    </div>

    <!-- Progress Indicator -->
    <div class="mb-6">
      <div class="flex items-center justify-center gap-2">
        {#each Array(totalSteps) as _, i}
          <div class="flex items-center">
            <div
              class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition {i + 1 <= currentStep
                ? 'bg-accent text-white'
                : 'bg-gray-200 text-gray-500'}"
            >
              {i + 1}
            </div>
            {#if i < totalSteps - 1}
              <div
                class="w-12 h-0.5 mx-1 transition {i + 1 < currentStep
                  ? 'bg-accent'
                  : 'bg-gray-200'}"
              ></div>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <!-- Main Card -->
    <div class="bg-white rounded-lg shadow-lg p-6">
      <!-- Step 1: Welcome -->
      {#if currentStep === 1}
        <div class="text-center">
          <h2 class="text-xl font-bold text-foreground mb-4">Welcome to the Abandoned Archive!</h2>
          <div class="space-y-3 text-left max-w-md mx-auto">
            <p class="text-gray-700 text-sm">
              A powerful tool for documenting and organizing abandoned locations.
            </p>
            <div class="bg-gray-50 rounded-lg p-3 space-y-2">
              <h3 class="font-semibold text-foreground text-sm">Key Features:</h3>
              <ul class="list-disc list-inside text-xs text-gray-600 space-y-1">
                <li>GPS-based location tracking with interactive maps</li>
                <li>Media import with automatic metadata extraction</li>
                <li>Organize photos, videos, and documents</li>
                <li>Local-first data storage for complete privacy</li>
              </ul>
            </div>
            <p class="text-gray-700 text-sm">
              Let's get started by setting up your archive.
            </p>
          </div>
        </div>
      {/if}

      <!-- Step 2: User Setup + Archive Location -->
      {#if currentStep === 2}
        <div>
          <h2 class="text-xl font-bold text-foreground mb-4">Setup</h2>

          <div class="space-y-4">
            <!-- Name Field -->
            <div>
              <label for="username" class="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              <input
                id="username"
                type="text"
                bind:value={username}
                placeholder="First Last"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent transition text-sm"
              />
            </div>

            <!-- Nickname Field -->
            <div>
              <label for="nickname" class="block text-sm font-medium text-gray-700 mb-1">
                Nickname
              </label>
              <input
                id="nickname"
                type="text"
                bind:value={nickname}
                placeholder="Optional"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent transition text-sm"
              />
            </div>

            <!-- PIN Fields -->
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label for="pin" class="block text-sm font-medium text-gray-700 mb-1">
                  PIN
                </label>
                <input
                  id="pin"
                  type="password"
                  inputmode="numeric"
                  pattern="[0-9]*"
                  maxlength="6"
                  bind:value={pin}
                  placeholder="4-6 digits"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent transition text-center tracking-widest text-sm"
                />
              </div>
              <div>
                <label for="confirmPin" class="block text-sm font-medium text-gray-700 mb-1">
                  Confirm PIN
                </label>
                <input
                  id="confirmPin"
                  type="password"
                  inputmode="numeric"
                  pattern="[0-9]*"
                  maxlength="6"
                  bind:value={confirmPin}
                  placeholder="Re-enter PIN"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent transition text-center tracking-widest text-sm"
                />
              </div>
            </div>
            {#if pinError}
              <p class="text-red-500 text-xs">{pinError}</p>
            {/if}

            <!-- Archive Location Section -->
            <div class="border-t pt-4 mt-4">
              <h3 class="font-medium text-foreground mb-3 text-sm">Archive Location</h3>
              <div>
                <label for="archivePath" class="block text-sm font-medium text-gray-700 mb-1">
                  Folder
                </label>
                <div class="flex gap-2">
                  <input
                    id="archivePath"
                    type="text"
                    bind:value={archivePath}
                    placeholder="Select a folder..."
                    readonly
                    class="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700 text-sm"
                  />
                  <button
                    type="button"
                    onclick={selectFolder}
                    class="px-4 py-2 bg-accent text-white rounded-lg hover:opacity-90 transition font-medium text-sm"
                  >
                    Browse
                  </button>
                </div>
                <p class="text-xs text-gray-500 mt-1">
                  Where your media files will be stored.
                </p>
              </div>

              <div class="mt-3 flex items-start gap-2">
                <input
                  type="checkbox"
                  bind:checked={deleteOriginals}
                  id="deleteOriginals"
                  class="mt-0.5"
                />
                <label for="deleteOriginals" class="text-xs text-gray-700 cursor-pointer">
                  Delete original files after import
                </label>
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- Navigation Buttons -->
      <div class="mt-6 flex items-center justify-between">
        <div>
          {#if currentStep > 1}
            <button
              onclick={previousStep}
              class="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium transition text-sm"
            >
              Back
            </button>
          {/if}
        </div>

        <div class="flex gap-3">
          {#if currentStep < totalSteps}
            <button
              onclick={nextStep}
              disabled={!canProceed()}
              class="px-6 py-2 bg-accent text-white rounded-lg hover:opacity-90 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              Continue
            </button>
          {:else}
            <button
              onclick={completeSetup}
              disabled={!canProceed() || isProcessing}
              class="px-6 py-2 bg-accent text-white rounded-lg hover:opacity-90 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {isProcessing ? 'Setting up...' : 'Complete Setup'}
            </button>
          {/if}
        </div>
      </div>

      <!-- Step Indicator Text -->
      <div class="mt-4 text-center text-xs text-gray-500">
        Step {currentStep} of {totalSteps}
      </div>
    </div>

  </div>
</div>
