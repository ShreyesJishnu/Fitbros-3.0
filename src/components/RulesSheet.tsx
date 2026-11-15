import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import Rules from "./Rules";
import { useScrollLock } from "../utils/scrollLock";

/**
 * The rulebook, over the dashboard instead of in a tab of its own. People read
 * it once or twice a season — it does not need a permanent place in the nav.
 */
const RulesSheet: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const closeRef = useRef<HTMLButtonElement>(null);
  useScrollLock();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Focus in on open, back to the rules button on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/50 backdrop-blur-sm animate-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Rules"
      onClick={onClose}
    >
      <div
        className="relative bg-paper w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto overscroll-contain
                   rounded-t-2xl sm:rounded-2xl p-5 pb-8 animate-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={closeRef}
          onClick={onClose}
          aria-label="Close rules"
          className="sticky top-0 float-right z-10 min-w-[40px] min-h-[40px] grid place-items-center rounded-xl
                     bg-paper text-ink-muted hover:text-ink cursor-pointer"
        >
          <X size={18} aria-hidden="true" />
        </button>
        <Rules />
      </div>
    </div>
  );
};

export default RulesSheet;
