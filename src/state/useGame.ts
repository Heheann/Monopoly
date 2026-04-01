
import { useEffect, useMemo, useRef, useState } from "react";
import {
  addInventoryItem,
  applyPurchaseDiscount,
  buildSettlementRanking,
  calculateRent,
  canAfford,
  consumeInventoryItem,
  countOwnedByGroup,
  createInitialPlayer,
  createInitialPropertyState,
  findPropertyDef,
  getRandomElement,
  getTileByPosition,
  randomDice,
  stepMove
} from "../engine/gameEngine";
import type {
  BoardTile,
  CardDef,
  GameState,
  PaymentNotice,
  PlayerState,
  QuestionCycleState,
  QuestionDef,
  SeedDataBundle,
  ShopItemDef,
  SoundEvent,
  SoundEventType,
  TurnGateState,
  TurnPhase
} from "../types/game";
import { clearRuntimeState, loadRuntimeState, saveRuntimeState } from "./gameStorage";

const MOVEMENT_DELAY = 240;

type SetupPlayer = {
  name: string;
  tokenId: string;
};

type QuizModalPayload = {
  question: QuestionDef;
  source: "turn_gate" | "tile_quiz";
};

type ModalPayload =
  | { tileId: string }
  | { card: CardDef }
  | QuizModalPayload
  | { notice: PaymentNotice }
  | { title: string; message: string }
  | undefined;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function appendLog(log: string[], text: string): string[] {
  return [`${new Date().toLocaleTimeString("zh-TW", { hour12: false })} ${text}`, ...log].slice(0, 80);
}

function shuffle<T>(array: T[]): T[] {
  const clone = [...array];
  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [clone[i], clone[j]] = [clone[j], clone[i]];
  }
  return clone;
}

function createEmptyTurnGateState(): TurnGateState {
  return {
    passed: false,
    questionId: null,
    mode: null
  };
}

function createEmptyQuestionCycle(): QuestionCycleState {
  return {
    remainingIds: [],
    usedIds: []
  };
}

function createEmptyGameState(): GameState {
  return {
    players: [],
    properties: {},
    currentPlayerIndex: 0,
    turn: 1,
    phase: "setup",
    lastDice: null,
    log: ["歡迎來到高雄景點大富翁！請先建立玩家。"],
    modal: { type: null },
    turnGate: createEmptyTurnGateState(),
    questionCycle: createEmptyQuestionCycle(),
    paymentNoticeQueue: [],
    soundQueue: [],
    winnerId: null
  };
}

function normalizeSavedState(saved: GameState | null): GameState {
  const fallback = createEmptyGameState();
  if (!saved) {
    return fallback;
  }

  return {
    ...fallback,
    ...saved,
    turnGate: saved.turnGate ?? fallback.turnGate,
    questionCycle: saved.questionCycle ?? fallback.questionCycle,
    paymentNoticeQueue: saved.paymentNoticeQueue ?? [],
    soundQueue: saved.soundQueue ?? []
  };
}

export function useGame(initialData: SeedDataBundle) {
  const [dataBundle, setDataBundle] = useState<SeedDataBundle>(initialData);
  const [gameState, setGameState] = useState<GameState>(() => normalizeSavedState(loadRuntimeState()));
  const stateRef = useRef(gameState);

  useEffect(() => {
    stateRef.current = gameState;
    if (gameState.phase === "setup") {
      clearRuntimeState();
      return;
    }
    saveRuntimeState(gameState);
  }, [gameState]);

  const boardByPosition = useMemo(() => [...dataBundle.board].sort((a, b) => a.position - b.position), [dataBundle.board]);
  const currentPlayer = gameState.players[gameState.currentPlayerIndex] ?? null;

  const setModal = (type: GameState["modal"]["type"], payload?: ModalPayload) => {
    setGameState((prev) => ({ ...prev, modal: { type, payload } }));
  };

  const setPhase = (phase: TurnPhase) => {
    setGameState((prev) => ({ ...prev, phase }));
  };

  const writeLog = (text: string) => {
    setGameState((prev) => ({ ...prev, log: appendLog(prev.log, text) }));
  };

  const withCurrentPlayer = (updater: (player: PlayerState) => PlayerState) => {
    setGameState((prev) => {
      const player = prev.players[prev.currentPlayerIndex];
      if (!player) return prev;
      const players = [...prev.players];
      players[prev.currentPlayerIndex] = updater(player);
      return { ...prev, players };
    });
  };

  const updatePlayerById = (playerId: string, updater: (player: PlayerState) => PlayerState) => {
    setGameState((prev) => {
      const index = prev.players.findIndex((p) => p.id === playerId);
      if (index < 0) return prev;
      const players = [...prev.players];
      players[index] = updater(players[index]);
      return { ...prev, players };
    });
  };

  const createPaymentNotice = (input: Omit<PaymentNotice, "id">): PaymentNotice => ({
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ...input
  });

  const createSoundEvent = (type: SoundEventType): SoundEvent => ({
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    createdAt: Date.now()
  });

  const enqueueSound = (type: SoundEventType) => {
    setGameState((prev) => ({ ...prev, soundQueue: [...prev.soundQueue, createSoundEvent(type)] }));
  };

  const canPayWithOptionalImmunity = (player: PlayerState, amount: number, allowImmunity = true): boolean => {
    if (amount <= 0) return true;
    return canAfford(player, amount) || (allowImmunity && player.statusEffects.moneyImmunity > 0);
  };

  const getEligibleQuestions = (): QuestionDef[] => {
    const requiredCount = dataBundle.gameConfig.quizConfig.requireOptionsCount;
    return dataBundle.questionBank.filter((question) => question.enabled && question.options.length === requiredCount);
  };

  const pickQuestion = (): QuestionDef | null => {
    const eligible = getEligibleQuestions();
    if (eligible.length === 0) return null;

    const byId = new Map(eligible.map((question) => [question.id, question]));
    const currentCycle = stateRef.current.questionCycle;

    let remaining = currentCycle.remainingIds.filter((id) => byId.has(id));
    let used = currentCycle.usedIds.filter((id) => byId.has(id));
    if (remaining.length === 0) {
      remaining = shuffle(eligible.map((question) => question.id));
      used = [];
    }

    const selectedId = remaining[0];
    const selectedQuestion = byId.get(selectedId) ?? eligible[0];

    setGameState((prev) => ({
      ...prev,
      questionCycle: {
        remainingIds: remaining.slice(1),
        usedIds: [...used, selectedQuestion.id]
      }
    }));

    return selectedQuestion;
  };

  const moveToNextPlayerTurn = () => {
    setGameState((prev) => {
      if (prev.players.length === 0) return prev;
      const nextIndex = (prev.currentPlayerIndex + 1) % prev.players.length;
      const turnInc = nextIndex === 0 ? 1 : 0;
      return {
        ...prev,
        currentPlayerIndex: nextIndex,
        turn: prev.turn + turnInc,
        phase: "await_gate_quiz",
        lastDice: null,
        modal: { type: null },
        turnGate: createEmptyTurnGateState()
      };
    });
  };

  const transferMoney = (fromId: string, toId: string, amount: number, reason: string) => {
    if (amount <= 0) return;

    setGameState((prev) => {
      const payerIndex = prev.players.findIndex((player) => player.id === fromId);
      const receiverIndex = prev.players.findIndex((player) => player.id === toId);
      if (payerIndex < 0 || receiverIndex < 0) {
        return prev;
      }

      const players = [...prev.players];
      const payer = players[payerIndex];
      const receiver = players[receiverIndex];

      if (reason === "租金" && payer.statusEffects.rentImmunity > 0) {
        players[payerIndex] = {
          ...payer,
          statusEffects: { ...payer.statusEffects, rentImmunity: payer.statusEffects.rentImmunity - 1 }
        };

        const notice = createPaymentNotice({
          reason: `${reason}（免付過路費抵銷）`,
          amount,
          payerName: payer.name,
          receiverName: receiver.name,
          payerBefore: payer.money,
          payerAfter: payer.money,
          receiverBefore: receiver.money,
          receiverAfter: receiver.money,
          isSystemReceiver: false,
          isWaived: true
        });

        return {
          ...prev,
          players,
          paymentNoticeQueue: [...prev.paymentNoticeQueue, notice],
          soundQueue: [...prev.soundQueue, createSoundEvent("payment_waived")],
          log: appendLog(prev.log, `${payer.name} 使用免付過路費，免除租金。`)
        };
      }

      if (payer.statusEffects.moneyImmunity > 0) {
        players[payerIndex] = {
          ...payer,
          statusEffects: { ...payer.statusEffects, moneyImmunity: payer.statusEffects.moneyImmunity - 1 }
        };

        const notice = createPaymentNotice({
          reason: `${reason}（免扣錢抵銷）`,
          amount,
          payerName: payer.name,
          receiverName: receiver.name,
          payerBefore: payer.money,
          payerAfter: payer.money,
          receiverBefore: receiver.money,
          receiverAfter: receiver.money,
          isSystemReceiver: false,
          isWaived: true
        });

        return {
          ...prev,
          players,
          paymentNoticeQueue: [...prev.paymentNoticeQueue, notice],
          soundQueue: [...prev.soundQueue, createSoundEvent("payment_waived")],
          log: appendLog(prev.log, `${payer.name} 使用免扣錢效果，抵銷 ${amount} 元。`)
        };
      }

      const payerBefore = payer.money;
      const receiverBefore = receiver.money;
      const payerAfter = payerBefore - amount;
      const receiverAfter = receiverBefore + amount;

      players[payerIndex] = { ...payer, money: payerAfter };
      players[receiverIndex] = { ...receiver, money: receiverAfter };

      const notice = createPaymentNotice({
        reason,
        amount,
        payerName: payer.name,
        receiverName: receiver.name,
        payerBefore,
        payerAfter,
        receiverBefore,
        receiverAfter,
        isSystemReceiver: false,
        isWaived: false
      });

      return {
        ...prev,
        players,
        paymentNoticeQueue: [...prev.paymentNoticeQueue, notice],
        soundQueue: [...prev.soundQueue, createSoundEvent("payment_to_player")],
        log: appendLog(prev.log, `${payer.name} 支付 ${amount} 元給 ${receiver.name}（${reason}）。`)
      };
    });
  };

  const chargeMoney = (playerId: string, amount: number, reason: string, allowImmunity = true) => {
    if (amount <= 0) return;

    setGameState((prev) => {
      const payerIndex = prev.players.findIndex((player) => player.id === playerId);
      if (payerIndex < 0) return prev;

      const players = [...prev.players];
      const payer = players[payerIndex];

      if (allowImmunity && payer.statusEffects.moneyImmunity > 0) {
        players[payerIndex] = {
          ...payer,
          statusEffects: { ...payer.statusEffects, moneyImmunity: payer.statusEffects.moneyImmunity - 1 }
        };

        const notice = createPaymentNotice({
          reason: `${reason}（免扣錢抵銷）`,
          amount,
          payerName: payer.name,
          receiverName: "系統/銀行",
          payerBefore: payer.money,
          payerAfter: payer.money,
          receiverBefore: null,
          receiverAfter: null,
          isSystemReceiver: true,
          isWaived: true
        });

        return {
          ...prev,
          players,
          paymentNoticeQueue: [...prev.paymentNoticeQueue, notice],
          soundQueue: [...prev.soundQueue, createSoundEvent("payment_waived")],
          log: appendLog(prev.log, `${payer.name} 觸發免扣錢，抵銷 ${amount} 元（${reason}）。`)
        };
      }

      const payerBefore = payer.money;
      const payerAfter = payerBefore - amount;
      players[payerIndex] = { ...payer, money: payerAfter };

      const notice = createPaymentNotice({
        reason,
        amount,
        payerName: payer.name,
        receiverName: "系統/銀行",
        payerBefore,
        payerAfter,
        receiverBefore: null,
        receiverAfter: null,
        isSystemReceiver: true,
        isWaived: false
      });

      return {
        ...prev,
        players,
        paymentNoticeQueue: [...prev.paymentNoticeQueue, notice],
        soundQueue: [...prev.soundQueue, createSoundEvent("payment_to_system")],
        log: appendLog(prev.log, `${payer.name} 支出 ${amount} 元（${reason}）。`)
      };
    });
  };

  const addMoney = (playerId: string, amount: number, reason: string) => {
    if (amount <= 0) return;
    updatePlayerById(playerId, (player) => ({ ...player, money: player.money + amount }));
    const player = stateRef.current.players.find((p) => p.id === playerId);
    if (player) writeLog(`${player.name} 獲得 ${amount} 元（${reason}）。`);
  };

  const applySkipTurns = (playerId: string, turns: number, reason: string) => {
    updatePlayerById(playerId, (player) => ({
      ...player,
      statusEffects: { ...player.statusEffects, skipTurns: Math.max(0, player.statusEffects.skipTurns + turns) }
    }));
    const player = stateRef.current.players.find((p) => p.id === playerId);
    if (player) writeLog(`${player.name} ${reason}，將停留 ${turns} 回合。`);
  };

  const resolveLandingTile = async () => {
    const latest = stateRef.current;
    const player = latest.players[latest.currentPlayerIndex];
    if (!player) return;

    const tile = getTileByPosition(boardByPosition, player.position);
    if (!tile) {
      setPhase("await_end");
      return;
    }

    if (tile.type === "property") {
      const propertyState = latest.properties[tile.id];
      const propertyDef = findPropertyDef(tile.id, dataBundle.properties);
      if (!propertyState || !propertyDef) {
        setPhase("await_end");
        return;
      }

      if (!propertyState.ownerId) {
        setModal("property", { tileId: tile.id });
        return;
      }
      if (propertyState.ownerId === player.id) {
        setModal("property", { tileId: tile.id });
        return;
      }

      const owner = latest.players.find((p) => p.id === propertyState.ownerId);
      if (!owner) {
        setPhase("await_end");
        return;
      }

      const rent = calculateRent({
        propertyDef,
        owner,
        allPlayers: latest.players,
        propertiesState: latest.properties,
        allPropertyDefs: dataBundle.properties,
        config: dataBundle.gameConfig
      });

      transferMoney(player.id, owner.id, rent, "租金");
      setPhase("await_end");
      return;
    }

    if (tile.type === "chance" || tile.type === "fate") {
      const deck = tile.type === "chance" ? dataBundle.chanceCards : dataBundle.fateCards;
      const card = getRandomElement(deck);
      writeLog(`${player.name} 抽到 ${tile.type === "chance" ? "驚喜港都" : "在地生活"}卡：${card.title}`);
      enqueueSound("card_draw");
      setModal("card", { card });
      return;
    }

    if (tile.type === "shop") {
      setModal("shop", { tileId: tile.id });
      return;
    }

    if (tile.type === "quiz") {
      const question = pickQuestion();
      if (!question) {
        writeLog("目前題庫沒有可用題目，略過題目格效果。");
        setPhase("await_end");
        return;
      }
      setGameState((prev) => ({ ...prev, turnGate: { ...prev.turnGate, mode: "tile_quiz" } }));
      setModal("quiz", { question, source: "tile_quiz" });
      return;
    }

    if (tile.type === "traffic_jam") {
      applySkipTurns(player.id, 1, "因交通壅塞");
      setPhase("await_end");
      return;
    }
    if (tile.type === "rest") {
      applySkipTurns(player.id, 1, "在壽山看夜景休息");
      setPhase("await_end");
      return;
    }
    if (tile.type === "go_to_jam") {
      writeLog(`${player.name} 趕不上輕軌，直接前往過港隧道。`);
      setGameState((prev) => {
        const players = [...prev.players];
        players[prev.currentPlayerIndex] = {
          ...players[prev.currentPlayerIndex],
          position: 6,
          statusEffects: {
            ...players[prev.currentPlayerIndex].statusEffects,
            skipTurns: players[prev.currentPlayerIndex].statusEffects.skipTurns + 1
          }
        };
        return { ...prev, players };
      });
      setPhase("await_end");
      return;
    }

    writeLog(tile.type === "start" ? `${player.name} 抵達起點，整裝再出發。` : `${player.name} 抵達 ${tile.name}。`);
    setPhase("await_end");
  };

  const moveCurrentPlayer = async (steps: number, reason: string) => {
    if (!Number.isFinite(steps) || steps === 0) {
      await resolveLandingTile();
      return;
    }

    const boardSize = boardByPosition.length;
    const direction = steps > 0 ? 1 : -1;
    let remaining = Math.abs(steps);

    setPhase("moving");
    while (remaining > 0) {
      await sleep(MOVEMENT_DELAY);
      setGameState((prev) => {
        const players = [...prev.players];
        const current = players[prev.currentPlayerIndex];
        if (!current) return prev;

        const movement = stepMove(current.position, direction, boardSize);
        let money = current.money;
        if (direction > 0 && movement.passedStart) money += dataBundle.gameConfig.startBonus;

        players[prev.currentPlayerIndex] = { ...current, position: movement.next, money };
        return {
          ...prev,
          players,
          soundQueue:
            direction > 0 && movement.passedStart
              ? [...prev.soundQueue, createSoundEvent("pass_start_bonus")]
              : prev.soundQueue,
          log:
            direction > 0 && movement.passedStart
              ? appendLog(prev.log, `${current.name} 經過起點，領取 ${dataBundle.gameConfig.startBonus} 元旅遊津貼。`)
              : prev.log
        };
      });
      remaining -= 1;
    }

    writeLog(`${stateRef.current.players[stateRef.current.currentPlayerIndex]?.name ?? "玩家"} 完成移動（${reason}）。`);
    setPhase("resolving");
    await sleep(160);
    await resolveLandingTile();
  };

  const rollDice = async (forced?: number) => {
    const latest = stateRef.current;
    if (latest.phase !== "await_roll") return;

    const player = latest.players[latest.currentPlayerIndex];
    if (!player) return;

    let dice = forced ?? player.statusEffects.fixedDice ?? randomDice();
    if (dice < 1 || dice > 6) dice = randomDice();

    setGameState((prev) => {
      const players = [...prev.players];
      const current = players[prev.currentPlayerIndex];
      players[prev.currentPlayerIndex] = {
        ...current,
        statusEffects: { ...current.statusEffects, fixedDice: null }
      };
      return {
        ...prev,
        players,
        phase: "moving",
        lastDice: dice,
        soundQueue: [...prev.soundQueue, createSoundEvent("dice_roll")],
        log: appendLog(prev.log, `${current.name} 擲出 ${dice} 點。`)
      };
    });

    await moveCurrentPlayer(dice, "擲骰");
  };

  const endTurn = () => {
    const latest = stateRef.current;
    if (latest.phase === "setup" || latest.phase === "moving") return;
    moveToNextPlayerTurn();
  };

  useEffect(() => {
    if (gameState.phase !== "await_gate_quiz") return;
    const player = gameState.players[gameState.currentPlayerIndex];
    if (!player) return;

    if (player.statusEffects.skipTurns > 0) {
      const timer = window.setTimeout(() => {
        setGameState((prev) => {
          const players = [...prev.players];
          const current = players[prev.currentPlayerIndex];
          players[prev.currentPlayerIndex] = {
            ...current,
            statusEffects: { ...current.statusEffects, skipTurns: Math.max(0, current.statusEffects.skipTurns - 1) }
          };
          const nextIndex = (prev.currentPlayerIndex + 1) % prev.players.length;
          const turnInc = nextIndex === 0 ? 1 : 0;
          return {
            ...prev,
            players,
            currentPlayerIndex: nextIndex,
            turn: prev.turn + turnInc,
            phase: "await_gate_quiz",
            lastDice: null,
            modal: { type: null },
            turnGate: createEmptyTurnGateState(),
            log: appendLog(prev.log, `${current.name} 因停留效果，本回合跳過。`)
          };
        });
      }, 800);

      return () => window.clearTimeout(timer);
    }

    if (!dataBundle.gameConfig.quizConfig.turnGateEnabled) {
      setGameState((prev) => ({ ...prev, phase: "await_roll", turnGate: { passed: true, questionId: null, mode: null } }));
      return;
    }

    if (gameState.modal.type === "quiz" && gameState.turnGate.mode === "turn_gate") return;
    if (gameState.turnGate.passed) {
      setPhase("await_roll");
      return;
    }

    const question = pickQuestion();
    if (!question) {
      writeLog("目前沒有可用題目，已略過回合門檻。");
      setGameState((prev) => ({ ...prev, phase: "await_roll", turnGate: { passed: true, questionId: null, mode: null } }));
      return;
    }

    setGameState((prev) => ({
      ...prev,
      modal: { type: "quiz", payload: { question, source: "turn_gate" } },
      turnGate: { passed: false, questionId: question.id, mode: "turn_gate" },
      log: appendLog(prev.log, `${player.name} 本回合開始前需先答題。`)
    }));
  }, [gameState.phase, gameState.currentPlayerIndex, gameState.players, gameState.modal.type, gameState.turnGate, dataBundle]);

  useEffect(() => {
    if (gameState.modal.type !== null) return;
    if (gameState.paymentNoticeQueue.length === 0) return;
    if (gameState.phase === "await_gate_quiz" && !gameState.turnGate.passed) return;

    setGameState((prev) => {
      if (prev.modal.type !== null) return prev;
      if (prev.paymentNoticeQueue.length === 0) return prev;
      if (prev.phase === "await_gate_quiz" && !prev.turnGate.passed) return prev;
      return {
        ...prev,
        modal: { type: "payment_notice", payload: { notice: prev.paymentNoticeQueue[0] } }
      };
    });
  }, [gameState.modal.type, gameState.paymentNoticeQueue, gameState.phase, gameState.turnGate.passed]);

  const startGame = (playersSetup: SetupPlayer[]) => {
    const players = playersSetup.map((setup, index) => {
      const token = dataBundle.gameConfig.tokens.find((item) => item.id === setup.tokenId) ?? dataBundle.gameConfig.tokens[index];
      return createInitialPlayer(`p${index + 1}`, setup.name.trim() || `玩家 ${index + 1}`, token, dataBundle.gameConfig.initialMoney);
    });

    const eligible = getEligibleQuestions();
    setGameState({
      players,
      properties: createInitialPropertyState(dataBundle.properties),
      currentPlayerIndex: 0,
      turn: 1,
      phase: "await_gate_quiz",
      lastDice: null,
      log: [`遊戲開始！共 ${players.length} 位玩家。`],
      modal: { type: null },
      turnGate: createEmptyTurnGateState(),
      questionCycle: { remainingIds: shuffle(eligible.map((question) => question.id)), usedIds: [] },
      paymentNoticeQueue: [],
      soundQueue: [],
      winnerId: null
    });
  };

  const restartGame = () => {
    clearRuntimeState();
    setGameState(createEmptyGameState());
  };

  const finishGameAndSettle = () => {
    const latest = stateRef.current;
    if (latest.phase === "setup" || latest.players.length === 0) return;

    const ranking = buildSettlementRanking({
      players: latest.players,
      propertiesState: latest.properties,
      propertyDefs: dataBundle.properties
    });
    const champion = ranking[0];

    const nextState: GameState = {
      ...latest,
      phase: "game_over",
      winnerId: champion?.playerId ?? null,
      modal: { type: null },
      paymentNoticeQueue: [],
      soundQueue: [...latest.soundQueue, createSoundEvent("game_end")],
      turnGate: { ...latest.turnGate, mode: null },
      log: appendLog(latest.log, `遊戲已手動結束，冠軍為 ${champion?.name ?? "無"}。`)
    };

    stateRef.current = nextState;
    saveRuntimeState(nextState);
    setGameState(nextState);
  };

  const buyCurrentTileProperty = () => {
    const latest = stateRef.current;
    const player = latest.players[latest.currentPlayerIndex];
    const tile = getTileByPosition(boardByPosition, player.position);
    if (!player || tile.type !== "property") return;

    const propertyDef = findPropertyDef(tile.id, dataBundle.properties);
    const state = latest.properties[tile.id];
    if (!propertyDef || !state || state.ownerId) return;

    const { finalPrice, consumedDiscount } = applyPurchaseDiscount(propertyDef.price, player);
    const willWaiveByImmunity = finalPrice > 0 && player.statusEffects.moneyImmunity > 0;
    if (!canPayWithOptionalImmunity(player, finalPrice, true)) {
      writeLog(`${player.name} 資金不足，無法購買 ${tile.name}。`);
      setModal(null);
      setPhase("await_end");
      return;
    }

    if (finalPrice > 0) {
      chargeMoney(player.id, finalPrice, `購買景點：${tile.name}`, true);
    }

    setGameState((prev) => {
      const players = [...prev.players];
      const current = players[prev.currentPlayerIndex];
      players[prev.currentPlayerIndex] = {
        ...current,
        ownedProperties: [...current.ownedProperties, tile.id],
        statusEffects: {
          ...current.statusEffects,
          landDiscountNext: consumedDiscount > 0 ? 0 : current.statusEffects.landDiscountNext
        }
      };

      return {
        ...prev,
        players,
        properties: { ...prev.properties, [tile.id]: { ...prev.properties[tile.id], ownerId: current.id, level: 0 } },
        modal: { type: null },
        phase: "await_end",
        soundQueue: [...prev.soundQueue, createSoundEvent("property_buy")],
        log: appendLog(
          prev.log,
          consumedDiscount > 0
            ? willWaiveByImmunity
              ? `${current.name} 以折價 ${finalPrice} 元買下 ${tile.name}（折抵 ${consumedDiscount}，本次費用由免扣錢抵銷）。`
              : `${current.name} 以折價 ${finalPrice} 元買下 ${tile.name}（折抵 ${consumedDiscount}）。`
            : willWaiveByImmunity
              ? `${current.name} 買下 ${tile.name}（本次費用由免扣錢抵銷）。`
              : `${current.name} 買下 ${tile.name}，花費 ${finalPrice} 元。`
        )
      };
    });
  };

  const upgradeCurrentTileProperty = () => {
    const latest = stateRef.current;
    const player = latest.players[latest.currentPlayerIndex];
    const tile = getTileByPosition(boardByPosition, player.position);
    if (!player || tile.type !== "property") return;

    const propertyDef = findPropertyDef(tile.id, dataBundle.properties);
    const propertyState = latest.properties[tile.id];
    if (!propertyDef || !propertyState || propertyState.ownerId !== player.id) return;

    if (propertyState.level >= 3) {
      writeLog(`${tile.name} 已達最高等級。`);
      setModal(null);
      setPhase("await_end");
      return;
    }

    const upgradeCost = propertyDef.upgradeCosts[propertyState.level] ?? 0;
    const useFreeUpgrade = player.statusEffects.freeUpgrade > 0;
    const finalCost = useFreeUpgrade ? 0 : upgradeCost;
    const willWaiveByImmunity = !useFreeUpgrade && finalCost > 0 && player.statusEffects.moneyImmunity > 0;

    if (!canPayWithOptionalImmunity(player, finalCost, true)) {
      writeLog(`${player.name} 資金不足，無法升級 ${tile.name}。`);
      setModal(null);
      setPhase("await_end");
      return;
    }

    if (finalCost > 0) {
      chargeMoney(player.id, finalCost, `升級景點：${tile.name}`, true);
    }

    setGameState((prev) => {
      const players = [...prev.players];
      const current = players[prev.currentPlayerIndex];
      players[prev.currentPlayerIndex] = {
        ...current,
        statusEffects: {
          ...current.statusEffects,
          freeUpgrade: useFreeUpgrade ? current.statusEffects.freeUpgrade - 1 : current.statusEffects.freeUpgrade
        }
      };
      return {
        ...prev,
        players,
        properties: { ...prev.properties, [tile.id]: { ...prev.properties[tile.id], level: prev.properties[tile.id].level + 1 } },
        modal: { type: null },
        phase: "await_end",
        soundQueue: [...prev.soundQueue, createSoundEvent("property_upgrade")],
        log: appendLog(
          prev.log,
          useFreeUpgrade
            ? `${current.name} 使用免費升級，將 ${tile.name} 升至 Lv.${prev.properties[tile.id].level + 1}。`
            : willWaiveByImmunity
              ? `${current.name} 升級 ${tile.name}（本次費用由免扣錢抵銷）。`
              : `${current.name} 升級 ${tile.name}，花費 ${finalCost} 元。`
        )
      };
    });
  };

  const skipModal = () => {
    if (stateRef.current.turnGate.mode === "turn_gate" && stateRef.current.modal.type === "quiz") return;
    setModal(null);
    if (stateRef.current.phase === "resolving") setPhase("await_end");
  };

  const acknowledgePaymentNotice = () => {
    setGameState((prev) => {
      if (prev.paymentNoticeQueue.length === 0) {
        return { ...prev, modal: { type: null } };
      }

      const [, ...restQueue] = prev.paymentNoticeQueue;
      const canShowNextImmediately = !(prev.phase === "await_gate_quiz" && !prev.turnGate.passed);
      const nextModal =
        restQueue.length > 0 && canShowNextImmediately
          ? ({ type: "payment_notice", payload: { notice: restQueue[0] } } as const)
          : ({ type: null } as const);

      return {
        ...prev,
        paymentNoticeQueue: restQueue,
        modal: nextModal
      };
    });
  };

  const acknowledgeSound = () => {
    setGameState((prev) => {
      if (prev.soundQueue.length === 0) return prev;
      return {
        ...prev,
        soundQueue: prev.soundQueue.slice(1)
      };
    });
  };

  const buyShopItem = (item: ShopItemDef) => {
    const latest = stateRef.current;
    const player = latest.players[latest.currentPlayerIndex];
    if (!player) return;

    const currentCount = player.inventory[item.id] ?? 0;
    const willWaiveByImmunity = item.price > 0 && player.statusEffects.moneyImmunity > 0;
    if (currentCount >= item.maxCarry) {
      writeLog(`${item.name} 已達攜帶上限。`);
      return;
    }
    if (!canPayWithOptionalImmunity(player, item.price, true)) {
      writeLog(`${player.name} 金額不足，無法購買 ${item.name}。`);
      return;
    }

    if (item.price > 0) {
      chargeMoney(player.id, item.price, `商店購買：${item.name}`, true);
    }

    setGameState((prev) => {
      const players = [...prev.players];
      const current = players[prev.currentPlayerIndex];
      players[prev.currentPlayerIndex] = addInventoryItem(current, item);
      return {
        ...prev,
        players,
        soundQueue: [...prev.soundQueue, createSoundEvent("shop_buy")],
        log: appendLog(
          prev.log,
          willWaiveByImmunity
            ? `${current.name} 在商店購買 ${item.name}（費用由免扣錢抵銷）。`
            : `${current.name} 在商店購買 ${item.name}（-${item.price}）。`
        )
      };
    });
  };

  const applyCard = async () => {
    const modalPayload = stateRef.current.modal.payload as { card: CardDef } | undefined;
    if (!modalPayload?.card) return;

    const card = modalPayload.card;
    const player = stateRef.current.players[stateRef.current.currentPlayerIndex];
    if (!player) return;
    setModal(null);

    switch (card.effectType) {
      case "MOVE_STEPS":
        await moveCurrentPlayer(card.effectValue, "卡牌移動");
        return;
      case "MONEY":
        if (card.effectValue >= 0) addMoney(player.id, card.effectValue, `卡牌：${card.title}`);
        else chargeMoney(player.id, Math.abs(card.effectValue), `卡牌：${card.title}`, true);
        setPhase("await_end");
        return;
      case "SKIP_TURNS":
        applySkipTurns(player.id, card.effectValue, "受到卡牌影響");
        setPhase("await_end");
        return;
      case "MOVE_TO_TILE": {
        const boardSize = boardByPosition.length;
        const targetPos = card.effectValue;
        const forwardSteps = targetPos >= player.position ? targetPos - player.position : boardSize - player.position + targetPos;
        await moveCurrentPlayer(forwardSteps, "卡牌指定移動");
        return;
      }
      case "RENT_IMMUNITY":
        withCurrentPlayer((current) => ({
          ...current,
          statusEffects: { ...current.statusEffects, rentImmunity: current.statusEffects.rentImmunity + card.effectValue }
        }));
        writeLog(`${player.name} 獲得免租效果 x${card.effectValue}。`);
        setPhase("await_end");
        return;
      case "DRAW_AGAIN": {
        const deck = card.type === "chance" ? dataBundle.chanceCards : dataBundle.fateCards;
        const drawAgainCard = getRandomElement(deck);
        enqueueSound("card_draw");
        setModal("card", { card: drawAgainCard });
        writeLog(`${player.name} 觸發再抽卡：${drawAgainCard.title}`);
        return;
      }
      case "MONEY_IMMUNITY":
        withCurrentPlayer((current) => ({
          ...current,
          statusEffects: { ...current.statusEffects, moneyImmunity: current.statusEffects.moneyImmunity + card.effectValue }
        }));
        writeLog(`${player.name} 獲得免扣錢效果 x${card.effectValue}。`);
        setPhase("await_end");
        return;
      case "QUIZ_SHIELD":
        withCurrentPlayer((current) => ({
          ...current,
          statusEffects: { ...current.statusEffects, quizShield: current.statusEffects.quizShield + card.effectValue }
        }));
        writeLog(`${player.name} 獲得題目保護效果 x${card.effectValue}。`);
        setPhase("await_end");
        return;
      default:
        setPhase("await_end");
    }
  };

  const answerQuestion = async (answerIndex: number) => {
    const payload = stateRef.current.modal.payload as QuizModalPayload | undefined;
    const question = payload?.question;
    const player = stateRef.current.players[stateRef.current.currentPlayerIndex];
    if (!question || !player) return;

    const source = payload.source;
    const isCorrect = answerIndex === question.answerIndex;
    setModal(null);

    if (source === "turn_gate") {
      if (isCorrect) {
        enqueueSound("quiz_correct");
        writeLog(`${player.name} 答對回合題目，取得行動資格。`);
        setGameState((prev) => ({ ...prev, phase: "await_roll", turnGate: { passed: true, questionId: question.id, mode: null } }));
        return;
      }

      enqueueSound("quiz_wrong");
      if (player.statusEffects.quizShield > 0) {
        withCurrentPlayer((current) => ({
          ...current,
          statusEffects: { ...current.statusEffects, quizShield: current.statusEffects.quizShield - 1 }
        }));
        writeLog(`${player.name} 答錯但使用題目保護卡，仍可開始本回合行動。`);
        setGameState((prev) => ({ ...prev, phase: "await_roll", turnGate: { passed: true, questionId: question.id, mode: null } }));
        return;
      }

      writeLog(`${player.name} 回合題目答錯，本回合行動失敗並結束。`);
      if (question.penalty.money < 0) chargeMoney(player.id, Math.abs(question.penalty.money), "回合題目答錯", true);
      if (question.penalty.skipTurns > 0) applySkipTurns(player.id, question.penalty.skipTurns, "回合題目懲罰");
      moveToNextPlayerTurn();
      return;
    }

    if (isCorrect) {
      enqueueSound("quiz_correct");
      writeLog(`${player.name} 答對題目：${question.question}`);
      if (question.reward.money > 0) addMoney(player.id, question.reward.money, "答題獎勵");
      if (question.reward.skipTurns > 0) applySkipTurns(player.id, question.reward.skipTurns, "答題效果");
      if (question.reward.moveSteps !== 0) {
        await moveCurrentPlayer(question.reward.moveSteps, "答題獎勵移動");
        return;
      }
      setGameState((prev) => ({ ...prev, turnGate: { ...prev.turnGate, mode: null } }));
      setPhase("await_end");
      return;
    }

    enqueueSound("quiz_wrong");
    if (player.statusEffects.quizShield > 0) {
      withCurrentPlayer((current) => ({
        ...current,
        statusEffects: { ...current.statusEffects, quizShield: current.statusEffects.quizShield - 1 }
      }));
      writeLog(`${player.name} 答錯但使用題目保護卡，免罰。`);
      setGameState((prev) => ({ ...prev, turnGate: { ...prev.turnGate, mode: null } }));
      setPhase("await_end");
      return;
    }

    writeLog(`${player.name} 答錯題目：${question.question}`);
    if (question.penalty.money < 0) chargeMoney(player.id, Math.abs(question.penalty.money), "答題懲罰", true);
    if (question.penalty.skipTurns > 0) applySkipTurns(player.id, question.penalty.skipTurns, "答題懲罰");
    if (question.penalty.moveSteps !== 0) {
      await moveCurrentPlayer(question.penalty.moveSteps, "答題懲罰移動");
      return;
    }
    setGameState((prev) => ({ ...prev, turnGate: { ...prev.turnGate, mode: null } }));
    setPhase("await_end");
  };

  const useInventoryItem = async (itemId: string) => {
    const latest = stateRef.current;
    const player = latest.players[latest.currentPlayerIndex];
    if (!player) return;

    const item = dataBundle.shopItems.find((entry) => entry.id === itemId);
    if (!item || (player.inventory[item.id] ?? 0) <= 0) return;

    const validOwnTurn = latest.phase === "await_roll" || latest.phase === "await_end";
    if (!validOwnTurn && item.effect.kind !== "REMOVE_STUCK") {
      writeLog("目前時機無法使用此道具。");
      return;
    }

    const consumeCurrentItem = () => {
      setGameState((prev) => {
        const players = [...prev.players];
        players[prev.currentPlayerIndex] = consumeInventoryItem(players[prev.currentPlayerIndex], item.id);
        return { ...prev, players };
      });
    };

    switch (item.effect.kind) {
      case "REROLL":
        if (latest.phase !== "await_roll") {
          writeLog("重擲骰子需在擲骰前使用。");
          return;
        }
        consumeCurrentItem();
        writeLog(`${player.name} 使用 ${item.name}，立即擲骰。`);
        await rollDice();
        return;
      case "FIXED_DICE": {
        if (latest.phase !== "await_roll") {
          writeLog("指定骰子點數需在擲骰前使用。");
          return;
        }
        const input = window.prompt("請輸入指定骰子點數（1-6）：", "6");
        const value = Number(input);
        if (!Number.isInteger(value) || value < 1 || value > 6) {
          writeLog("指定點數無效，已取消使用。");
          return;
        }
        consumeCurrentItem();
        withCurrentPlayer((current) => ({ ...current, statusEffects: { ...current.statusEffects, fixedDice: value } }));
        writeLog(`${player.name} 設定本回合骰子點數為 ${value}。`);
        return;
      }
      case "RENT_IMMUNITY":
        consumeCurrentItem();
        withCurrentPlayer((current) => ({
          ...current,
          statusEffects: { ...current.statusEffects, rentImmunity: current.statusEffects.rentImmunity + item.effect.value }
        }));
        writeLog(`${player.name} 使用 ${item.name}。`);
        return;
      case "MONEY_IMMUNITY":
        consumeCurrentItem();
        withCurrentPlayer((current) => ({
          ...current,
          statusEffects: { ...current.statusEffects, moneyImmunity: current.statusEffects.moneyImmunity + item.effect.value }
        }));
        writeLog(`${player.name} 使用 ${item.name}。`);
        return;
      case "MOVE_STEPS":
        consumeCurrentItem();
        writeLog(`${player.name} 使用 ${item.name}，開始移動。`);
        await moveCurrentPlayer(item.effect.value, "道具移動");
        return;
      case "LAND_DISCOUNT":
        consumeCurrentItem();
        withCurrentPlayer((current) => ({
          ...current,
          statusEffects: {
            ...current.statusEffects,
            landDiscountNext: Math.max(current.statusEffects.landDiscountNext, item.effect.value)
          }
        }));
        writeLog(`${player.name} 使用土地折價券，下次購地折抵 ${item.effect.value}。`);
        return;
      case "FREE_UPGRADE":
        consumeCurrentItem();
        withCurrentPlayer((current) => ({
          ...current,
          statusEffects: { ...current.statusEffects, freeUpgrade: current.statusEffects.freeUpgrade + item.effect.value }
        }));
        writeLog(`${player.name} 使用免費升級券，可於下次升級免付費。`);
        return;
      case "REMOVE_STUCK":
        consumeCurrentItem();
        withCurrentPlayer((current) => ({ ...current, statusEffects: { ...current.statusEffects, skipTurns: 0 } }));
        writeLog(`${player.name} 使用解困卡，停留狀態解除。`);
        return;
      case "QUIZ_SHIELD":
        consumeCurrentItem();
        withCurrentPlayer((current) => ({
          ...current,
          statusEffects: { ...current.statusEffects, quizShield: current.statusEffects.quizShield + item.effect.value }
        }));
        writeLog(`${player.name} 使用題目保護卡。`);
        return;
      default:
        return;
    }
  };

  const reloadData = (bundle: SeedDataBundle) => {
    setDataBundle(bundle);
    restartGame();
  };

  const getPropertyOverview = (tile: BoardTile) => {
    if (tile.type !== "property") return null;
    const state = gameState.properties[tile.id];
    if (!state) return null;
    const owner = gameState.players.find((player) => player.id === state.ownerId);
    const propertyDef = findPropertyDef(tile.id, dataBundle.properties);
    if (!propertyDef) return null;
    const ownerGroupCount = owner ? countOwnedByGroup(owner.id, propertyDef.group, dataBundle.properties, gameState.properties) : 0;
    return { state, owner, propertyDef, ownerGroupCount };
  };

  return {
    dataBundle,
    setDataBundle,
    gameState,
    board: boardByPosition,
    currentPlayer,
    startGame,
    restartGame,
    finishGameAndSettle,
    rollDice,
    endTurn,
    buyCurrentTileProperty,
    upgradeCurrentTileProperty,
    skipModal,
    acknowledgePaymentNotice,
    acknowledgeSound,
    buyShopItem,
    applyCard,
    answerQuestion,
    useInventoryItem,
    reloadData,
    getPropertyOverview
  };
}
