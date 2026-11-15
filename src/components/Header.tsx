import React from "react";
import { User } from "../types";
import { BookOpen, Settings, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "../utils/theme";

interface HeaderProps {
  activeView: string;
  onViewChange: (view: "me" | "admin") => void;
  onOpenRules: () => void;
  users: User[];
  currentUser: User | null;
  onChangePlayer: (id: string) => void;
  /** Only the season admin sees the way in — the server enforces the rest. */
  isAdmin: boolean;
}

/**
 * One screen, so no tabs. The rules and, for the admin, the console are icons
 * beside your name: there when wanted, out of the way when not.
 */
const Header: React.FC<HeaderProps> = ({
  activeView,
  onViewChange,
  onOpenRules,
  users,
  currentUser,
  onChangePlayer,
  isAdmin,
}) => {
  const { choice, cycle } = useTheme();

  const ThemeIcon = choice === "light" ? Sun : choice === "dark" ? Moon : Monitor;
  const themeLabel = choice === "system" ? "Theme: match the device" : `Theme: always ${choice}`;
  const iconButton =
    "min-w-[40px] min-h-[40px] grid place-items-center rounded-xl cursor-pointer transition-colors duration-150 ease-settle";

  return (
    <header className="sticky top-0 z-40 bg-paper/85 backdrop-blur-xl border-b border-line">
      <div className="max-w-5xl mx-auto px-4 sm:px-8 h-14 md:h-16 flex items-center gap-1">
        {/* The title is the way home from the admin console. */}
        <button onClick={() => onViewChange("me")} className="display text-xl md:text-2xl text-ink cursor-pointer mr-auto">
          FitBros 3.0
        </button>

        <button onClick={onOpenRules} title="Rules" aria-label="Rules" className={`${iconButton} text-ink-muted hover:text-ink`}>
          <BookOpen size={17} aria-hidden="true" />
        </button>

        {isAdmin ? (
          <button
            onClick={() => onViewChange(activeView === "admin" ? "me" : "admin")}
            title="Admin"
            aria-label="Admin"
            aria-pressed={activeView === "admin"}
            className={`${iconButton} ${activeView === "admin" ? "text-ink bg-paper-sunk" : "text-ink-muted hover:text-ink"}`}
          >
            <Settings size={17} aria-hidden="true" />
          </button>
        ) : null}

        <button onClick={cycle} title={themeLabel} aria-label={themeLabel} className={`${iconButton} text-ink-muted hover:text-ink`}>
          <ThemeIcon size={17} aria-hidden="true" />
        </button>

        {/* Only the admin switches seats. For everyone else the name is a label,
            not a control — choosing it was how one player could log workouts in
            another's name. */}
        {isAdmin ? (
          <select
            value={currentUser?.id ?? ""}
            onChange={(e) => onChangePlayer(e.target.value)}
            aria-label="Choose which player you are"
            className="min-h-[40px] pl-2 pr-8 border-0 bg-transparent text-sm font-semibold text-ink max-w-[40%]
                       cursor-pointer focus:ring-2 focus:ring-clean-500 rounded-lg"
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-sm font-semibold text-ink pl-2 max-w-[40%] truncate">
            {currentUser?.name ?? "Not linked"}
          </span>
        )}
      </div>
    </header>
  );
};

export default Header;
