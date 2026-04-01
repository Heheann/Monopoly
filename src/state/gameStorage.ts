import type { GameState } from "../types/game";

const GAME_STATE_KEY = "kaohsiung_monopoly_runtime_v1";

export function loadRuntimeState(): GameState | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(GAME_STATE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as GameState;
  } catch {
    return null;
  }
}

export function saveRuntimeState(state: GameState): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(GAME_STATE_KEY, JSON.stringify(state));
}

export function clearRuntimeState(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(GAME_STATE_KEY);
}
