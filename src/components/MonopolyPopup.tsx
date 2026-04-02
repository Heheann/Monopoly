import { useEffect, useState, type ReactNode } from "react";
import type { PopupTheme } from "../ui/popupAssets";

interface MonopolyPopupProps {
  playerName: string;
  playerTokenIcon?: string;
  locationName: string;
  locationImageSrc?: string;
  locationImageAlt?: string;
  playerHint?: string;
  theme?: PopupTheme;
  effectIcon?: ReactNode;
  effectTitle?: string;
  effectAmount?: string;
  effectExtra?: ReactNode;
  actions?: ReactNode;
  onClose?: () => void;
  children?: ReactNode;
}

export function MonopolyPopup({
  playerName,
  playerTokenIcon,
  locationName,
  locationImageSrc,
  locationImageAlt,
  playerHint,
  theme = "message",
  effectIcon,
  effectTitle,
  effectAmount,
  effectExtra,
  actions,
  onClose,
  children
}: MonopolyPopupProps) {
  const [imageBroken, setImageBroken] = useState(false);

  useEffect(() => {
    setImageBroken(false);
  }, [locationImageSrc]);

  const shouldShowImage = Boolean(locationImageSrc) && !imageBroken;

  return (
    <div className="mono-popup-overlay">
      <div className={`mono-popup-card mono-theme-${theme}`}>
        <button
          type="button"
          className="mono-popup-close"
          onClick={onClose}
          disabled={!onClose}
          aria-label={onClose ? "關閉彈窗" : "不可關閉"}
        >
          ×
        </button>

        <div className="mono-popup-head-bg" />

        <div className="mono-popup-body">
          <div className="mono-player-row">
            <div className="mono-player-avatar">{playerTokenIcon ?? playerName.charAt(0)}</div>
            <p className="mono-player-hint">✨ {playerHint ?? `${playerName} 踩到這塊地！`}</p>
          </div>

          <h3 className="mono-location-title">{locationName}</h3>

          {shouldShowImage ? (
            <div className="mono-location-image-wrap">
              <img
                src={locationImageSrc}
                alt={locationImageAlt ?? locationName}
                className="mono-location-image"
                onError={() => setImageBroken(true)}
              />
            </div>
          ) : null}

          {effectTitle || effectAmount || effectExtra ? (
            <section className="mono-effect-card">
              <div className="mono-effect-icon">{effectIcon ?? "🎁"}</div>
              <div className="mono-effect-content">
                {effectTitle ? <p className="mono-effect-title">{effectTitle}</p> : null}
                {effectAmount ? <p className="mono-effect-amount">{effectAmount}</p> : null}
                {effectExtra}
              </div>
            </section>
          ) : null}

          {children}

          {actions ? <div className="mono-actions">{actions}</div> : null}
        </div>

        <div className="mono-popup-bottom-line" />
      </div>
    </div>
  );
}
