import React, { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { useScrollLock } from "../utils/scrollLock";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  isDestructive = false,
  onConfirm,
  onCancel,
}) => {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useScrollLock(isOpen);

  // Escape cancels. The handler is read through a ref so an inline onCancel
  // can't re-run the focus effect below on every render.
  const cancelHandler = useRef(onCancel);
  cancelHandler.current = onCancel;

  // Take focus while open, hand it back to whatever opened us.
  useEffect(() => {
    if (!isOpen) return;
    const opener = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && cancelHandler.current();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="bg-paper-card rounded-xl p-6 w-full max-w-sm shadow-xl">
        <div className="flex items-start gap-4">
          {isDestructive && (
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-owed-100 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-owed-600" />
            </div>
          )}
          <div className="flex-1">
            <h3 id="confirm-dialog-title" className="text-lg font-semibold text-ink">
              {title}
            </h3>
            <p className="mt-2 text-sm text-ink-muted">{message}</p>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 border border-line text-ink rounded-lg font-medium hover:bg-paper-sunk transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-colors ${
              isDestructive
                ? "bg-owed-500 text-paper hover:bg-owed-600"
                : "bg-clean-500 text-paper hover:bg-clean-600"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
