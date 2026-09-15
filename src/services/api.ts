import { adminKey, currentPlayerId } from './http';
import { User, Goal, WorkoutDay } from '../types';

// In production the API is served from the same origin as the app, so a
// relative path is right. In development it is the local server on 5050.
const API_BASE_URL = process.env.NODE_ENV === 'production'
  ? '/api'
  : (process.env.REACT_APP_API_URL || 'http://localhost:5050/api');
const REQUEST_TIMEOUT = 30000; // 30 seconds

interface PendingRequest<T> {
  promise: Promise<T>;
  timestamp: number;
}

class ApiService {
  /**
   * In-flight GETs, so the same read fired twice at once costs one round trip.
   *
   * This is a coalescer, not a cache — an entry lives only until the request
   * settles, so a read that starts after a write always sees the write. The
   * 5-second response cache that used to sit here did not: a POST cleared only
   * the keys matching its own resource, and App's follow-up /users read came
   * back from a still-warm entry with the pre-write body.
   */
  private pendingRequests: Map<string, PendingRequest<unknown>> = new Map();

  /**
   * Fetch with timeout support
   */
  private fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        reject(new Error(`Request timeout after ${REQUEST_TIMEOUT}ms`));
      }, REQUEST_TIMEOUT);

      fetch(url, {
        ...options,
        signal: controller.signal,
      })
        .then(response => {
          clearTimeout(timeoutId);
          resolve(response);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  private async fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    const method = options?.method || 'GET';
    const cacheKey = `${method}:${url}`;

    if (method === 'GET') {
      const pending = this.pendingRequests.get(cacheKey);
      if (pending && Date.now() - pending.timestamp < REQUEST_TIMEOUT) {
        return pending.promise as Promise<T>;
      }
    }

    const requestPromise = (async (): Promise<T> => {
      try {
        const response = await this.fetchWithTimeout(url, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            // Every write states which player is making it; the server holds us to it.
            ...(currentPlayerId() ? { 'x-player-id': currentPlayerId() as string } : {}),
            // Admin routes (players, the season clock) want the shared key too.
            ...(adminKey() ? { 'x-admin-key': adminKey() as string } : {}),
            ...options?.headers,
          },
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
      } finally {
        this.pendingRequests.delete(cacheKey);
      }
    })();

    if (method === 'GET') {
      this.pendingRequests.set(cacheKey, { promise: requestPromise, timestamp: Date.now() });
    }

    return requestPromise;
  }

  // ==================== USER METHODS ====================

  async getUsers(): Promise<User[]> {
    return this.fetchApi<User[]>('/users');
  }

  async createUser(userData: Partial<User>): Promise<User> {
    return this.fetchApi<User>('/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  /**
   * Only what a person actually owns.
   *
   * Callers pass a whole User because that is what they hold, but standing,
   * price level and the week counts are replayed from the workout sheet — the
   * server derives them and refuses them from a player. Sending them back was
   * how the Me tab's own rename tripped that guard with a 403.
   */
  async updateUser(id: string, userData: Partial<User>): Promise<User> {
    const { name, avatar } = userData;
    return this.fetchApi<User>(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name, avatar }),
    });
  }

  async deleteUser(id: string): Promise<void> {
    await this.fetchApi<void>(`/users/${id}`, {
      method: 'DELETE',
    });
  }

  // ==================== WORKOUT METHODS ====================

  async getAllWorkouts(): Promise<WorkoutDay[]> {
    return this.fetchApi<WorkoutDay[]>('/workouts');
  }

  async saveWorkout(workoutData: Partial<WorkoutDay>): Promise<WorkoutDay> {
    return this.fetchApi<WorkoutDay>('/workouts', {
      method: 'POST',
      body: JSON.stringify(workoutData),
    });
  }

  // ==================== GOALS METHODS ====================

  async getAllGoals(): Promise<Goal[]> {
    return this.fetchApi<Goal[]>('/goals');
  }

  async createGoal(goalData: Partial<Goal>): Promise<Goal> {
    return this.fetchApi<Goal>('/goals', {
      method: 'POST',
      body: JSON.stringify(goalData),
    });
  }

  async updateGoal(id: string, goalData: Partial<Goal>): Promise<Goal> {
    return this.fetchApi<Goal>(`/goals/${id}`, {
      method: 'PUT',
      body: JSON.stringify(goalData),
    });
  }

  async deleteGoal(id: string): Promise<void> {
    await this.fetchApi<void>(`/goals/${id}`, {
      method: 'DELETE',
    });
  }
}

// Export singleton instance
export const apiService = new ApiService();
export default apiService;
