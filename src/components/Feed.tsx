import React, { useCallback, useEffect, useState } from "react";
import { Dumbbell, IndianRupee, LucideIcon, Target, TrendingUp, Wallet } from "lucide-react";
import { apiFetch } from "../services/http";

/**
 * What has happened in the season, newest first.
 *
 * The server assembles this from the records themselves — workouts, fines,
 * payments, goals — so the feed can't claim something the data doesn't support.
 *
 * Ordered by when it happened, nothing weighted. Workouts are the commonest
 * thing in a season, so they will usually be most of what is here; money is the
 * rarer event and stays visible on the day it lands.
 */


type Kind = "fine" | "payment" | "goal" | "progress" | "workout";

interface FeedEvent {
  kind: Kind;
  userId: string;
  name: string;
  at: string;
  text: string;
  amount?: number;
  progress?: number | null;
}

const ICON: Record<Kind, LucideIcon> = {
  fine: IndianRupee,
  payment: Wallet,
  goal: Target,
  progress: TrendingUp,
  workout: Dumbbell,
};

const TONE: Record<Kind, string> = {
  fine: "text-owed-600",
  payment: "text-clean-600",
  goal: "text-clean-600",
  progress: "text-ink-muted",
  workout: "text-clean-600",
};

/** "3 days ago" beats a timestamp nobody converts in their head. */
const ago = (iso: string) => {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  const units: [number, string][] = [
    [60, "s"],
    [3600, "m"],
    [86400, "h"],
    [604800, "d"],
    [2629800, "w"],
  ];
  if (seconds < 60) return "just now";
  for (let i = 1; i < units.length; i++) {
    if (seconds < units[i][0]) return `${Math.floor(seconds / units[i - 1][0])}${units[i - 1][1]} ago`;
  }
  return `${Math.floor(seconds / 2629800)}mo ago`;
};

const Feed: React.FC<{ currentUserId?: string }> = ({ currentUserId }) => {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/feed?limit=30`);
      if (res.ok) setEvents(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <div className="h-40 rounded-xl bg-line-soft animate-pulse" aria-label="Loading the feed" />;
  }

  if (!events.length) {
    return (
      <div className="py-10 text-center">
        <p className="font-semibold text-ink">Nothing has happened yet</p>
        <p className="text-sm text-ink-muted mt-1">
          Workouts, fines, payments and completed goals all show up here.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-line border-t border-line">
      {events.map((event, i) => {
        const Icon = ICON[event.kind];
        const isMe = event.userId === currentUserId;
        return (
          <li key={`${event.kind}-${event.userId}-${event.at}-${i}`} className="flex items-start gap-3 py-3">
            <Icon size={16} className={`${TONE[event.kind]} mt-0.5 shrink-0`} />
            <p className="text-sm text-ink flex-1 min-w-0">
              <span className="font-semibold">{isMe ? "You" : event.name}</span> {event.text}
              {event.kind === "progress" && event.progress != null ? (
                <span className="text-ink-muted"> · {Math.round(event.progress * 100)}% there</span>
              ) : null}
            </p>
            <time className="text-xs text-ink-muted shrink-0 tnum" dateTime={event.at}>
              {ago(event.at)}
            </time>
          </li>
        );
      })}
    </ul>
  );
};

export default Feed;
