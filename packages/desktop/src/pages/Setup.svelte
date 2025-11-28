<script lang="ts">
  /**
   * Setup.svelte - First-run setup wizard
   * Redesigned: 3 steps with PIN for all users
   */
  import { router } from '../stores/router';
  import logo from '../assets/abandoned-upstate-logo.png';

  let currentStep = $state(1);
  const totalSteps = 3;

  // Form state
  let appMode = $state<'single' | 'multi'>('single');
  let username = $state('');
  let nickname = $state('');
  let pin = $state('');
  let confirmPin = $state('');
  let archivePath = $state('');
  let deleteOriginals = $state(false);
  let isProcessing = $state(false);
  let pinError = $state('');

  // Additional users for multi-user mode
  let additionalUsers = $state<Array<{ name: string; nickname: string; pin: string }>>([]);
  let showAddUserModal = $state(false);
  let newUserName = $state('');
  let newUserNickname = $state('');
  let newUserPin = $state('');
  let newUserConfirmPin = $state('');
  let newUserPinError = $state('');

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
    // PIN is required for all users
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

  function validateNewUserPin(): boolean {
    newUserPinError = '';
    // PIN is required for all users
    if (newUserPin.length < 4) {
      newUserPinError = 'PIN must be at least 4 digits';
      return false;
    }
    if (newUserPin.length > 6) {
      newUserPinError = 'PIN must be 4-6 digits';
      return false;
    }
    if (!/^\d+$/.test(newUserPin)) {
      newUserPinError = 'PIN must contain only numbers';
      return false;
    }
    if (newUserPin !== newUserConfirmPin) {
      newUserPinError = 'PINs do not match';
      return false;
    }
    return true;
  }

  function openAddUserModal() {
    newUserName = '';
    newUserNickname = '';
    newUserPin = '';
    newUserConfirmPin = '';
    newUserPinError = '';
    showAddUserModal = true;
  }

  function closeAddUserModal() {
    showAddUserModal = false;
  }

  function addUser() {
    if (!newUserName.trim()) return;
    if (!validateNewUserPin()) return;

    additionalUsers = [...additionalUsers, {
      name: newUserName.trim(),
      nickname: newUserNickname.trim(),
      pin: newUserPin,
    }];
    closeAddUserModal();
  }

  function removeUser(index: number) {
    additionalUsers = additionalUsers.filter((_, i) => i !== index);
  }

  function canProceed(): boolean {
    switch (currentStep) {
      case 1:
        return true; // Welcome screen, always can proceed
      case 2:
        // Username and PIN required
        if (username.trim().length === 0) return false;
        // PIN is required: 4-6 digits and must match
        if (pin.length < 4 || pin.length > 6) return false;
        if (!/^\d+$/.test(pin)) return false;
        if (pin !== confirmPin) return false;
        return true;
      case 3:
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

      // Create primary user record in database (PIN is required)
      const user = await window.electronAPI.users.create({
        username: username.trim(),
        display_name: nickname.trim() || null,
        pin: pin,
      });

      // Create additional users for multi-user mode (all have required PINs)
      if (appMode === 'multi' && additionalUsers.length > 0) {
        for (const additionalUser of additionalUsers) {
          await window.electronAPI.users.create({
            username: additionalUser.name,
            display_name: additionalUser.nickname || null,
            pin: additionalUser.pin,
          });
        }
      }

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
          <h2 class="text-2xl font-bold text-foreground mb-4">Welcome to the Abandoned Archive!</h2>
          <div class="space-y-4 text-left max-w-lg mx-auto">
            <p class="text-gray-700">
              A powerful tool for documenting and organizing abandoned locations.
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

      <!-- Step 2: User Setup (Combined user info + mode selection) -->
      {#if currentStep === 2}
        <div>
          <h2 class="text-2xl font-bold text-foreground mb-2">User Setup</h2>
          <p class="text-gray-600 mb-6">
            Enter your information and choose how you'll use the archive.
          </p>

          <div class="space-y-4">
            <!-- Name Field -->
            <div>
              <label for="username" class="block text-sm font-medium text-gray-700 mb-2">
                Enter Your Name (first/last) *
              </label>
              <input
                id="username"
                type="text"
                bind:value={username}
                placeholder="John Smith"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent transition"
              />
              <p class="text-xs text-gray-500 mt-1">
                This name will be used for copyright attribution.
              </p>
            </div>

            <!-- Nickname Field -->
            <div>
              <label for="nickname" class="block text-sm font-medium text-gray-700 mb-2">
                Nickname (optional)
              </label>
              <input
                id="nickname"
                type="text"
                bind:value={nickname}
                placeholder="How you want your name displayed"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent transition"
              />
            </div>

            <!-- PIN Fields (Required) -->
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label for="pin" class="block text-sm font-medium text-gray-700 mb-2">
                  PIN *
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
                  Confirm PIN *
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

            <!-- Mode Selection -->
            <div class="border-t pt-4 mt-4">
              <h3 class="font-medium text-foreground mb-3">Archive Mode</h3>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- Single User Option -->
                <button
                  type="button"
                  onclick={() => appMode = 'single'}
                  class="p-4 rounded-lg border-2 text-left transition {appMode === 'single'
                    ? 'border-accent bg-accent/5'
                    : 'border-gray-200 hover:border-gray-300'}"
                >
                  <h4 class="font-semibold text-foreground">Single User</h4>
                  <p class="text-sm text-gray-600 mt-1">
                    Personal archive, quick access on launch.
                  </p>
                </button>

                <!-- Multi User Option -->
                <button
                  type="button"
                  onclick={() => appMode = 'multi'}
                  class="p-4 rounded-lg border-2 text-left transition {appMode === 'multi'
                    ? 'border-accent bg-accent/5'
                    : 'border-gray-200 hover:border-gray-300'}"
                >
                  <h4 class="font-semibold text-foreground">Multi User</h4>
                  <p class="text-sm text-gray-600 mt-1">
                    Multiple contributors, track who documents what.
                  </p>
                </button>
              </div>
            </div>

            <!-- Additional Users Section (Multi-user only) -->
            {#if appMode === 'multi'}
              <div class="border-t pt-4 mt-4">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="font-medium text-foreground">Additional Users</h3>
                  <button
                    type="button"
                    onclick={openAddUserModal}
                    class="px-3 py-1.5 bg-accent text-white rounded text-sm hover:opacity-90 transition"
                  >
                    + Add User
                  </button>
                </div>

                {#if additionalUsers.length === 0}
                  <p class="text-sm text-gray-500">
                    No additional users added. You can add more users now or later in Settings.
                  </p>
                {:else}
                  <div class="space-y-2">
                    {#each additionalUsers as user, index}
                      <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <span class="font-medium text-foreground">{user.name}</span>
                          {#if user.nickname}
                            <span class="text-gray-500 text-sm"> ({user.nickname})</span>
                          {/if}
                        </div>
                        <button
                          type="button"
                          onclick={() => removeUser(index)}
                          class="text-red-500 hover:text-red-700 text-sm"
                        >
                          Remove
                        </button>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Step 3: Archive Folder -->
      {#if currentStep === 3}
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
                  type="button"
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
              <h3 class="font-semibold text-foreground mb-2">Archive Options</h3>
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

  </div>
</div>

<!-- Add User Modal -->
{#if showAddUserModal}
  <div
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
    onclick={closeAddUserModal}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div
      class="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4"
      onclick={(e) => e.stopPropagation()}
      role="document"
    >
      <h3 class="text-lg font-bold text-foreground mb-4">Add User</h3>

      <div class="space-y-4">
        <div>
          <label for="newUserName" class="block text-sm font-medium text-gray-700 mb-2">
            Name (first/last) *
          </label>
          <input
            id="newUserName"
            type="text"
            bind:value={newUserName}
            placeholder="Jane Doe"
            class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent transition"
          />
        </div>

        <div>
          <label for="newUserNickname" class="block text-sm font-medium text-gray-700 mb-2">
            Nickname (optional)
          </label>
          <input
            id="newUserNickname"
            type="text"
            bind:value={newUserNickname}
            placeholder="Display name"
            class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent transition"
          />
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              PIN *
            </label>
            <input
              type="password"
              inputmode="numeric"
              pattern="[0-9]*"
              maxlength="6"
              bind:value={newUserPin}
              placeholder="4-6 digits"
              class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent transition text-center tracking-widest"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Confirm PIN *
            </label>
            <input
              type="password"
              inputmode="numeric"
              pattern="[0-9]*"
              maxlength="6"
              bind:value={newUserConfirmPin}
              placeholder="Confirm PIN"
              class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent transition text-center tracking-widest"
            />
          </div>
        </div>
        {#if newUserPinError}
          <p class="text-red-500 text-sm mt-2">{newUserPinError}</p>
        {/if}
      </div>

      <div class="flex justify-end gap-3 mt-6">
        <button
          type="button"
          onclick={closeAddUserModal}
          class="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium transition"
        >
          Cancel
        </button>
        <button
          type="button"
          onclick={addUser}
          disabled={!newUserName.trim() || newUserPin.length < 4 || newUserPin !== newUserConfirmPin}
          class="px-4 py-2 bg-accent text-white rounded-lg hover:opacity-90 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add User
        </button>
      </div>
    </div>
  </div>
{/if}
