/**
 * Every request states which player is making it.
 *
 * The server holds the caller to that id, so one player can't write to another's
 * record. It is an ownership check rather than authentication — see the note on
 * denyUnlessOwner in the server — and this is the single place a real token
 * would go once there is one.
 */

/**
 * In production the API is served from the same origin as the app, so a
 * relative path is right and a baked-in dev address (a LAN IP, say) is wrong.
 */
export const API_BASE =
  process.env.NODE_ENV === "production"
    ? "/api"
    : process.env.REACT_APP_API_URL || "http://localhost:5050/api";

/**
 * The admin key.
 *
 * There is no login here, so the season's admin is whoever holds a shared
 * secret: open the app once as `?admin=<key>` and it is remembered on that
 * device. `?admin=` with nothing after it forgets it again. The key rides on
 * every request as x-admin-key, and the server is the thing that actually
 * enforces it — hiding the Admin tab is only tidiness.
 */
const ADMIN_KEY = "adminKey";

const claimAdminFromUrl = () => {
  try {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("admin")) return;
    const key = params.get("admin") || "";
    if (key) localStorage.setItem(ADMIN_KEY, key);
    else localStorage.removeItem(ADMIN_KEY);
    params.delete("admin");
    const query = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (query ? `?${query}` : ""));
  } catch {
    /* private mode, or no history API — the key just is not remembered */
  }
};

/**
 * Which player this device is.
 *
 * Same shape as the admin key: open your own link once — `?me=<your id>` — and
 * the device remembers it. Without it there is no way to pick a name, which is
 * the point: the picker used to let anyone play as anyone and log workouts in
 * their name. The admin still switches freely, because someone has to be able
 * to fix a record.
 *
 * This is a capability, not a credential. Anyone holding another player's link
 * can be them, and the API still trusts the x-player-id header it is sent.
 */
const PLAYER_KEY = "playerId";

const claimPlayerFromUrl = () => {
  try {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("me")) return;
    const id = params.get("me") || "";
    if (id) localStorage.setItem(PLAYER_KEY, id);
    else localStorage.removeItem(PLAYER_KEY);
    params.delete("me");
    const query = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (query ? `?${query}` : ""));
  } catch {
    /* private mode, or no history API — the id just is not remembered */
  }
};

claimAdminFromUrl();
claimPlayerFromUrl();

export const adminKey = (): string | null => {
  try {
    return localStorage.getItem(ADMIN_KEY);
  } catch {
    return null;
  }
};

export const isAdmin = (): boolean => Boolean(adminKey());

/** Whoever this device has been linked to, or nobody. */
export const currentPlayerId = (): string | null => {
  try {
    return localStorage.getItem(PLAYER_KEY);
  } catch {
    return null;
  }
};

/** The admin switching seats, or a player claiming their link. */
export const setCurrentPlayerId = (id: string): void => {
  try {
    localStorage.setItem(PLAYER_KEY, id);
  } catch {
    /* private mode — the choice lasts for this page only */
  }
};

/** The link to send a player so their device knows who they are. */
export const playerLink = (id: string): string =>
  `${window.location.origin}${window.location.pathname}?me=${encodeURIComponent(id)}`;

export const apiFetch = (path: string, init: RequestInit = {}): Promise<Response> => {
  const player = currentPlayerId();
  const headers = new Headers(init.headers);
  if (player) headers.set("x-player-id", player);
  const admin = adminKey();
  if (admin) headers.set("x-admin-key", admin);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const url = path.startsWith("http") ? path : `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  return fetch(url, { ...init, headers });
};

/** One logged reading, exactly as the server stores it. */
export interface Reading {
  id: string;
  value: number;
  note: string | null;
  recordedAt: string;
}

/**
 * Every reading for every goal, in time order, keyed by goal id.
 *
 * The whole history, not just the newest — the track is the point: a player
 * should see how many times they moved and how far each move took them. A
 * caller that only wants the latest takes the last of each array.
 *
 * One request for the whole board — the per-goal route is still there, but
 * asking it once per goal cost a Turso round trip each. The server has no
 * ?userId= filter, so one player cannot be asked for on its own.
 */
export const goalReadings = async (): Promise<Record<string, Reading[]>> => {
  const res = await apiFetch("/goals/progress");
  return res.ok ? await res.json() : {};
};
