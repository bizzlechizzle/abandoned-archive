<script lang="ts">
  /**
   * Setup.svelte - First-run setup wizard
   * Migration 24: Added single/multi user mode and PIN setup
   */
  import { router } from '../stores/router';
  import logo from '../assets/abandoned-upstate-logo.png';

  let currentStep = $state(1);
  const totalSteps = 4;

  // Form state
  let appMode = $state<'single' | 'multi'>('single');
  let username = $state('');
  let displayName = $state('');
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
    if (appMode === 'multi' && pin.length > 0) {
      if (pin.length < 4) {
        pinError = 'PIN must be at least 4 digits';
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
    }
    return true;
  }

  function canProceed(): boolean {
    switch (currentStep) {
      case 1:
        return true; // Welcome screen, always can proceed
      case 2:
        return true; // Mode selection, always can proceed
      case 3:
        // Username required, PIN validation if multi-user
        if (username.trim().length === 0) return false;
        if (appMode === 'multi' && pin.length > 0) {
          return pin.length >= 4 && pin === confirmPin;
        }
        return true;
      case 4:
        return archivePath.trim().length > 0; // Archive path required
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
        display_name: displayName.trim() || null,
        pin: appMode === 'multi' && pin.length >= 4 ? pin : null,
      });

      // Save all settings
      await Promise.all([
        window.electronAPI.settings.set('app_mode', appMode),
        window.electronAPI.settings.set('current_user', username),
        window.electronAPI.settings.set('current_user_id', user.user_id),
        window.electronAPI.settings.set('archive_folder', archivePath),
        window.electronAPI.settings.set('delete_on_import', deleteOriginals.toString()),
        window.electronAPI.settings.set('setup_complete', 'true'),
      ]);

      // Navigate to dashboard
      router.navigate('/dashboard');
    } catch (error) {
      console.error('Error completing setup:', error);
      alert('Failed to complete setup. Please try again.');
    } finally {
      isProcessing = false;
    }
  }
</script>

<div class="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-8">
  <div class="max-w-2xl w-full">
    <!-- Logo and Title -->
    <div class="text-center mb-8">
      <img src={logo} alt="Abandoned Upstate" class="h-16 w-auto mx-auto mb-4" />
      <p class="text-gray-600">Archive Setup</p>
    </div>

    <!-- Progress Indicator -->
    <div class="mb-8">
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
    <div class="bg-white rounded-lg shadow-lg p-8">
      <!-- Step 1: Welcome -->
      {#if currentStep === 1}
        <div class="text-center">
          <h2 class="text-2xl font-bold text-foreground mb-4">Welcome to AU Archive</h2>
          <div class="space-y-4 text-left max-w-lg mx-auto">
            <p class="text-gray-700">
              AU Archive is a powerful tool for documenting and organizing abandoned locations.
            </p>
            <div class="bg-gray-50 rounded-lg p-4 space-y-2">
              <h3 class="font-semibold text-foreground">Key Features:</h3>
              <ul class="list-disc list-inside text-sm text-gray-600 space-y-1">
                <li>GPS-based location tracking with interactive maps</li>
                <li>Media import with automatic metadata extraction</li>
                <li>Organize photos, videos, and documents</li>
                <li>Local-first data storage for complete privacy</li>
                <li>Search and filter capabilities</li>
              </ul>
            </div>
            <p class="text-gray-700">
              Let's get started by setting up your archive. This will only take a moment.
            </p>
          </div>
        </div>
      {/if}

      <!-- Step 2: App Mode Selection -->
      {#if currentStep === 2}
        <div>
          <h2 class="text-2xl font-bold text-foreground mb-2">Choose Your Mode</h2>
          <p class="text-gray-600 mb-6">
            How will you be using AU Archive?
          </p>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Single User Option -->
            <button
              onclick={() => appMode = 'single'}
              class="p-6 rounded-lg border-2 text-left transition {appMode === 'single'
                ? 'border-accent bg-accent/5'
                : 'border-gray-200 hover:border-gray-300'}"
            >
              <div class="flex items-center gap-3 mb-3">
                <span class="text-2xl">👤</span>
                <h3 class="font-semibold text-lg text-foreground">Single User</h3>
              </div>
              <p class="text-sm text-gray-600">
                Just you using the archive. No login required, quick access to your data.
              </p>
              <ul class="mt-3 text-xs text-gray-500 space-y-1">
                <li>• No PIN required</li>
                <li>• Immediate access on launch</li>
                <li>• Perfect for personal use</li>
              </ul>
            </button>

            <!-- Multi User Option -->
            <button
              onclick={() => appMode = 'multi'}
              class="p-6 rounded-lg border-2 text-left transition {appMode === 'multi'
                ? 'border-accent bg-accent/5'
                : 'border-gray-200 hover:border-gray-300'}"
            >
              <div class="flex items-center gap-3 mb-3">
                <span class="text-2xl">👥</span>
                <h3 class="font-semibold text-lg text-foreground">Multi User</h3>
              </div>
              <p class="text-sm text-gray-600">
                Multiple people contributing. Track who documents what with optional PIN protection.
              </p>
              <ul class="mt-3 text-xs text-gray-500 space-y-1">
                <li>• Optional PIN for each user</li>
                <li>• Track contributions per person</li>
                <li>• Great for teams or shared NAS</li>
              </ul>
            </button>
          </div>
        </div>
      {/if}

      <!-- Step 3: User Information -->
      {#if currentStep === 3}
        <div>
          <h2 class="text-2xl font-bold text-foreground mb-2">User Information</h2>
          <p class="text-gray-600 mb-6">
            This information will be used to track who adds or modifies locations.
          </p>

          <div class="space-y-4">
            <div>
              <label for="username" class="block text-sm font-medium text-gray-700 mb-2">
                Your Name *
              </label>
              <input
                id="username"
                type="text"
                bind:value={username}
                placeholder="Enter your name or username"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent transition"
                autofocus
              />
              <p class="text-xs text-gray-500 mt-1">
                This will appear as the author on locations you create.
              </p>
            </div>

            <div>
              <label for="displayName" class="block text-sm font-medium text-gray-700 mb-2">
                Display Name (optional)
              </label>
              <input
                id="displayName"
                type="text"
                bind:value={displayName}
                placeholder="How you want your name shown"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent transition"
              />
              <p class="text-xs text-gray-500 mt-1">
                Leave blank to use your username.
              </p>
            </div>

            <!-- PIN Section (only for multi-user mode) -->
            {#if appMode === 'multi'}
              <div class="border-t pt-4 mt-4">
                <h3 class="font-semibold text-foreground mb-2">PIN Protection (Optional)</h3>
                <p class="text-sm text-gray-600 mb-4">
                  Set a 4-6 digit PIN to protect your account. Leave blank if you don't need PIN protection.
                </p>

                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label for="pin" class="block text-sm font-medium text-gray-700 mb-2">
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
                      class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent transition text-center tracking-widest"
                    />
                  </div>
                  <div>
                    <label for="confirmPin" class="block text-sm font-medium text-gray-700 mb-2">
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
                      class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent transition text-center tracking-widest"
                    />
                  </div>
                </div>

                {#if pinError}
                  <p class="text-red-500 text-sm mt-2">{pinError}</p>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Step 4: Archive Folder -->
      {#if currentStep === 4}
        <div>
          <h2 class="text-2xl font-bold text-foreground mb-2">Archive Location</h2>
          <p class="text-gray-600 mb-6">
            Choose where your media files will be stored. We recommend selecting a folder on a drive with plenty of space.
          </p>

          <div class="space-y-4">
            <div>
              <label for="archivePath" class="block text-sm font-medium text-gray-700 mb-2">
                Archive Folder *
              </label>
              <div class="flex gap-2">
                <input
                  id="archivePath"
                  type="text"
                  bind:value={archivePath}
                  placeholder="/path/to/archive"
                  readonly
                  class="flex-1 px-4 py-3 border border-gray-300 rounded-lg bg-gray-50 text-gray-700"
                />
                <button
                  onclick={selectFolder}
                  class="px-6 py-3 bg-accent text-white rounded-lg hover:opacity-90 transition font-medium"
                >
                  Browse
                </button>
              </div>
              <p class="text-xs text-gray-500 mt-1">
                Imported files will be organized in this folder. You can change this later in Settings.
              </p>
            </div>

            <div class="bg-gray-50 rounded-lg p-4">
              <h3 class="font-semibold text-foreground mb-2">Import Options</h3>
              <div class="flex items-start gap-3">
                <input
                  type="checkbox"
                  bind:checked={deleteOriginals}
                  id="deleteOriginals"
                  class="mt-1"
                />
                <div>
                  <label for="deleteOriginals" class="text-sm font-medium text-gray-700 cursor-pointer">
                    Delete original files after import
                  </label>
                  <p class="text-xs text-gray-500 mt-1">
                    Original files will be moved to the archive and deleted from the source. Leave unchecked to keep copies.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- Navigation Buttons -->
      <div class="mt-8 flex items-center justify-between">
        <div>
          {#if currentStep > 1}
            <button
              onclick={previousStep}
              class="px-6 py-2 text-gray-600 hover:text-gray-800 font-medium transition"
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
              class="px-8 py-3 bg-accent text-white rounded-lg hover:opacity-90 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          {:else}
            <button
              onclick={completeSetup}
              disabled={!canProceed() || isProcessing}
              class="px-8 py-3 bg-accent text-white rounded-lg hover:opacity-90 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? 'Setting up...' : 'Complete Setup'}
            </button>
          {/if}
        </div>
      </div>

      <!-- Step Indicator Text -->
      <div class="mt-6 text-center text-sm text-gray-500">
        Step {currentStep} of {totalSteps}
      </div>
    </div>

    <!-- Footer -->
    <div class="mt-6 text-center text-sm text-gray-500">
      <p>All data is stored locally on your computer.</p>
    </div>
  </div>
</div>
