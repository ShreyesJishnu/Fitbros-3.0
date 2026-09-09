import React, { useCallback, useEffect, useState } from 'react';
import { User, WorkoutDay, AdminSettings } from '../types';
import {
  Users,
  Edit,
  Trash2,
  UserPlus,
  RotateCcw,
  CalendarPlus,
  Link as LinkIcon,
  Check
} from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import { useToast } from './ToastContext';
import { apiFetch, playerLink } from '../services/http';
import { CREDIT_BY_KIND, fineAtLevel, SEASON_WEEKS, WORKOUTS_PER_WEEK } from '../utils/seasonEngine';

/** The ladder is the engine's to state — this screen only prints it. */
const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/**
 * What the engine says about a player, replayed off the sheet.
 *
 * The `users` rows carry stored copies of these numbers that only a fine-sync
 * refreshes, so they drift. Every other screen reads /api/seasons; this one
 * does too now.
 */
interface SeasonRow {
  userId: string;
  priceLevel: number;
  fineIfMissed: number;
  cleanWeeks: number;
  missedWeeks: number;
}

interface AdminProps {
  users: User[];
  workoutDays: WorkoutDay[];
  adminSettings: AdminSettings;
  onUpdateUser: (user: User) => void;
  onDeleteUser: (userId: string) => void;
  onRecalculateConsistency?: () => void;
  /** The season clock moved. App owns it; Admin only reports what the server said. */
  onSettingsChange: (settings: AdminSettings) => void;
}

const Admin: React.FC<AdminProps> = ({
  users,
  workoutDays,
  adminSettings,
  onUpdateUser,
  onDeleteUser,
  onRecalculateConsistency,
  onSettingsChange,
}) => {
  const { showToast } = useToast();
  const [showAddUser, setShowAddUser] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [checkingFines, setCheckingFines] = useState(false);
  const [startDate, setStartDate] = useState(adminSettings.challengeStartDate);
  const [savingDates, setSavingDates] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  /**
   * A player's own link. Opening it once tells that device who it is, which is
   * how a new phone, or somebody who tapped the wrong name, gets put right.
   */
  const copyPlayerLink = async (user: User) => {
    const link = playerLink(user.id);
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(user.id);
      setTimeout(() => setCopiedId((id) => (id === user.id ? null : id)), 2000);
      showToast(`Link for ${user.name} copied`, 'success');
    } catch {
      // Clipboard is blocked outside a secure context — show it instead.
      showToast(link, 'info');
    }
  };
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', confirmLabel: 'Confirm', onConfirm: () => {} });
  const [advancing, setAdvancing] = useState(false);

  const [newUser, setNewUser] = useState({ name: '', avatar: '' });

  /**
   * The replayed numbers, by player id.
   *
   * Refetched whenever the sheet could have moved — closing a week, rechecking
   * fines — so this screen never prints a stale price.
   */
  const [seasons, setSeasons] = useState<Record<string, SeasonRow> | null>(null);

  const loadSeasons = useCallback(async () => {
    try {
      const res = await apiFetch('/seasons');
      if (!res.ok) return;
      const rows: SeasonRow[] = await res.json();
      setSeasons(Object.fromEntries(rows.map((r) => [r.userId, r])));
    } catch {
      /* leave the last good reading up rather than blanking the screen */
    }
  }, []);

  useEffect(() => {
    loadSeasons();
  }, [loadSeasons, users.length]);

  // Add new user
  const handleAddUser = () => {
    if (!newUser.name.trim()) return;

    const userToAdd: User = {
      id: `user-${Date.now()}`, // This will be replaced by the database
      name: newUser.name,
      avatar: newUser.avatar || newUser.name.charAt(0).toUpperCase(),
      startDate: adminSettings.challengeStartDate,
      // Everyone opens at the cheapest price, on the one clock the season runs on.
      priceLevel: 1,
      // Stored columns the engine ignores — it replays them off the sheet.
      cleanWeeks: 0,
      missedWeeks: 0,
      isActive: true,
    };

    onUpdateUser(userToAdd);
    setNewUser({ name: '', avatar: '' });
    setShowAddUser(false);
  };

  // Edit user — name and avatar. Everything else is derived.
  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setNewUser({ name: user.name, avatar: user.avatar || '' });
    setShowAddUser(true);
  };

  // Save edited user
  const handleSaveUser = () => {
    if (!editingUser || !newUser.name.trim()) return;

    onUpdateUser({
      ...editingUser,
      name: newUser.name,
      avatar: newUser.avatar || newUser.name.charAt(0).toUpperCase(),
    });
    setEditingUser(null);
    setNewUser({ name: '', avatar: '' });
    setShowAddUser(false);
  };

  // Delete user (deactivate)
  const handleDeactivateUser = (user: User) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Remove player',
      message: `Are you sure you want to remove ${user.name} from the challenge? This will delete all their data.`,
      confirmLabel: 'Remove',
      onConfirm: () => {
        onDeleteUser(user.id);
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  // ---- Moving the season on ----

  const currentWeek = adminSettings.currentWeek;
  const seasonOver = currentWeek >= SEASON_WEEKS;

  /**
   * How many players are short of a clean week right now.
   *
   * Credit, not a count: a session is worth 1 and a 10k-step day a half. The
   * server decides what is actually billed — this is what the admin is told
   * before they commit.
   */
  const shortOfClean = users.filter(
    (u) =>
      workoutDays
        .filter((w) => w.userId === u.id && w.week === currentWeek && w.isCompleted)
        .reduce((sum, w) => sum + (CREDIT_BY_KIND[w.kind ?? 'session'] ?? 1), 0) < WORKOUTS_PER_WEEK
  ).length;

  /**
   * Replay every player's season and make the fines on record match it.
   *
   * Closing a week already does this, so most of the time the honest answer is
   * "nothing to change". It earns its place when the sheet changes after the
   * fact — someone back-logs a workout for a closed week, and the fine that
   * week no longer deserves has to be voided.
   */
  const recheckFines = async () => {
    setCheckingFines(true);
    try {
      const res = await apiFetch('/fines/sync', { method: 'POST', body: '{}' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error ?? 'Could not recheck the fines', 'error');
        return;
      }
      const posted = Number(data.finesIssued ?? 0);
      const voided = Number(data.finesVoided ?? 0);
      showToast(
        posted || voided
          ? `${posted} fine${posted === 1 ? '' : 's'} posted, ${voided} voided`
          : 'Every fine already matches the sheet',
        'success'
      );
      onRecalculateConsistency?.();
      loadSeasons();
    } finally {
      setCheckingFines(false);
    }
  };

  /**
   * When the season actually begins.
   *
   * The date decides which week a player joined in, and nothing else — weeks
   * only advance when someone closes one. Moving it before anybody has joined
   * costs nothing; moving it later, once weeks have been scored, would change
   * who was in the season when.
   */
  const saveStartDate = async () => {
    setSavingDates(true);
    try {
      const end = new Date(startDate);
      end.setDate(end.getDate() + SEASON_WEEKS * 7);
      const res = await apiFetch('/settings', {
        method: 'PUT',
        body: JSON.stringify({
          challengeStartDate: startDate,
          challengeEndDate: end.toISOString().slice(0, 10),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error ?? 'Could not move the season start', 'error');
        return;
      }
      onSettingsChange({
        challengeStartDate: data.challengeStartDate,
        challengeEndDate: data.challengeEndDate,
        currentWeek: data.currentWeek,
        isActive: data.isActive,
      });
      showToast(`Season starts ${data.challengeStartDate}`, 'success');
    } finally {
      setSavingDates(false);
    }
  };

  const advanceWeek = async () => {
    setAdvancing(true);
    try {
      const res = await apiFetch('/settings', {
        method: 'PUT',
        body: JSON.stringify({ currentWeek: currentWeek + 1 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error ?? 'Could not move the season on', 'error');
        return;
      }
      // One clock: App holds it, the server decided it.
      onSettingsChange({
        challengeStartDate: data.challengeStartDate,
        challengeEndDate: data.challengeEndDate,
        currentWeek: data.currentWeek,
        isActive: data.isActive,
      });
      // Fines and price levels all moved with the week.
      onRecalculateConsistency?.();
      loadSeasons();
      showToast(
        `Week ${data.movedFrom} closed. ${data.finesIssued} fine${data.finesIssued === 1 ? '' : 's'} posted.`,
        'success'
      );
    } catch {
      showToast('Could not reach the API', 'error');
    } finally {
      setAdvancing(false);
    }
  };

  const confirmAdvance = () => {
    setConfirmDialog({
      isOpen: true,
      title: `Close week ${currentWeek}`,
      message:
        `The season moves to week ${currentWeek + 1}. Week ${currentWeek} is scored on the way, ` +
        `which posts a fine for up to ${shortOfClean} player${shortOfClean === 1 ? '' : 's'} short of ` +
        `${WORKOUTS_PER_WEEK} workouts.`,
      confirmLabel: `Advance to week ${currentWeek + 1}`,
      onConfirm: () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        advanceWeek();
      },
    });
  };

  /** The replayed row for a player, or null until /api/seasons has one. */
  const seasonOf = (userId: string): SeasonRow | null => seasons?.[userId] ?? null;
  const atLevel = (test: (level: number) => boolean) =>
    seasons ? Object.values(seasons).filter((r) => test(r.priceLevel)).length : 0;

  const sortedUsers = [...users].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">Admin</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddUser(true)}
            aria-label="Add player"
            className="min-w-[44px] min-h-[44px] bg-primary-500 text-paper px-3 py-2 rounded-lg hover:bg-primary-600 flex items-center space-x-2"
          >
            <UserPlus size={18} />
            <span className="hidden sm:inline">Add User</span>
          </button>
          <button
            onClick={recheckFines}
            disabled={checkingFines}
            aria-label="Recheck fines"
            title="Replay every season and correct the fines on record"
            className="min-w-[44px] min-h-[44px] bg-paper-sunk text-ink px-3 py-2 rounded-lg hover:bg-line flex items-center space-x-2
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RotateCcw size={18} className={checkingFines ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Recheck fines</span>
          </button>
        </div>
      </div>

      {/* What the season looks like right now, straight off the sheet. */}
      <section className=" p-4 mb-4">
        <h3 className="display text-xl mb-3">Season at a glance</h3>
        <dl className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-line border border-line rounded-lg overflow-hidden">
          <div className="bg-paper-card px-3 py-2.5">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">Week</dt>
            <dd className="display text-2xl tnum mt-0.5">
              {currentWeek}
              <span className="text-sm text-ink-muted"> / {SEASON_WEEKS}</span>
            </dd>
          </div>
          <div className="bg-paper-card px-3 py-2.5">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">Players</dt>
            <dd className="display text-2xl tnum mt-0.5 text-clean-600">{users.length}</dd>
          </div>
          <div className="bg-paper-card px-3 py-2.5">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
              Short this week
            </dt>
            <dd className="display text-2xl tnum mt-0.5 text-owed-600">{shortOfClean}</dd>
          </div>
          <div className="bg-paper-card px-3 py-2.5">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
              At {rupees(fineAtLevel(1))}
            </dt>
            <dd className="display text-2xl tnum mt-0.5">{atLevel((l) => l === 1)}</dd>
          </div>
          <div className="bg-paper-card px-3 py-2.5">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
              Climbed higher
            </dt>
            <dd className="display text-2xl tnum mt-0.5 text-owed-600">{atLevel((l) => l > 1)}</dd>
          </div>
        </dl>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border border-line rounded-lg bg-paper-card px-3 py-3">
          <div>
            <label
              htmlFor="season-start"
              className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted"
            >
              Season starts
            </label>
            <div className="flex items-center gap-2 mt-1">
              <input
                id="season-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="min-h-[44px] px-3 border border-line rounded-lg bg-paper-card text-ink text-sm"
              />
              <span className="text-xs text-ink-muted">
                Weeks run Monday to Monday · {SEASON_WEEKS} of them
              </span>
            </div>
          </div>
          <button
            onClick={saveStartDate}
            disabled={savingDates || startDate === adminSettings.challengeStartDate}
            className="min-h-[44px] px-4 rounded-lg border border-line text-ink text-sm font-semibold
                       hover:border-ink disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {savingDates ? 'Saving…' : 'Save start date'}
          </button>
        </div>

        {/* The season only moves when someone says so — and it is hard to undo. */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border border-line rounded-lg bg-paper-card px-3 py-3">
          <p className="text-sm text-ink-muted">
            {seasonOver ? (
              <>Week {SEASON_WEEKS} is the last one. The season is over.</>
            ) : (
              <>
                Closing week <span className="tnum font-semibold text-ink">{currentWeek}</span> scores it and
                fines up to <span className="tnum font-semibold text-owed-600">{shortOfClean}</span> player
                {shortOfClean === 1 ? '' : 's'} short of {WORKOUTS_PER_WEEK} workouts.
              </>
            )}
          </p>
          <button
            onClick={confirmAdvance}
            disabled={advancing || seasonOver}
            className="min-h-[44px] px-4 rounded-lg bg-primary-500 text-paper text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 flex items-center gap-2"
          >
            <CalendarPlus size={18} />
            {advancing ? 'Advancing…' : `Advance to week ${Math.min(currentWeek + 1, SEASON_WEEKS)}`}
          </button>
        </div>
      </section>

      {/* Users Table - Always visible */}
      <div className="pb-2">

          {/* Mobile Card View */}
          <div className="md:hidden space-y-3">
            {sortedUsers.map((user) => {
              const row = seasonOf(user.id);
              return (
              <div key={user.id} className="border border-line rounded-lg p-4">
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-10 h-10 bg-primary-500 text-paper rounded-full flex items-center justify-center">
                    {user.avatar || user.name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-medium text-ink">{user.name}</div>
                    <div className="text-xs text-ink-muted tnum">
                      {row ? `${rupees(row.fineIfMissed)} a miss` : '—'}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center mb-3">
                  <div className="bg-clean-50 rounded p-2">
                    <div className="text-sm font-bold text-clean-600 tnum">{row ? row.cleanWeeks : '—'}</div>
                    <div className="text-[10px] text-clean-700">Clean</div>
                  </div>
                  <div className="bg-owed-50 rounded p-2">
                    <div className="text-sm font-bold text-owed-600 tnum">{row ? row.missedWeeks : '—'}</div>
                    <div className="text-[10px] text-owed-700">Fined</div>
                  </div>
                  <div className="bg-paper-sunk rounded p-2">
                    <div className="text-sm font-bold text-ink tnum">
                      {row ? rupees(row.fineIfMissed) : '—'}
                    </div>
                    <div className="text-[10px] text-ink-muted">A miss</div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleEditUser(user)}
                    className="flex-1 min-h-[44px] bg-paper-sunk text-ink px-3 py-2 rounded-lg text-sm font-medium hover:bg-line flex items-center justify-center space-x-1"
                  >
                    <Edit size={14} />
                    <span>Edit</span>
                  </button>
                  <button
                    onClick={() => handleDeactivateUser(user)}
                    className="flex-1 min-h-[44px] bg-owed-100 text-owed-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-owed-50 flex items-center justify-center space-x-1"
                  >
                    <Trash2 size={14} />
                    <span>Remove</span>
                  </button>
                </div>
              </div>
              );
            })}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-line">
                  <th className="text-left py-3 px-4 font-medium text-ink">Name</th>
                  <th className="text-center py-3 px-4 font-medium text-ink">Avatar</th>
                  <th className="text-center py-3 px-4 font-medium text-ink">Miss costs</th>
                  <th className="text-center py-3 px-4 font-medium text-ink">Clean weeks</th>
                  <th className="text-center py-3 px-4 font-medium text-ink">Fined weeks</th>
                  <th className="text-center py-3 px-4 font-medium text-ink">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedUsers.map((user) => {
                  const row = seasonOf(user.id);
                  return (
                  <tr key={user.id} className="border-b border-line-soft hover:bg-paper-sunk">
                    <td className="py-4 px-4">
                      <div className="font-medium text-ink">{user.name}</div>
                      <div className="text-sm text-ink-muted">ID: {user.id}</div>
                    </td>

                    <td className="py-4 px-4 text-center">
                      <div className="w-10 h-10 bg-primary-500 text-paper rounded-full flex items-center justify-center mx-auto">
                        {user.avatar || user.name.charAt(0)}
                      </div>
                    </td>

                    <td className="py-4 px-4 text-center">
                      <span className="px-3 py-1 bg-paper-sunk text-ink text-sm font-medium rounded-full tnum">
                        {row ? rupees(row.fineIfMissed) : '—'}
                      </span>
                    </td>

                    <td className="py-4 px-4 text-center">
                      <span className="text-clean-600 font-medium tnum">{row ? row.cleanWeeks : '—'}</span>
                    </td>

                    <td className="py-4 px-4 text-center">
                      <span className="text-owed-600 font-medium tnum">{row ? row.missedWeeks : '—'}</span>
                    </td>

                    <td className="py-4 px-4">
                      <div className="flex items-center justify-center space-x-2">
                        <button
                          onClick={() => handleEditUser(user)}
                          className="min-w-[44px] min-h-[44px] flex items-center justify-center text-ink hover:bg-paper-sunk rounded-lg transition-colors"
                          aria-label={`Edit ${user.name}`}
                          title="Edit player"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => copyPlayerLink(user)}
                          className="min-w-[44px] min-h-[44px] flex items-center justify-center text-ink-muted hover:bg-paper-sunk rounded-lg transition-colors"
                          aria-label={`Copy ${user.name}'s link`}
                          title="Copy this player's link"
                        >
                          {copiedId === user.id ? <Check size={16} /> : <LinkIcon size={16} />}
                        </button>
                        <button
                          onClick={() => handleDeactivateUser(user)}
                          className="min-w-[44px] min-h-[44px] flex items-center justify-center text-owed-600 hover:bg-owed-100 rounded-lg transition-colors"
                          aria-label={`Remove ${user.name}`}
                          title="Remove player"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {users.length === 0 && (
            <div className="text-center py-8 text-ink-muted">
              <Users className="w-12 h-12 mx-auto mb-3 text-ink-faint" />
              <p>No players yet. Add your first one.</p>
            </div>
          )}
        </div>

      {/* Add/Edit User Modal */}
      {showAddUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-paper-card rounded-xl p-4 md:p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-ink mb-4">
              {editingUser ? 'Edit player' : 'Add new player'}
            </h3>

            {/* Name and avatar. Weeks, price and fines are replayed, never typed. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink mb-1" htmlFor="admin-name">
                  Name *
                </label>
                <input
                  id="admin-name"
                  type="text"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  className="w-full min-h-[44px] bg-paper-card text-ink border border-line rounded-lg px-3 py-2"
                  placeholder="Enter player name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ink mb-1" htmlFor="admin-avatar">
                  Avatar (emoji/letter)
                </label>
                <input
                  id="admin-avatar"
                  type="text"
                  value={newUser.avatar}
                  onChange={(e) => setNewUser({ ...newUser, avatar: e.target.value })}
                  className="w-full min-h-[44px] bg-paper-card text-ink border border-line rounded-lg px-3 py-2"
                  placeholder="😊 or A"
                  maxLength={2}
                />
              </div>
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowAddUser(false);
                  setEditingUser(null);
                  setNewUser({ name: '', avatar: '' });
                }}
                className="flex-1 min-h-[44px] border border-line text-ink px-4 py-2 rounded-lg hover:bg-paper-sunk"
              >
                Cancel
              </button>
              <button
                onClick={editingUser ? handleSaveUser : handleAddUser}
                disabled={!newUser.name.trim()}
                className="flex-1 min-h-[44px] bg-primary-500 text-paper px-4 py-2 rounded-lg hover:bg-primary-600 disabled:opacity-50"
              >
                {editingUser ? 'Save changes' : 'Add player'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        isDestructive={true}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};

export default Admin;