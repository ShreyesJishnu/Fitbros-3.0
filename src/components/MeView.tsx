import React from "react";
import { User, WorkoutDay } from "../types";
import MySeason from "./MySeason";
import WhoYouAre from "./WhoYouAre";

/**
 * The dashboard: log today, see the squad, then see yourself. Goals were here
 * and are gone — the group stopped using them.
 */

interface MeViewProps {
  currentUser: User | null;
  workoutDays: WorkoutDay[];
  workoutsFresh: boolean;
  onUpdateWorkoutDay: (day: WorkoutDay) => Promise<boolean>;
  onUpdateUser: (user: User) => void | Promise<void>;
}

const MeView: React.FC<MeViewProps> = ({ currentUser, workoutDays, workoutsFresh, onUpdateWorkoutDay, onUpdateUser }) => (
  <div>
    <WhoYouAre currentUser={currentUser} onUpdateUser={onUpdateUser} />

    <MySeason
      currentUser={currentUser}
      workoutDays={workoutDays}
      workoutsFresh={workoutsFresh}
      onUpdateWorkoutDay={onUpdateWorkoutDay}
    />
  </div>
);

export default MeView;
