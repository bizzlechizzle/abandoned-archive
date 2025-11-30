<script lang="ts">
  /**
   * Login.svelte - User authentication page
   * Migration 24: Multi-user PIN authentication
   *
   * Shows user selection and PIN entry for multi-user mode
   */
  import { onMount } from 'svelte';
  import logo from '../assets/abandoned-upstate-logo.png';

  interface User {
    user_id: string;
    username: string;
    display_name: string | null;
    has_pin: boolean;
  }

  interface Props {
    onLogin: (userId: string, username: string) => void;
  }

  let { onLogin }: Props = $props();

  let users = $state<User[]>([]);
  let selectedUserId = $state<string | null>(null);
  let pin = $state('');
  let error = $state('');
  let loading = $state(true);
  let verifying = $state(false);

  // Get selected user object
  const selectedUser = $derived(users.find(u => u.user_id === selectedUserId) || null);

  // PIN display (show dots for entered digits)
  const pinDisplay = $derived('●'.repeat(pin.length) + '○'.repeat(Math.max(0, 4 - pin.length)));

  async function loadUsers() {
    try {
      loading = true;
      users = await window.electronAPI.users.findAll();

      // Auto-select if only one user
      if (users.length === 1) {
        selectedUserId = users[0].user_id;
      }
    } catch (err) {
      console.error('Error loading users:', err);
      error = 'Failed to load users';
    } finally {
      loading = false;
    }
  }

  async function handleLogin() {
    if (!selectedUser) {
      error = 'Please select a user';
      return;
    }

    error = '';

    // If user has PIN, verify it
    if (selectedUser.has_pin) {
      if (pin.length < 4) {
        error = 'Please enter your PIN';
        return;
      }

      verifying = true;
      try {
        const result = await window.electronAPI.users.verifyPin(selectedUser.user_id, pin);
        if (result.success) {
          onLogin(selectedUser.user_id, selectedUser.username);
        } else {
          error = 'Incorrect PIN';
          pin = '';
        }
      } catch (err) {
        console.error('Error verifying PIN:', err);
        error = 'Failed to verify PIN';
      } finally {
        verifying = false;
      }
    } else {
      // No PIN required, just log in
      await window.electronAPI.users.updateLastLogin(selectedUser.user_id);
      onLogin(selectedUser.user_id, selectedUser.username);
    }
  }

  function handlePinInput(digit: string) {
    if (pin.length < 6) {
      pin += digit;
      error = '';
    }
  }

  function handleBackspace() {
    pin = pin.slice(0, -1);
  }

  function handleClear() {
    pin = '';
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key >= '0' && event.key <= '9') {
      handlePinInput(event.key);
    } else if (event.key === 'Backspace') {
      handleBackspace();
    } else if (event.key === 'Enter' && pin.length >= 4) {
      handleLogin();
    }
  }

  onMount(() => {
    loadUsers();
  });
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="h-full min-h-0 bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4 overflow-auto">
  <div class="max-w-md w-full">
    <!-- Logo and Title -->
    <div class="text-center mb-8">
      <img src={logo} alt="Abandoned Upstate" class="h-16 w-auto mx-auto mb-4" />
      <p class="text-gray-600">Sign In</p>
    </div>

    <!-- Main Card -->
    <div class="bg-white rounded-lg shadow-lg p-8">
      {#if loading}
        <div class="text-center py-8">
          <p class="text-gray-500">Loading...</p>
        </div>
      {:else if users.length === 0}
        <div class="text-center py-8">
          <p class="text-gray-500">No users found. Please run setup.</p>
        </div>
      {:else}
        <!-- User Selection -->
        <div class="mb-6">
          <label for="user-select" class="block text-sm font-medium text-gray-700 mb-2">
            Select User
          </label>
          <select
            id="user-select"
            bind:value={selectedUserId}
            class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent text-lg"
          >
            <option value={null}>Choose a user...</option>
            {#each users as user}
              <option value={user.user_id}>
                {user.display_name || user.username}
              </option>
            {/each}
          </select>
        </div>

        <!-- PIN Entry (only show if selected user has PIN) -->
        {#if selectedUser?.has_pin}
          <div class="mb-6">
            <label class="block text-sm font-medium text-gray-700 mb-2 text-center">
              Enter PIN
            </label>

            <!-- PIN Display -->
            <div class="text-center text-3xl tracking-widest mb-4 font-mono text-gray-700">
              {pinDisplay}
            </div>

            <!-- PIN Keypad -->
            <div class="grid grid-cols-3 gap-2 max-w-xs mx-auto">
              {#each ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as digit}
                <button
                  onclick={() => handlePinInput(digit)}
                  class="p-4 text-xl font-medium bg-gray-100 rounded-lg hover:bg-gray-200 transition"
                >
                  {digit}
                </button>
              {/each}
              <button
                onclick={handleClear}
                class="p-4 text-sm font-medium bg-gray-100 rounded-lg hover:bg-gray-200 transition text-gray-500"
              >
                Clear
              </button>
              <button
                onclick={() => handlePinInput('0')}
                class="p-4 text-xl font-medium bg-gray-100 rounded-lg hover:bg-gray-200 transition"
              >
                0
              </button>
              <button
                onclick={handleBackspace}
                class="p-4 text-xl font-medium bg-gray-100 rounded-lg hover:bg-gray-200 transition"
              >
                ←
              </button>
            </div>
          </div>
        {/if}

        <!-- Error Message -->
        {#if error}
          <div class="mb-4 text-center text-red-500 text-sm">
            {error}
          </div>
        {/if}

        <!-- Login Button -->
        <button
          onclick={handleLogin}
          disabled={!selectedUser || verifying || (selectedUser?.has_pin && pin.length < 4)}
          class="w-full py-3 bg-accent text-white rounded-lg hover:opacity-90 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {verifying ? 'Verifying...' : 'Sign In'}
        </button>
      {/if}
    </div>

  </div>
</div>
