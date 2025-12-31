/**
 * API-based Users Repository
 *
 * Bridges local user operations to dispatch hub authentication.
 * In the distributed architecture, users are managed centrally
 * through dispatch's authentication system.
 *
 * Note: This is a facade that maps local user concepts to dispatch auth.
 * Local PIN verification is replaced by dispatch JWT tokens.
 *
 * LIMITATION: The DispatchClient doesn't expose current user info.
 * User lookup operations return stub data when authenticated.
 */

import type { DispatchClient } from '@aa/services';

export interface UserInput {
  username: string;
  display_name?: string | null;
  pin?: string | null;
}

export interface User {
  user_id: string;
  username: string;
  display_name: string | null;
  created_date: string;
  has_pin: boolean;
  is_active: boolean;
  last_login: string | null;
}

// Cache for storing user info after login
let cachedUser: { id: string; username: string } | null = null;

/**
 * API-based users repository
 *
 * Maps to dispatch authentication instead of local SQLite users.
 * Local PIN-based auth is replaced by dispatch JWT authentication.
 */
export class ApiUsersRepository {
  constructor(private readonly client: DispatchClient) {}

  /**
   * Create a new user
   * Note: Users should be created via dispatch hub admin interface
   */
  async create(input: UserInput): Promise<User> {
    console.warn('ApiUsersRepository.create: Users should be created via dispatch hub');
    throw new Error('User creation not supported via desktop app - use dispatch hub admin');
  }

  /**
   * Find user by ID
   * Note: Returns cached user if authenticated, otherwise null
   */
  async findById(user_id: string): Promise<User | null> {
    if (this.client.isAuthenticated() && cachedUser && cachedUser.id === user_id) {
      return this.mapDispatchUser(cachedUser);
    }
    return null;
  }

  /**
   * Find user by username
   * Note: Returns cached user if authenticated and matching
   */
  async findByUsername(username: string): Promise<User | null> {
    if (this.client.isAuthenticated() && cachedUser && cachedUser.username === username) {
      return this.mapDispatchUser(cachedUser);
    }
    return null;
  }

  /**
   * Find all active users
   * Note: Only returns cached authenticated user
   */
  async findAll(): Promise<User[]> {
    if (this.client.isAuthenticated() && cachedUser) {
      return [this.mapDispatchUser(cachedUser)];
    }
    return [];
  }

  /**
   * Find all users including inactive
   * Note: Only returns current authenticated user
   */
  async findAllIncludingInactive(): Promise<User[]> {
    return this.findAll();
  }

  /**
   * Soft delete user
   * Note: User management via dispatch hub only
   */
  async delete(user_id: string): Promise<void> {
    console.warn('ApiUsersRepository.delete: User deletion via dispatch hub only');
    throw new Error('User deletion not supported via desktop app - use dispatch hub admin');
  }

  /**
   * Hard delete user
   * Note: User management via dispatch hub only
   */
  async hardDelete(user_id: string): Promise<void> {
    console.warn('ApiUsersRepository.hardDelete: User deletion via dispatch hub only');
    throw new Error('User deletion not supported via desktop app - use dispatch hub admin');
  }

  // ==================== Authentication Methods ====================

  /**
   * Verify user's credentials
   * Uses dispatch login instead of PIN verification
   */
  async verifyPin(user_id: string, pin: string): Promise<boolean> {
    // In dispatch architecture, use login instead
    // PIN is treated as password
    if (!this.client.isAuthenticated() || !cachedUser || cachedUser.id !== user_id) {
      return false;
    }

    // If already authenticated, consider verified
    return true;
  }

  /**
   * Login with username and password
   * This replaces the PIN-based local auth
   */
  async login(username: string, password: string): Promise<boolean> {
    try {
      await this.client.login(username, password);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Logout current user
   */
  async logout(): Promise<void> {
    await this.client.logout();
  }

  /**
   * Set or update user's password
   * Note: Password management via dispatch hub
   */
  async setPin(user_id: string, pin: string): Promise<void> {
    console.warn('ApiUsersRepository.setPin: Password change via dispatch hub');
    throw new Error('Password change not supported via desktop app');
  }

  /**
   * Clear user's PIN (not applicable in dispatch)
   */
  async clearPin(user_id: string): Promise<void> {
    console.warn('ApiUsersRepository.clearPin: Not applicable in dispatch architecture');
    throw new Error('Not applicable in dispatch architecture');
  }

  /**
   * Check if user has password set
   * Always true in dispatch (all users have passwords)
   */
  async hasPin(user_id: string): Promise<boolean> {
    return true; // All dispatch users have passwords
  }

  /**
   * Update last login timestamp
   * Handled automatically by dispatch auth
   */
  async updateLastLogin(user_id: string): Promise<void> {
    // No-op: dispatch handles this automatically
  }

  /**
   * Update user profile
   * Note: Profile updates via dispatch hub
   */
  async update(user_id: string, updates: { username?: string; display_name?: string | null }): Promise<User> {
    console.warn('ApiUsersRepository.update: Profile updates via dispatch hub');
    throw new Error('Profile updates not supported via desktop app');
  }

  /**
   * Check if any users require authentication
   * In dispatch, always true if hub is configured
   */
  async anyUserHasPin(): Promise<boolean> {
    return true; // Always require auth in dispatch mode
  }

  /**
   * Check if currently authenticated
   */
  isAuthenticated(): boolean {
    return this.client.isAuthenticated();
  }

  /**
   * Get current user
   */
  getCurrentUser(): User | null {
    if (this.client.isAuthenticated() && cachedUser) {
      return this.mapDispatchUser(cachedUser);
    }
    return null;
  }

  /**
   * Set cached user after login
   */
  setCachedUser(id: string, username: string): void {
    cachedUser = { id, username };
  }

  /**
   * Clear cached user on logout
   */
  clearCachedUser(): void {
    cachedUser = null;
  }

  /**
   * Map dispatch user to local User format
   */
  private mapDispatchUser(dispatchUser: { id: string; username: string; role?: string }): User {
    return {
      user_id: dispatchUser.id,
      username: dispatchUser.username,
      display_name: dispatchUser.username, // Use username as display name
      created_date: new Date().toISOString(), // Not available from dispatch
      has_pin: true, // All dispatch users have passwords
      is_active: true,
      last_login: new Date().toISOString(),
    };
  }
}
