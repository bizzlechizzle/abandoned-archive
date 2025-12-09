<script lang="ts">
  /**
   * Setup.svelte - First-run setup wizard
   * ADR-047: 3 pages with educational rules
   */

  interface Props {
    onComplete: (userId: string, username: string) => void;
  }

  let { onComplete }: Props = $props();

  let currentStep = $state(1);
  const totalSteps = 3;

  // Form state
  let username = $state('');
  let pin = $state('');
  let confirmPin = $state('');
  let archivePath = $state('');
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
        // Name required
        if (username.trim().length === 0) return false;
        return true;
      case 2:
        // Archive path required
        if (archivePath.trim().length === 0) return false;
        return true;
      case 3:
        // PIN required
        if (pin.length < 4 || pin.length > 6) return false;
        if (!/^\d+$/.test(pin)) return false;
        if (pin !== confirmPin) return false;
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
        display_name: null,
        pin: pin,
      });

      // Save all settings (single user mode)
      await Promise.all([
        window.electronAPI.settings.set('app_mode', 'single'),
        window.electronAPI.settings.set('current_user', username.trim()),
        window.electronAPI.settings.set('current_user_id', user.user_id),
        window.electronAPI.settings.set('archive_folder', archivePath),
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

<div class="min-h-screen bg-braun-50 flex flex-col items-center justify-center p-8">
  <!-- Text Logo - above card -->
  <div class="text-center mb-8">
    <span class="text-4xl font-bold tracking-tight text-braun-900">ABANDONED ARCHIVE</span>
  </div>

  <!-- Main Card - centered -->
  <div class="w-full max-w-md">
    <div class="bg-white rounded border border-braun-300 p-6">
      <!-- Step 1: Your Name -->
      {#if currentStep === 1}
        <div class="space-y-4">
          <div>
            <label for="username" class="block text-sm font-medium text-braun-700 mb-1">
              Name
            </label>
            <input
              id="username"
              type="text"
              bind:value={username}
              placeholder="First Name - Last Name"
              class="w-full px-3 py-2 border border-braun-300 rounded focus:outline-none focus:border-braun-600 transition text-sm"
            />
          </div>

          <!-- Rule #1: Preserve History -->
          <div class="bg-braun-100 border border-braun-300 rounded p-3 mt-4">
            <div class="text-xs font-semibold uppercase tracking-wider text-braun-500">
              Preserve History
            </div>
          </div>
        </div>
      {/if}

      <!-- Step 2: Archive Location -->
      {#if currentStep === 2}
        <div>
          <h2 class="text-2xl font-semibold text-braun-900 mb-4">Archive Location</h2>

          <div class="space-y-4">
            <div>
              <label for="archivePath" class="block text-sm font-medium text-braun-700 mb-1">
                Folder
              </label>
              <div class="flex gap-2">
                <input
                  id="archivePath"
                  type="text"
                  bind:value={archivePath}
                  placeholder="Select a folder..."
                  readonly
                  class="flex-1 px-3 py-2 border border-braun-300 rounded bg-braun-50 text-braun-700 text-sm"
                />
                <button
                  type="button"
                  onclick={selectFolder}
                  class="px-4 py-2 bg-braun-900 text-white rounded hover:bg-braun-600 transition font-medium text-sm"
                >
                  Browse
                </button>
              </div>
            </div>

            <!-- Rule #2: Document Decay -->
            <div class="bg-braun-100 border border-braun-300 rounded p-3 mt-6">
              <div class="text-xs font-semibold uppercase tracking-wider text-braun-500">
                Document Decay
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- Step 3: Security PIN -->
      {#if currentStep === 3}
        <div>
          <h2 class="text-2xl font-semibold text-braun-900 mb-4">Security PIN</h2>

          <div class="space-y-4">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label for="pin" class="block text-sm font-medium text-braun-700 mb-1">
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
                  class="w-full px-3 py-2 border border-braun-300 rounded focus:outline-none focus:border-braun-600 transition text-center tracking-widest text-sm"
                />
              </div>
              <div>
                <label for="confirmPin" class="block text-sm font-medium text-braun-700 mb-1">
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
                  class="w-full px-3 py-2 border border-braun-300 rounded focus:outline-none focus:border-braun-600 transition text-center tracking-widest text-sm"
                />
              </div>
            </div>
            {#if pinError}
              <p class="text-red-500 text-xs">{pinError}</p>
            {/if}

            <!-- Rule #3: Authentic Information -->
            <div class="bg-braun-100 border border-braun-300 rounded p-3 mt-6">
              <div class="text-xs font-semibold uppercase tracking-wider text-braun-500">
                Authentic Information
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
              class="px-4 py-2 text-braun-600 hover:text-braun-800 font-medium transition text-sm"
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
              class="px-6 py-2 bg-braun-900 text-white rounded hover:bg-braun-600 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              Continue
            </button>
          {:else}
            <button
              onclick={completeSetup}
              disabled={!canProceed() || isProcessing}
              class="px-6 py-2 bg-braun-900 text-white rounded hover:bg-braun-600 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {isProcessing ? 'Setting up...' : 'Complete Setup'}
            </button>
          {/if}
        </div>
      </div>

    </div>
  </div>
</div>
