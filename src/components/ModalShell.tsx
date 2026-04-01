import { ReactNode } from "react";

interface ModalShellProps {
  title: string;
  children: ReactNode;
  onClose?: () => void;
  variant?: "default" | "retro";
}

export function ModalShell({ title, children, onClose, variant = "default" }: ModalShellProps) {
  const isRetro = variant === "retro";
  return (
    <div className={`modal-overlay ${isRetro ? "retro-modal-overlay" : ""}`}>
      <div className={`modal-card ${isRetro ? "retro-modal-card" : ""}`}>
        <header className={`modal-head ${isRetro ? "retro-modal-head" : ""}`}>
          <h3>{title}</h3>
          {isRetro ? (
            <div className="retro-head-dots" aria-hidden>
              <span />
              <span />
              <span />
            </div>
          ) : null}
          {onClose ? (
            <button className="ghost-btn" onClick={onClose}>
              關閉
            </button>
          ) : null}
        </header>
        <div className={`modal-content ${isRetro ? "retro-modal-content" : ""}`}>{children}</div>
      </div>
    </div>
  );
}
