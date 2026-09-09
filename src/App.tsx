import React, { useState, useEffect, useCallback, useRef, Suspense, lazy } from "react";
import { User, Goal, WorkoutDay, AdminSettings } from "./types";
import Header from "./components/Header";
import ErrorBoundary from "./components/ErrorBoundary";
import OfflineBanner from "./components/OfflineBanner";
import { ToastProvider, useToast } from "./components/ToastContext";
import Toast from "./components/Toast";
import { apiService } from "./services/api";
import { apiFetch, currentPlayerId, isAdmin, setCurrentPlayerId } from "./services/http";

// All four view components are code-split so only the chunk for the active
// view is downloaded on initial load.
const GroupBoard = lazy(() => import("./components/GroupBoard"));
const Rules = lazy(() => import("./components/Rules"));
const MeView = lazy(() => import("./components/MeView"));


const Admin = lazy(() => import("./components/Admin"));

type ActiveView = "me" | "group" | "rules" | "admin";

const SNAPSHOT_KEY = "fitbois:snapshot";
const SNAPSHOT_VERSION = 1;
const RETRY_BACKOFF_MS = [5000, 10000, 20000, 30000];

interface Snapshot {
  version: number;
  savedAt: number;
  users: User[];
  workoutDays: WorkoutDay[];
  goals: Goal[];
}

const readSnapshot = (): Snapshot | null => {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Snapshot;
    if (parsed.version !== SNAPSHOT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeSnapshot = (snap: Omit<Snapshot, "version" | "savedAt">): void => {
  try {
    const payload: Snapshot = {
      version: SNAPSHOT_VERSION,
      savedAt: Date.now(),
      ...snap,
    };
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(payload));
  } catch {
    // Quota exceeded or localStorage disabled — non-fatal.
  }
};


const HYDRATING_BANNER_DELAY_MS = 1500;

function AppContent() {
  const { showToast } = useToast();

  // Read the snapshot synchronously once so we can seed state from it on the
  // very first render. This is what makes warm visits feel instant.
  const initialSnapshot = useRef<Snapshot | null>(readSnapshot()).current;

  const [users, setUsers] = useState<User[]>(initialSnapshot?.users ?? []);
  const [goals, setGoals] = useState<Goal[]>(initialSnapshot?.goals ?? []);
  const [workoutDays, setWorkoutDays] = useState<WorkoutDay[]>(
    initialSnapshot?.workoutDays ?? []
  );
  const [adminSettings, setAdminSettings] = useState<AdminSettings>({
    challengeStartDate: "2026-01-19",
    challengeEndDate: "2026-07-31",
    currentWeek: 1,
    isActive: true,
  });
  const admin = isAdmin();
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const remembered = currentPlayerId();
    const seeded = initialSnapshot?.users ?? [];
    const mine = seeded.find((u) => u.id === remembered) ?? null;
    // Falling back to the first player is how a stranger used to arrive as
    // somebody. Only the admin, who can switch on purpose, gets a default.
    return mine ?? (isAdmin() ? seeded[0] ?? null : null);
  });
  const [activeView, setActiveView] = useState<ActiveView>(
    () => {
      // A view name saved by an older build must not leave the page blank.
      const saved = localStorage.getItem("activeView");
      if (saved === "admin" && !isAdmin()) return "me";
      return saved === "me" || saved === "group" || saved === "rules" || saved === "admin"
        ? saved
        : "me";
    }
  );
  const [isOffline, setIsOffline] = useState(false);
  const [snapshotSavedAt, setSnapshotSavedAt] = useState<number | null>(
    initialSnapshot?.savedAt ?? null
  );
  const [isRetrying, setIsRetrying] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  /** A load has finished at least once — so an empty season is empty, not pending. */
  const [hasLoaded, setHasLoaded] = useState(false);

  // True while we're showing snapshot data but the background refresh has not
  // yet completed. Drives mutation-blocking and the "Refreshing…" banner.
  const [isHydrating, setIsHydrating] = useState<boolean>(
    initialSnapshot !== null
  );
  // Delayed flag so we don't flash the refresh banner on fast networks.
  const [showHydratingBanner, setShowHydratingBanner] = useState(false);

  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttemptRef = useRef(0);

  useEffect(() => {
    localStorage.setItem("activeView", activeView);
  }, [activeView]);

  // Nothing to look at until somebody joins, so land the admin where the work
  // is — once. After that they navigate freely, including to the rules.
  useEffect(() => {
    if (!admin || landedRef.current) return;
    if (hasLoaded && users.length === 0) {
      landedRef.current = true;
      setActiveView("admin");
    }
  }, [admin, hasLoaded, users.length]);

  // One clock for the whole app: the week the server is scoring against.
  useEffect(() => {
    apiFetch(`/settings`)
      .then((res: Response) => (res.ok ? res.json() : null))
      .then((settings: { currentWeek?: number } | null) => {
        if (settings?.currentWeek) {
          setAdminSettings((prev) => ({ ...prev, ...settings }));
        }
      })
      .catch(() => {});
  }, []);

  const recalcTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Sends the admin to Admin once on an empty season, never again. */
  const landedRef = useRef(false);

  /**
   * Derived state (price level, fines) is computed by the server from
   * the workout sheet, so the client only re-reads it. Kept as a hook because the
   * screens still call it after a change lands.
   */
  const recalculateUserConsistency = useCallback(() => {
    if (recalcTimerRef.current) clearTimeout(recalcTimerRef.current);
    recalcTimerRef.current = setTimeout(() => {
      if (isOffline) return;
      apiService
        .getUsers()
        .then((freshUsers) => setUsers(freshUsers))
        .catch((error) => console.error("Error refreshing users:", error));
    }, 300);
  }, [isOffline]);

  const clearRetryTimer = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  const loadData = useCallback(async (): Promise<boolean> => {
    try {
      // Fire all three reads in parallel. A rejection on any required call
      // surfaces as "API unreachable" via the catch below — no separate
      // /api/health round-trip needed.
      const [dbUsers, dbWorkouts, dbGoals] = await Promise.all([
        apiService.getUsers(),
        apiService.getAllWorkouts(),
        apiService.getAllGoals(),
      ]);

      setUsers(dbUsers);
      setWorkoutDays(dbWorkouts);
      setGoals(dbGoals);
      setCurrentUser((prev) => {
        const remembered = prev?.id ?? currentPlayerId();
        const mine = dbUsers.find((u) => u.id === remembered) ?? null;
        return mine ?? (isAdmin() ? dbUsers[0] ?? null : null);
      });

      writeSnapshot({
        users: dbUsers,
        workoutDays: dbWorkouts,
        goals: dbGoals,
      });
      setSnapshotSavedAt(Date.now());
      setIsOffline(false);
      setLoadFailed(false);
      setHasLoaded(true);
      retryAttemptRef.current = 0;

      return true;
    } catch (error) {
      console.error("Error loading data from database:", error);
      return false;
    }
  }, []);

  const scheduleRetry = useCallback(() => {
    clearRetryTimer();
    const delay =
      RETRY_BACKOFF_MS[Math.min(retryAttemptRef.current, RETRY_BACKOFF_MS.length - 1)];
    retryAttemptRef.current += 1;
    retryTimeoutRef.current = setTimeout(async () => {
      const ok = await loadData();
      if (!ok) scheduleRetry();
    }, delay);
  }, [loadData, clearRetryTimer]);

  const manualRetry = useCallback(async () => {
    if (isRetrying) return;
    setIsRetrying(true);
    clearRetryTimer();
    const ok = await loadData();
    setIsRetrying(false);
    if (!ok) {
      retryAttemptRef.current = 0;
      scheduleRetry();
    }
  }, [isRetrying, clearRetryTimer, loadData, scheduleRetry]);

  useEffect(() => {
    let cancelled = false;

    // If we seeded from a snapshot, only show the "Refreshing…" banner if the
    // background refresh is still in flight after a short grace period. This
    // keeps fast networks visually silent.
    let bannerTimer: ReturnType<typeof setTimeout> | null = null;
    if (initialSnapshot) {
      bannerTimer = setTimeout(() => {
        if (!cancelled) setShowHydratingBanner(true);
      }, HYDRATING_BANNER_DELAY_MS);
    }

    (async () => {
      const ok = await loadData();
      if (cancelled) return;

      if (bannerTimer) clearTimeout(bannerTimer);
      setShowHydratingBanner(false);
      setIsHydrating(false);

      if (ok) {
        // Fresh data is in place; snapshot has been rewritten inside loadData.
        return;
      }

      // API failed. If we already seeded state from a snapshot during render,
      // just flip into offline mode and start the retry backoff. Otherwise
      // we have nothing to show — surface the hard-failure screen.
      if (initialSnapshot) {
        setIsOffline(true);
        scheduleRetry();
      } else {
        setLoadFailed(true);
        scheduleRetry();
      }
    })();

    return () => {
      cancelled = true;
      if (bannerTimer) clearTimeout(bannerTimer);
      clearRetryTimer();
    };
  }, [loadData, scheduleRetry, clearRetryTimer, initialSnapshot]);

  const blockIfOffline = (): boolean => {
    if (isOffline) {
      showToast("Offline — changes can't be saved yet.", "error");
      return true;
    }
    // While the background refresh is still running we may be looking at
    // stale snapshot data; writing against it could clobber the server copy.
    if (isHydrating) {
      showToast("Loading latest — try again in a moment.", "error");
      return true;
    }
    return false;
  };

  const updateUser = async (updatedUser: User) => {
    if (blockIfOffline()) return;
    const existingUserIndex = users.findIndex((u) => u.id === updatedUser.id);

    try {
      let savedUser: User;

      if (existingUserIndex >= 0) {
        savedUser = await apiService.updateUser(updatedUser.id, updatedUser);
      } else {
        const { id, ...userDataWithoutId } = updatedUser;
        savedUser = await apiService.createUser(userDataWithoutId);
      }

      setUsers((prevUsers) => {
        if (existingUserIndex >= 0) {
          const newUsers = [...prevUsers];
          newUsers[existingUserIndex] = savedUser;
          return newUsers;
        }
        return [...prevUsers, savedUser];
      });

      if (currentUser?.id === updatedUser.id) {
        setCurrentUser(savedUser);
      }
    } catch (error) {
      console.error("Error saving user:", error);
      showToast(
        `Failed to save user: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
    }
  };

  const addGoal = async (goal: Goal) => {
    if (blockIfOffline()) return;
    try {
      const savedGoal = await apiService.createGoal(goal);
      setGoals((prevGoals) => [...prevGoals, savedGoal]);
    } catch (error) {
      console.error("Error saving goal to database:", error);
      showToast(
        `Failed to save goal: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
    }
  };

  const updateGoal = async (updatedGoal: Goal) => {
    if (blockIfOffline()) return;
    try {
      const savedGoal = await apiService.updateGoal(
        updatedGoal.id,
        updatedGoal,
      );

      let completionChanged = false;
      setGoals((prevGoals) => {
        const prior = prevGoals.find((g) => g.id === updatedGoal.id);
        completionChanged = prior?.isCompleted !== updatedGoal.isCompleted;
        return prevGoals.map((g) => (g.id === updatedGoal.id ? savedGoal : g));
      });

      if (completionChanged) recalculateUserConsistency();
    } catch (error) {
      console.error("Error updating goal in database:", error);
      showToast(
        `Failed to update goal: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
    }
  };

  const deleteGoal = async (goalId: string) => {
    if (blockIfOffline()) return;
    try {
      await apiService.deleteGoal(goalId);
      setGoals((prevGoals) => prevGoals.filter((g) => g.id !== goalId));
    } catch (error) {
      console.error("Error deleting goal from database:", error);
      showToast(
        `Failed to delete goal: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
    }
  };

  const updateWorkoutDay = async (workoutDay: WorkoutDay) => {
    if (blockIfOffline()) return;
    try {
      const savedWorkout = await apiService.saveWorkout(workoutDay);

      setWorkoutDays((prev) => {
        const existing = prev.find(
          (w) =>
            w.userId === workoutDay.userId &&
            w.week === workoutDay.week &&
            w.dayOfWeek === workoutDay.dayOfWeek,
        );

        if (existing) {
          return prev.map((w) => (w.id === existing.id ? savedWorkout : w));
        }
        return [...prev, savedWorkout];
      });

      recalculateUserConsistency();
    } catch (error) {
      console.error("Error saving workout to database:", error);
      showToast("Failed to save workout data. Please try again.", "error");
    }
  };

  const deleteUser = async (userId: string) => {
    if (blockIfOffline()) return;
    try {
      await apiService.deleteUser(userId);

      setUsers((prevUsers) => prevUsers.filter((u) => u.id !== userId));
      setGoals((prevGoals) => prevGoals.filter((g) => g.userId !== userId));
      setWorkoutDays((prevWorkouts) =>
        prevWorkouts.filter((w) => w.userId !== userId),
      );
    } catch (error) {
      console.error("Error deleting user from database:", error);
      showToast("Failed to delete user. Please try again.", "error");
    }
  };

  if (loadFailed && !currentUser) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <h1 className="text-xl font-semibold text-ink mb-2">
            Can't reach FitBros
          </h1>
          <p className="text-ink-muted mb-6">
            We couldn't load your data and no offline copy is available on this
            device. Check your connection and try again.
          </p>
          <button
            onClick={manualRetry}
            disabled={isRetrying}
            className="px-4 py-2 bg-clean-600 text-paper rounded-lg font-medium disabled:opacity-50"
          >
            {isRetrying ? "Retrying…" : "Retry"}
          </button>
        </div>
      </div>
    );
  }

  // A season with nobody in it yet — the first thing a new deployment shows.
  // It used to spin forever: no players meant no current player, and no current
  // player meant the app never rendered, including the admin screen that adds
  // the first one. The admin goes straight to Admin; everyone else is told to
  // wait for them.
  const emptySeason = hasLoaded && users.length === 0;
  // Players exist, but this device has not been told which one it is. It can
  // read the group and the rules; logging belongs to whoever holds the link.
  const unlinked = hasLoaded && users.length > 0 && !currentUser;

  // First run on a device: say who you are, once. It is the only place a name
  // can be chosen — after this the header shows it and nothing switches it, so
  // nobody logs a workout into somebody else's week by brushing a dropdown.
  if (unlinked) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="display text-4xl">Who are you?</h1>
          <p className="text-sm text-ink-muted mt-1 mb-5">
            Tap your name. This device remembers it, and everything you log is yours.
          </p>
          <ul className="divide-y divide-line border-y border-line">
            {[...users]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((u) => (
                <li key={u.id}>
                  <button
                    onClick={() => {
                      setCurrentPlayerId(u.id);
                      setCurrentUser(u);
                    }}
                    className="w-full text-left py-3 min-h-[44px] flex items-center gap-3 cursor-pointer
                               hover:bg-paper-sunk transition-colors duration-150 ease-settle px-2 rounded-lg"
                  >
                    <span className="w-9 h-9 rounded-full bg-clean-100 text-clean-700 grid place-items-center">
                      {u.avatar || u.name.charAt(0)}
                    </span>
                    <span className="font-semibold text-ink">{u.name}</span>
                  </button>
                </li>
              ))}
          </ul>
          <p className="text-xs text-ink-faint mt-4">
            Picked the wrong one? Whoever runs the season can put it right.
          </p>
        </div>
      </div>
    );
  }

  if (!currentUser && !emptySeason) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-clean-500 mx-auto"></div>
          <p className="mt-4 text-ink-muted">Loading the season…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper">
      {isOffline ? (
        <OfflineBanner
          mode="offline"
          savedAt={snapshotSavedAt}
          onRetry={manualRetry}
          isRetrying={isRetrying}
        />
      ) : showHydratingBanner ? (
        <OfflineBanner
          mode="hydrating"
          savedAt={snapshotSavedAt}
          onRetry={manualRetry}
          isRetrying={isRetrying}
        />
      ) : null}
      <Header
        activeView={activeView}
        onViewChange={setActiveView}
        isAdmin={admin}
        users={users}
        currentUser={currentUser}
        onChangePlayer={(id) => {
          const next = users.find((u) => u.id === id) ?? null;
          if (next) {
            setCurrentPlayerId(next.id);
            setCurrentUser(next);
          }
        }}
      />

      <main className="max-w-5xl mx-auto px-5 sm:px-8 py-8 pb-28 md:pb-12">
        <ErrorBoundary>
          <Suspense
            fallback={
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-clean-500"></div>
              </div>
            }
          >
            {!emptySeason && !unlinked && activeView === "me" && (
              <MeView
                currentUser={currentUser}
                users={users}
                goals={goals}
                workoutDays={workoutDays}
                onUpdateWorkoutDay={updateWorkoutDay}
                onAddGoal={addGoal}
                onUpdateGoal={updateGoal}
                onDeleteGoal={deleteGoal}
              />
            )}

            {!emptySeason && activeView === "group" && <GroupBoard currentUser={currentUser} goals={goals} />}

            {activeView === "rules" && <Rules />}

            {emptySeason && (activeView === "me" || activeView === "group") ? (
              <div className="py-16 text-center">
                <h2 className="display text-3xl">Nobody has joined yet</h2>
                <p className="text-sm text-ink-muted mt-2">
                  {admin
                    ? "Add the players in Admin and this fills up."
                    : "Whoever runs the season adds the players first."}
                </p>
              </div>
            ) : null}

            {activeView === "admin" && admin && (
              <Admin
                users={users}
                workoutDays={workoutDays}
                adminSettings={adminSettings}
                onUpdateUser={updateUser}
                onDeleteUser={deleteUser}
                onRecalculateConsistency={recalculateUserConsistency}
                onSettingsChange={(settings) =>
                  setAdminSettings((prev) => ({ ...prev, ...settings }))
                }
              />
            )}

          </Suspense>
        </ErrorBoundary>
      </main>
      <Toast />
    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}

export default App;
