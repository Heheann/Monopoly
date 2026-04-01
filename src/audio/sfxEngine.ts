import type { SoundEventType } from "../types/game";

const CUSTOM_EXTENSIONS = ["mp3", "wav", "ogg"] as const;

interface ToneStep {
  frequency: number;
  duration: number;
  delay: number;
  gain?: number;
  wave?: OscillatorType;
}

class SfxEngine {
  private enabled = true;
  private volume = 0.7;
  private context: AudioContext | null = null;
  private resolvedCustomSource = new Map<SoundEventType, string | null>();
  private missingSourceCache = new Set<string>();

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  setVolume(volume: number) {
    this.volume = Math.min(1, Math.max(0, volume));
  }

  async unlock(): Promise<void> {
    const context = this.getContext();
    if (!context) return;
    if (context.state === "suspended") {
      try {
        await context.resume();
      } catch {
        // Ignore resume failures; we can still fall back to no-op.
      }
    }
  }

  async play(type: SoundEventType): Promise<void> {
    if (!this.enabled) return;

    await this.unlock();
    const customSource = await this.resolveCustomSource(type);
    if (customSource) {
      const started = await this.playCustomAudio(customSource);
      if (started) return;
      this.resolvedCustomSource.set(type, null);
    }

    this.playSynth(type);
  }

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (this.context) return this.context;

    const Ctx = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    this.context = new Ctx();
    return this.context;
  }

  private async resolveCustomSource(type: SoundEventType): Promise<string | null> {
    if (this.resolvedCustomSource.has(type)) {
      return this.resolvedCustomSource.get(type) ?? null;
    }

    const candidates = this.getSourceCandidates(type);
    for (const candidate of candidates) {
      if (this.missingSourceCache.has(candidate)) continue;
      const exists = await this.sourceExists(candidate);
      if (exists) {
        this.resolvedCustomSource.set(type, candidate);
        return candidate;
      }
      this.missingSourceCache.add(candidate);
    }

    this.resolvedCustomSource.set(type, null);
    return null;
  }

  private getSourceCandidates(type: SoundEventType): string[] {
    const basePath = import.meta.env.BASE_URL || "/";
    const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
    return CUSTOM_EXTENSIONS.map((ext) => `${normalizedBase}sfx/${type}.${ext}`);
  }

  private async sourceExists(source: string): Promise<boolean> {
    try {
      const response = await fetch(source, { method: "HEAD", cache: "no-store" });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async playCustomAudio(source: string): Promise<boolean> {
    if (typeof window === "undefined") return false;
    try {
      const audio = new Audio(source);
      audio.preload = "auto";
      audio.volume = this.volume;
      await audio.play();
      return true;
    } catch {
      return false;
    }
  }

  private playSynth(type: SoundEventType): void {
    const context = this.getContext();
    if (!context || context.state === "suspended") return;

    const pattern = this.getTonePattern(type);
    const baseTime = context.currentTime;
    for (const step of pattern) {
      this.scheduleTone(context, baseTime, step);
    }
  }

  private scheduleTone(context: AudioContext, baseTime: number, step: ToneStep) {
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    const gainValue = (step.gain ?? 0.28) * this.volume;
    const startTime = baseTime + step.delay;
    const endTime = startTime + step.duration;

    oscillator.type = step.wave ?? "square";
    oscillator.frequency.setValueAtTime(step.frequency, startTime);

    gainNode.gain.setValueAtTime(0.0001, startTime);
    gainNode.gain.exponentialRampToValueAtTime(Math.max(gainValue, 0.0001), startTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, endTime);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start(startTime);
    oscillator.stop(endTime + 0.02);
  }

  private getTonePattern(type: SoundEventType): ToneStep[] {
    switch (type) {
      case "quiz_correct":
        return [
          { frequency: 660, duration: 0.1, delay: 0, wave: "triangle" },
          { frequency: 880, duration: 0.12, delay: 0.12, wave: "triangle" }
        ];
      case "quiz_wrong":
        return [
          { frequency: 260, duration: 0.12, delay: 0, wave: "sawtooth", gain: 0.24 },
          { frequency: 190, duration: 0.15, delay: 0.13, wave: "sawtooth", gain: 0.24 }
        ];
      case "property_buy":
        return [
          { frequency: 520, duration: 0.09, delay: 0, wave: "square" },
          { frequency: 780, duration: 0.14, delay: 0.1, wave: "triangle" }
        ];
      case "property_upgrade":
        return [
          { frequency: 600, duration: 0.08, delay: 0, wave: "triangle" },
          { frequency: 760, duration: 0.08, delay: 0.1, wave: "triangle" },
          { frequency: 920, duration: 0.12, delay: 0.2, wave: "triangle" }
        ];
      case "payment_to_player":
        return [
          { frequency: 430, duration: 0.08, delay: 0, wave: "square" },
          { frequency: 560, duration: 0.08, delay: 0.09, wave: "square" }
        ];
      case "payment_to_system":
        return [{ frequency: 320, duration: 0.16, delay: 0, wave: "square", gain: 0.2 }];
      case "payment_waived":
        return [
          { frequency: 740, duration: 0.08, delay: 0, wave: "triangle" },
          { frequency: 940, duration: 0.12, delay: 0.09, wave: "triangle" }
        ];
      case "shop_buy":
        return [
          { frequency: 480, duration: 0.08, delay: 0, wave: "triangle" },
          { frequency: 640, duration: 0.09, delay: 0.09, wave: "triangle" }
        ];
      case "card_draw":
        return [
          { frequency: 360, duration: 0.07, delay: 0, wave: "sine", gain: 0.2 },
          { frequency: 460, duration: 0.08, delay: 0.07, wave: "sine", gain: 0.2 },
          { frequency: 600, duration: 0.09, delay: 0.16, wave: "triangle", gain: 0.22 }
        ];
      case "dice_roll":
        return [
          { frequency: 220, duration: 0.04, delay: 0, wave: "square", gain: 0.16 },
          { frequency: 220, duration: 0.04, delay: 0.06, wave: "square", gain: 0.16 },
          { frequency: 320, duration: 0.06, delay: 0.12, wave: "square", gain: 0.18 }
        ];
      case "pass_start_bonus":
        return [
          { frequency: 660, duration: 0.08, delay: 0, wave: "triangle" },
          { frequency: 830, duration: 0.08, delay: 0.09, wave: "triangle" },
          { frequency: 990, duration: 0.14, delay: 0.18, wave: "triangle" }
        ];
      case "game_end":
        return [
          { frequency: 392, duration: 0.14, delay: 0, wave: "triangle" },
          { frequency: 523, duration: 0.14, delay: 0.15, wave: "triangle" },
          { frequency: 659, duration: 0.2, delay: 0.3, wave: "triangle" }
        ];
      default:
        return [{ frequency: 440, duration: 0.1, delay: 0 }];
    }
  }
}

export const sfxEngine = new SfxEngine();
