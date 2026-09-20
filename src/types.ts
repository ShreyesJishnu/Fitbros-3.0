export interface User {
  id: string;
  name: string;
  avatar?: string;
  /** The secret half of their link. Only ever sent to the admin. */
  secret?: string;
  startDate: string;
  /** What a missed week costs this player: 1 = ₹200, 2 = ₹400, doubling with no ceiling. */
  priceLevel: number;
  cleanWeeks: number;
  missedWeeks: number;
  /** Nothing takes a player out of the season any more. */
  isActive: boolean;
}

export interface Goal {
  id: string;
  userId: string;
  /** Free text now — players choose their own categories. */
  category: string;
  description: string;
  /** Where you started. */
  baseline?: string;
  /** What counts as completing it. */
  target?: string;
  /** Where you started and what counts as done, as numbers. */
  baselineValue?: number;
  targetValue?: number;
  unit?: string;
  isCompleted: boolean;
  completedDate?: string;
  proofs: Proof[];
  createdDate: string;
}

export interface Proof {
  id: string;
  goalId: string;
  userId: string;
  type: 'photo' | 'video' | 'screenshot';
  url: string;
  description?: string;
  timestamp: string;
  week: number;
}

/** A session is a workout; 10k steps is half of one. */
export type WorkoutKind = 'session' | 'steps';

export interface WorkoutDay {
  id: string;
  userId: string;
  week: number;
  dayOfWeek: number; // 1-7 (Monday-Sunday)
  date: string;
  isCompleted: boolean;
  /** What was logged. Absent on rows from before steps counted: read as a session. */
  kind?: WorkoutKind;
  workoutType?: string;
  notes?: string;
  markedBy: 'user' | 'admin';
  timestamp: string;
}

export interface AdminSettings {
  challengeStartDate: string;
  challengeEndDate: string;
  currentWeek: number;
  isActive: boolean;
}
