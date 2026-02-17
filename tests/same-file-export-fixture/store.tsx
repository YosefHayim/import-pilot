export interface UserData {
  id: number;
  name: string;
}

// Helper function exported and used in same file
export function getUserById(id: number): UserData | undefined {
  const users: UserData[] = [];
  return users.find((u) => u.id === id);
}

// Helper function that uses another helper from same file
export function getCurrentUser(currentId: number): UserData | undefined {
  return getUserById(currentId);
}

// Const exported and used in same file
export const DEFAULT_USER_NAME = 'Guest';

export function createGuestUser(): UserData {
  return { id: 0, name: DEFAULT_USER_NAME };
}

// Type exported and used in same file
export type UserId = number;

export function createUserId(value: number): UserId {
  return value;
}
