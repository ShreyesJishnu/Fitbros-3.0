import React from "react";
import { User } from "../types";
import { Settings, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "../utils/theme";

interface HeaderProps {
  activeView: string;
  onViewChange: (view: "me" | "group" | "rules" | "admin") => void;
  users: User[];
  currentUser: User | null;
  onChangePlayer: (id: string) => void;
  /** Only the season admin sees the way in — the server enforces the rest. */
  isAdmin: boolean;
}

const Header: React.FC<HeaderProps> = ({
  activeView,
  onViewChange,
  users,
  currentUser,
  onChangePlayer,
  isAdmin,
}) => {
  const { choice, cycle } = useTheme();

  const themeIcon = choice === "light" ? Sun : choice === "dark" ? Moon : Monitor;
  const ThemeIcon = themeIcon;
  const themeLabel =
    choice === "system" ? "Theme: match the device" : `Theme: always ${choice}`;

  // Two places, not four: what is mine, and what is everyone's.
  const navItems = [
    { id: "me", label: "Me" },
    { id: "group", label: "Group" },
    { id: "rules", label: "Rules" },
  ] as const;

  return (
    <>
      {/* Desktop Header */}
      <header className="sticky top-0 z-40 hidden md:block bg-paper/85 backdrop-blur-xl border-b border-line">
        <div className="max-w-5xl mx-auto px-5 sm:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center space-x-3">
              <h1 className="display text-2xl text-ink">FitBros 3.0</h1>
            </div>

            {/* Desktop Navigation */}
            <nav className="flex gap-6">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onViewChange(item.id)}
                  aria-current={activeView === item.id ? "page" : undefined}
                  className={`relative min-h-[44px] text-sm font-semibold cursor-pointer
                    transition-colors duration-150 ease-settle after:absolute after:left-0 after:right-0
                    after:-bottom-px after:h-0.5 after:transition-colors after:duration-150 ${
                      activeView === item.id
                        ? "text-ink after:bg-ink"
                        : "text-ink-muted hover:text-ink after:bg-transparent"
                    }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="flex items-center gap-2">
              {isAdmin ? (
              <button
                onClick={() => onViewChange("admin")}
                title="Admin"
                aria-label="Admin"
                aria-current={activeView === "admin" ? "page" : undefined}
                className={`min-w-[40px] min-h-[40px] grid place-items-center rounded-xl cursor-pointer
                  transition-colors duration-150 ease-settle ${
                    activeView === "admin" ? "text-ink bg-paper-sunk" : "text-ink-muted hover:text-ink"
                  }`}
              >
                <Settings size={16} aria-hidden="true" />
              </button>
              ) : null}
              <button
                onClick={cycle}
                title={themeLabel}
                aria-label={themeLabel}
                className="min-w-[40px] min-h-[40px] grid place-items-center rounded-xl text-ink-muted
                           cursor-pointer transition-colors duration-150 ease-settle hover:text-ink"
              >
                <ThemeIcon size={16} aria-hidden="true" />
              </button>
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                {isAdmin ? "Playing as" : "You are"}
              </span>
              {/* Only the admin switches seats. For everyone else the name is a
                  label, not a control — choosing it was how one player could log
                  workouts in another's name. */}
              {isAdmin ? (
                <select
                  value={currentUser?.id ?? ""}
                  onChange={(e) => onChangePlayer(e.target.value)}
                  aria-label="Choose which player you are"
                  className="min-h-[40px] pl-2 pr-8 border-0 bg-transparent text-sm font-semibold text-ink
                             cursor-pointer focus:ring-2 focus:ring-clean-500 rounded-lg"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-sm font-semibold text-ink px-2">
                  {currentUser?.name ?? "Not linked"}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Header - Simple title bar */}
      <header className="sticky top-0 z-40 md:hidden bg-paper/85 backdrop-blur-xl border-b border-line">
        <div className="px-4 h-14 flex items-center justify-between gap-3">
          <h1 className="display text-xl text-ink">FitBros 3.0</h1>
          <button
            onClick={cycle}
            title={themeLabel}
            aria-label={themeLabel}
            className="min-w-[40px] min-h-[40px] grid place-items-center rounded-xl text-ink-muted
                       cursor-pointer ml-auto mr-2"
          >
            <ThemeIcon size={16} aria-hidden="true" />
          </button>
          {isAdmin ? (
            <select
              value={currentUser?.id ?? ""}
              onChange={(e) => onChangePlayer(e.target.value)}
              aria-label="Choose which player you are"
              className="min-h-[40px] pl-2 pr-8 border-0 bg-transparent text-sm font-semibold text-ink max-w-[45%] rounded-lg"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm font-semibold text-ink max-w-[45%] truncate">
              {currentUser?.name ?? "Not linked"}
            </span>
          )}
        </div>
      </header>

      {/* Mobile Bottom Tab Navigation */}
      <nav
        aria-label="Sections"
        className="fixed bottom-0 left-0 right-0 bg-paper/92 backdrop-blur-xl border-t border-line md:hidden z-50 pb-safe"
      >
        <div className="flex">
          {[...navItems, ...(isAdmin ? [{ id: "admin", label: "Admin" } as const] : [])].map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                aria-current={isActive ? "page" : undefined}
                className={`flex-1 flex items-center justify-center py-3 min-h-[56px] text-sm cursor-pointer
                  transition-colors duration-150 ease-settle ${
                    isActive ? "text-ink font-semibold" : "text-ink-muted font-medium"
                  }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};

export default Header;
