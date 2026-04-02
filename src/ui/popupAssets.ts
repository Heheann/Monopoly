export type PopupTheme = "earn" | "buy" | "pay" | "quiz" | "shop" | "card" | "message" | "confirm";

export function getLandmarkImageSrc(tileId: string): string {
  const base = import.meta.env.BASE_URL || "/";
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  return `${normalizedBase}landmarks/${tileId}.jpg`;
}
