import { Kysely } from 'kysely';
import { randomUUID } from 'crypto';
import type { Database, UsersTable } from '../main/database.types';

export interface UserInput {
  username: string;
  display_name?: string | null;
}

export interface User {
  user_id: string;
  username: string;
  display_name: string | null;
  created_date: string;
}

/**
 * Repository for managing users
 */
export class SQLiteUsersRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async create(input: UserInput): Promise<User> {
    const user_id = randomUUID();
    const created_date = new Date().toISOString();

    const user: UsersTable = {
      user_id,
      username: input.username,
      display_name: input.display_name || null,
      created_date,
    };

    await this.db.insertInto('users').values(user).execute();
    return this.findById(user_id);
  }

  async findById(user_id: string): Promise<User> {
    return await this.db
      .selectFrom('users')
      .selectAll()
      .where('user_id', '=', user_id)
      .executeTakeFirstOrThrow();
  }

  async findByUsername(username: string): Promise<User | null> {
    return (await this.db
      .selectFrom('users')
      .selectAll()
      .where('username', '=', username)
      .executeTakeFirst()) || null;
  }

  async findAll(): Promise<User[]> {
    return await this.db
      .selectFrom('users')
      .selectAll()
      .orderBy('username', 'asc')
      .execute();
  }

  async delete(user_id: string): Promise<void> {
    await this.db.deleteFrom('users').where('user_id', '=', user_id).execute();
  }
}
