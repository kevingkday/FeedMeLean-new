import React from 'react';

export interface ToastMessage {
  id: string;
  text: string;
  undoLabel?: string;
  onUndo?: () => void;
}

export const UndoToast: React.FC<{
  toast: ToastMessage | null;
  onDismiss: () => void;
}> = ({ toast, onDismiss }) => {
  if (!toast) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md bg-slate-900 text-white px-4 py-3 rounded-xl shadow-lg flex items-center justify-between gap-3"
    >
      <span className="text-sm font-medium truncate">{toast.text}</span>
      <div className="flex items-center gap-2 shrink-0">
        {toast.onUndo && (
          <button
            type="button"
            onClick={() => {
              toast.onUndo?.();
              onDismiss();
            }}
            className="px-3 py-1 rounded-lg bg-blue-500 hover:bg-blue-400 active:bg-blue-600 text-white text-xs font-semibold cursor-pointer"
          >
            {toast.undoLabel || 'Undo'}
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="text-slate-400 hover:text-white text-sm px-1 cursor-pointer"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

