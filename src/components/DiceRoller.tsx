import { useEffect, useRef, useState } from "react";

export interface DiceRollerProps {
  disabled?: boolean;
  durationMs?: number;
  forcedResult?: number;
  lastValue?: number | null;
  onRollStart?: () => void;
  onRollComplete: (value: number) => void | Promise<void>;
}

const DICE_FACES = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
const ROLL_INTERVAL_MS = 70;
const BOUNCE_MS = 260;

function randomDice(): number {
  return Math.floor(Math.random() * 6) + 1;
}

function normalizeDice(value?: number): number | undefined {
  if (!Number.isInteger(value)) return undefined;
  if (value === undefined) return undefined;
  if (value < 1 || value > 6) return undefined;
  return value;
}

export function DiceRoller({
  disabled = false,
  durationMs = 1000,
  forcedResult,
  lastValue,
  onRollStart,
  onRollComplete
}: DiceRollerProps) {
  const [displayValue, setDisplayValue] = useState<number>(lastValue ?? 1);
  const [isRolling, setIsRolling] = useState(false);
  const [isBouncing, setIsBouncing] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const finishTimerRef = useRef<number | null>(null);
  const bounceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isRolling && lastValue && lastValue >= 1 && lastValue <= 6) {
      setDisplayValue(lastValue);
    }
  }, [isRolling, lastValue]);

  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
      if (finishTimerRef.current !== null) window.clearTimeout(finishTimerRef.current);
      if (bounceTimerRef.current !== null) window.clearTimeout(bounceTimerRef.current);
    };
  }, []);

  const startRoll = () => {
    if (disabled || isRolling) return;

    const finalValue = normalizeDice(forcedResult) ?? randomDice();
    setIsRolling(true);
    setIsBouncing(false);
    onRollStart?.();

    if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(() => {
      setDisplayValue(randomDice());
    }, ROLL_INTERVAL_MS);

    if (finishTimerRef.current !== null) window.clearTimeout(finishTimerRef.current);
    finishTimerRef.current = window.setTimeout(() => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setDisplayValue(finalValue);
      setIsRolling(false);
      setIsBouncing(true);

      if (bounceTimerRef.current !== null) window.clearTimeout(bounceTimerRef.current);
      bounceTimerRef.current = window.setTimeout(() => {
        setIsBouncing(false);
      }, BOUNCE_MS);

      void onRollComplete(finalValue);
    }, durationMs);
  };

  return (
    <div className="dice-roller">
      <div className={`dice-display${isRolling ? " is-rolling" : ""}${isBouncing ? " is-bouncing" : ""}`}>
        <span className="dice-number">{displayValue}</span>
        <span className="dice-face" aria-hidden="true">
          {DICE_FACES[displayValue - 1]}
        </span>
      </div>

      <button type="button" className="dice-roll-btn" onClick={startRoll} disabled={disabled || isRolling}>
        {isRolling ? "投骰中..." : "投骰子"}
      </button>

      <p className="dice-result-text">{isRolling ? "骰子滾動中..." : `最終點數：${lastValue ?? displayValue}`}</p>
    </div>
  );
}

