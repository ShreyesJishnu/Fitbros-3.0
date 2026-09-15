import React, { useEffect, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { User } from "../types";

/**
 * Your name and your emoji, yours to change.
 *
 * They used to be the admin's alone, which made every typo and every nickname a
 * message to whoever runs the season. Nothing else on this card is editable:
 * standing, price and week counts are replayed from the workout sheet, and the
 * server refuses them from a player even if this form were made to send them.
 */

interface WhoYouAreProps {
  currentUser: User | null;
  onUpdateUser: (user: User) => void | Promise<void>;
}

const WhoYouAre: React.FC<WhoYouAreProps> = ({ currentUser, onUpdateUser }) => {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(currentUser?.name ?? "");
  const [avatar, setAvatar] = useState(currentUser?.avatar ?? "");
  const [error, setError] = useState<string | null>(null);

  // Switching seats mid-edit would otherwise save one person's name onto another.
  useEffect(() => {
    setEditing(false);
    setName(currentUser?.name ?? "");
    setAvatar(currentUser?.avatar ?? "");
    setError(null);
  }, [currentUser?.id, currentUser?.name, currentUser?.avatar]);

  if (!currentUser) return null;

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("A name, even a short one.");
      return;
    }
    setError(null);
    await onUpdateUser({ ...currentUser, name: trimmed, avatar: avatar.trim() });
    setEditing(false);
  };

  const initial = currentUser.avatar || currentUser.name.charAt(0).toUpperCase();

  if (!editing) {
    return (
      <div className="flex items-center gap-3 pb-6">
        <span
          aria-hidden="true"
          className="w-10 h-10 shrink-0 grid place-items-center rounded-full bg-paper-sunk text-lg"
        >
          {initial}
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
            You are
          </p>
          <p className="font-semibold text-ink truncate">{currentUser.name}</p>
        </div>
        <button
          onClick={() => setEditing(true)}
          className="ml-auto flex items-center gap-2 min-h-[44px] px-3 border border-line rounded-xl
                     text-sm font-semibold text-ink cursor-pointer transition-colors duration-150
                     ease-settle hover:border-ink"
        >
          <Pencil size={14} aria-hidden="true" />
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="pb-6">
      <div className="flex items-end gap-2">
        <div className="w-16 shrink-0">
          <label className="block text-xs text-ink-muted mb-1" htmlFor="me-avatar">
            Emoji
          </label>
          <input
            id="me-avatar"
            value={avatar}
            onChange={(e) => setAvatar(e.target.value)}
            maxLength={10}
            placeholder="🏋️"
            className="w-full min-h-[44px] px-2 text-center border border-line rounded-xl bg-paper-card
                       text-ink text-lg focus:ring-2 focus:ring-clean-500"
          />
        </div>
        <div className="flex-1 min-w-0">
          <label className="block text-xs text-ink-muted mb-1" htmlFor="me-name">
            Your name
          </label>
          <input
            id="me-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            onKeyDown={(e) => e.key === "Enter" && save()}
            className="w-full min-h-[44px] px-3 border border-line rounded-xl bg-paper-card text-ink
                       font-semibold focus:ring-2 focus:ring-clean-500"
          />
        </div>
        <button
          onClick={save}
          aria-label="Save your name"
          className="min-h-[44px] min-w-[44px] grid place-items-center bg-clean-500 text-paper rounded-xl
                     cursor-pointer"
        >
          <Check size={16} aria-hidden="true" />
        </button>
        <button
          onClick={() => setEditing(false)}
          aria-label="Cancel"
          className="min-h-[44px] min-w-[44px] grid place-items-center border border-line rounded-xl
                     text-ink-muted cursor-pointer"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-owed-600 mt-2">
          {error}
        </p>
      ) : (
        <p className="text-xs text-ink-muted mt-2">
          Everyone sees this. Your weeks, price and fines are not yours to type — the
          season works those out.
        </p>
      )}
    </div>
  );
};

export default WhoYouAre;
