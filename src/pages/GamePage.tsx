import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Board } from "../components/Board";
import { EventLog } from "../components/EventLog";
import { InventoryPanel } from "../components/InventoryPanel";
import { MonopolyPopup } from "../components/MonopolyPopup";
import { PlayerPanel } from "../components/PlayerPanel";
import { SetupPanel } from "../components/SetupPanel";
import { sfxEngine } from "../audio/sfxEngine";
import { findPropertyDef } from "../engine/gameEngine";
import { loadDataBundle } from "../state/dataStore";
import { useGame } from "../state/useGame";
import type { BoardTile, CardDef, PaymentNotice, QuestionDef, ShopItemDef } from "../types/game";
import { getLandmarkImageSrc } from "../ui/popupAssets";

export function GamePage() {
  const navigate = useNavigate();
  const game = useGame(loadDataBundle());
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const lastAutoReadQuestionIdRef = useRef<string | null>(null);
  const activeSoundIdRef = useRef<string | null>(null);
  const ttsSupported =
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance !== "undefined";
  const [ttsEnabled, setTtsEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const raw = window.localStorage.getItem("kaohsiung_quiz_tts_enabled");
    return raw === null ? true : raw === "true";
  });
  const [ttsRate, setTtsRate] = useState<number>(() => {
    if (typeof window === "undefined") return 1;
    const raw = Number(window.localStorage.getItem("kaohsiung_quiz_tts_rate") ?? "1");
    if (!Number.isFinite(raw)) return 1;
    return Math.min(1.4, Math.max(0.7, raw));
  });
  const [ttsSpeaking, setTtsSpeaking] = useState(false);
  const [sfxEnabled, setSfxEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const raw = window.localStorage.getItem("kaohsiung_sfx_enabled");
    return raw === null ? true : raw === "true";
  });
  const [sfxVolume, setSfxVolume] = useState<number>(() => {
    if (typeof window === "undefined") return 0.7;
    const raw = Number(window.localStorage.getItem("kaohsiung_sfx_volume") ?? "0.7");
    if (!Number.isFinite(raw)) return 0.7;
    return Math.min(1, Math.max(0, raw));
  });
  const [showEndGameConfirm, setShowEndGameConfirm] = useState(false);

  const currentPlayer = game.currentPlayer;
  const currentTile = currentPlayer
    ? game.board.find((tile) => tile.position === currentPlayer.position)
    : null;

  const propertyModalPayload = game.gameState.modal.payload as { tileId: string } | undefined;
  const cardModalPayload = game.gameState.modal.payload as { card: CardDef } | undefined;
  const quizModalPayload = game.gameState.modal.payload as
    | { question: QuestionDef; source: "turn_gate" | "tile_quiz" }
    | undefined;
  const paymentModalPayload = game.gameState.modal.payload as { notice: PaymentNotice } | undefined;
  const messageModalPayload = game.gameState.modal.payload as { title: string; message: string } | undefined;
  const boardByName = useMemo(() => new Map(game.board.map((tile) => [tile.name, tile])), [game.board]);
  const currentPlayerName = currentPlayer?.name ?? "玩家";
  const currentPlayerToken = currentPlayer?.tokenIcon ?? "🙂";

  const resolvePaymentTile = useCallback(
    (notice?: PaymentNotice): BoardTile | null => {
      if (!notice?.reason) return null;
      const directMatch = notice.reason.match(/^租金：(.+)$/);
      if (directMatch) {
        return boardByName.get(directMatch[1]) ?? null;
      }
      return null;
    },
    [boardByName]
  );

  const resolveMessageTile = useCallback(
    (title?: string): BoardTile | null => {
      if (!title) return null;
      const directMatch = title.match(/^抵達：(.+)$/);
      if (!directMatch) return null;
      return boardByName.get(directMatch[1]) ?? null;
    },
    [boardByName]
  );

  const stopQuizTts = useCallback(() => {
    if (!ttsSupported) return;
    window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setTtsSpeaking(false);
  }, [ttsSupported]);

  const speakQuizQuestion = useCallback(
    (question: QuestionDef, force = false) => {
      if (!ttsSupported) return;
      if (!force && !ttsEnabled) return;

      const optionsText = question.options
        .map((option, index) => `選項 ${String.fromCharCode(65 + index)}，${option}。`)
        .join(" ");
      const speechText = `請聽題。${question.question}。${optionsText}`;

      window.speechSynthesis.cancel();
      const utterance = new window.SpeechSynthesisUtterance(speechText);
      utterance.lang = "zh-TW";
      utterance.rate = ttsRate;
      utterance.pitch = 1;
      utterance.volume = 1;

      const voices = window.speechSynthesis.getVoices();
      const preferredVoice =
        voices.find((voice) => voice.lang.toLowerCase().startsWith("zh-tw")) ??
        voices.find((voice) => voice.lang.toLowerCase().startsWith("zh"));
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      utterance.onend = () => {
        setTtsSpeaking(false);
      };
      utterance.onerror = () => {
        setTtsSpeaking(false);
      };

      utteranceRef.current = utterance;
      setTtsSpeaking(true);
      window.speechSynthesis.speak(utterance);
    },
    [ttsEnabled, ttsRate, ttsSupported]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("kaohsiung_quiz_tts_enabled", String(ttsEnabled));
  }, [ttsEnabled]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("kaohsiung_quiz_tts_rate", String(ttsRate));
  }, [ttsRate]);

  useEffect(() => {
    sfxEngine.setEnabled(sfxEnabled);
    if (typeof window === "undefined") return;
    window.localStorage.setItem("kaohsiung_sfx_enabled", String(sfxEnabled));
  }, [sfxEnabled]);

  useEffect(() => {
    sfxEngine.setVolume(sfxVolume);
    if (typeof window === "undefined") return;
    window.localStorage.setItem("kaohsiung_sfx_volume", String(sfxVolume));
  }, [sfxVolume]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const unlockAudio = () => {
      void sfxEngine.unlock();
    };
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
    };
  }, []);

  useEffect(() => {
    const nextSound = game.gameState.soundQueue[0];
    if (!nextSound) {
      activeSoundIdRef.current = null;
      return;
    }
    if (activeSoundIdRef.current === nextSound.id) return;

    activeSoundIdRef.current = nextSound.id;
    let cancelled = false;
    void sfxEngine.play(nextSound.type).finally(() => {
      if (!cancelled) {
        activeSoundIdRef.current = null;
        game.acknowledgeSound();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [game.gameState.soundQueue, game.acknowledgeSound]);

  useEffect(() => {
    if (game.gameState.modal.type !== "quiz" || !quizModalPayload?.question) {
      lastAutoReadQuestionIdRef.current = null;
      stopQuizTts();
      return;
    }

    if (!ttsEnabled) return;
    if (lastAutoReadQuestionIdRef.current === quizModalPayload.question.id) return;

    lastAutoReadQuestionIdRef.current = quizModalPayload.question.id;
    speakQuizQuestion(quizModalPayload.question, true);
  }, [game.gameState.modal.type, quizModalPayload?.question, speakQuizQuestion, stopQuizTts, ttsEnabled]);

  useEffect(() => {
    return () => {
      if (!ttsSupported) return;
      window.speechSynthesis.cancel();
    };
  }, [ttsSupported]);

  const handleAnswer = (answerIndex: number) => {
    stopQuizTts();
    void game.answerQuestion(answerIndex);
  };

  const handleCloseQuizModal = () => {
    stopQuizTts();
    game.skipModal();
  };

  const handleRequestFinishGame = () => {
    if (game.gameState.phase === "setup") return;
    setShowEndGameConfirm(true);
  };

  const handleConfirmFinishGame = () => {
    stopQuizTts();
    game.finishGameAndSettle();
    setShowEndGameConfirm(false);
    navigate("/result");
  };

  return (
    <main className="game-page">
      <header className="top-nav">
        <h1>高雄景點大富翁</h1>
        <div className="top-actions">
          <button onClick={() => game.reloadData(loadDataBundle())}>重新載入資料</button>
          <button onClick={() => game.restartGame()}>重置遊戲</button>
          <button
            className="danger-btn"
            disabled={game.gameState.phase === "setup" || game.gameState.modal.type !== null}
            onClick={handleRequestFinishGame}
          >
            結束遊戲
          </button>
          <Link className="nav-link" to="/admin">
            前往後台
          </Link>
          <div className="audio-control-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={sfxEnabled}
                onChange={(event) => setSfxEnabled(event.currentTarget.checked)}
              />
              音效
            </label>
            <label className="audio-volume-control">
              音量：{Math.round(sfxVolume * 100)}%
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={sfxVolume}
                disabled={!sfxEnabled}
                onChange={(event) => setSfxVolume(Number(event.currentTarget.value))}
              />
            </label>
          </div>
        </div>
      </header>

      {game.gameState.phase === "setup" ? (
        <SetupPanel config={game.dataBundle.gameConfig} onStart={game.startGame} />
      ) : (
        <>
          <section className="turn-banner">
            <div>
              <h2>
                第 {game.gameState.turn} 回合 | {currentPlayer?.tokenIcon} {currentPlayer?.name}
              </h2>
              <p>目前階段：{game.gameState.phase}</p>
              <p>回合答題門檻：{game.gameState.turnGate.passed ? "已通過" : "尚未通過"}</p>
              <p>
                目前位置：{currentTile?.name} {currentTile?.icon}
              </p>
            </div>
            <div className="turn-actions">
              <button
                className="primary-btn"
                disabled={game.gameState.phase !== "await_roll"}
                onClick={() => game.rollDice()}
              >
                擲骰
              </button>
              <button
                className="secondary-btn"
                disabled={game.gameState.phase !== "await_end"}
                onClick={() => game.endTurn()}
              >
                結束回合
              </button>
              <p className="dice-value">骰子：{game.gameState.lastDice ?? "-"}</p>
            </div>
          </section>

          <section className="game-layout">
            <div className="left-column">
              <Board
                board={game.board}
                players={game.gameState.players}
                properties={game.gameState.properties}
                propertyDefs={game.dataBundle.properties}
                currentPlayerId={currentPlayer?.id}
                startBonus={game.dataBundle.gameConfig.startBonus}
              />
            </div>
            <div className="right-column">
              <PlayerPanel
                players={game.gameState.players}
                currentPlayerIndex={game.gameState.currentPlayerIndex}
              />
              <InventoryPanel
                player={currentPlayer}
                shopItems={game.dataBundle.shopItems}
                onUseItem={game.useInventoryItem}
              />
              <EventLog logs={game.gameState.log} />
            </div>
          </section>
        </>
      )}

      {game.gameState.modal.type === "property" && currentPlayer ? (
        (() => {
          const tileId = propertyModalPayload?.tileId;
          const tile = tileId ? game.board.find((item) => item.id === tileId) : null;
          const propertyState = tileId ? game.gameState.properties[tileId] : null;
          const propertyDef = tileId ? findPropertyDef(tileId, game.dataBundle.properties) : null;
          const owner = propertyState?.ownerId
            ? game.gameState.players.find((player) => player.id === propertyState.ownerId)
            : null;

          if (!tile || !propertyState || !propertyDef) {
            return (
              <MonopolyPopup
                playerName={currentPlayerName}
                playerTokenIcon={currentPlayerToken}
                locationName="景點資料讀取中"
                theme="message"
                effectIcon="⏳"
                effectTitle="資料載入中，請稍候"
                actions={
                  <button className="mono-btn mono-btn-primary" onClick={game.skipModal}>
                    確認
                  </button>
                }
                onClose={game.skipModal}
              />
            );
          }

          const locationImageSrc = getLandmarkImageSrc(tile.id);

          if (!owner) {
            const discount = currentPlayer.statusEffects.landDiscountNext;
            const finalPrice = Math.max(0, propertyDef.price - discount);
            return (
              <MonopolyPopup
                playerName={currentPlayer.name}
                playerTokenIcon={currentPlayer.tokenIcon}
                locationName={tile.name}
                locationImageSrc={locationImageSrc}
                theme="buy"
                effectIcon="🏠"
                effectTitle="這塊土地尚未被購買"
                effectAmount={`$${finalPrice}`}
                effectExtra={discount > 0 ? <p className="mono-effect-sub">折價券生效：-{discount}</p> : null}
                actions={
                  <>
                    <button
                      className="mono-btn mono-btn-soft"
                      disabled={currentPlayer.money < finalPrice}
                      onClick={game.buyCurrentTileProperty}
                    >
                      購買土地
                    </button>
                    <button className="mono-btn mono-btn-primary" onClick={game.skipModal}>
                      確認
                    </button>
                  </>
                }
                onClose={game.skipModal}
              />
            );
          }

          if (owner.id === currentPlayer.id) {
            const level = propertyState.level;
            const canUpgrade = level < 3;
            const upgradeCost = propertyDef.upgradeCosts[level] ?? 0;
            const useFreeUpgrade = currentPlayer.statusEffects.freeUpgrade > 0;
            return (
              <MonopolyPopup
                playerName={currentPlayer.name}
                playerTokenIcon={currentPlayer.tokenIcon}
                locationName={tile.name}
                locationImageSrc={locationImageSrc}
                theme="earn"
                effectIcon="📈"
                effectTitle={`你已持有這塊地（Lv.${level}）`}
                effectAmount={canUpgrade ? (useFreeUpgrade ? "可用免費升級" : `升級費用 $${upgradeCost}`) : "已達最高等級"}
                effectExtra={<p className="mono-effect-sub">當前租金：${propertyDef.rent[level]}</p>}
                actions={
                  <>
                    {canUpgrade ? (
                      <button
                        className="mono-btn mono-btn-soft"
                        disabled={!useFreeUpgrade && currentPlayer.money < upgradeCost}
                        onClick={game.upgradeCurrentTileProperty}
                      >
                        升級景點
                      </button>
                    ) : null}
                    <button className="mono-btn mono-btn-primary" onClick={game.skipModal}>
                      確認
                    </button>
                  </>
                }
                onClose={game.skipModal}
              />
            );
          }

          return (
            <MonopolyPopup
              playerName={currentPlayer.name}
              playerTokenIcon={currentPlayer.tokenIcon}
              locationName={tile.name}
              locationImageSrc={locationImageSrc}
              theme="pay"
              effectIcon="💸"
              effectTitle={`${tile.name} 已由 ${owner.name} 持有`}
              effectAmount="請查看付款通知"
              actions={
                <button className="mono-btn mono-btn-primary" onClick={game.skipModal}>
                  確認
                </button>
              }
              onClose={game.skipModal}
            />
          );
        })()
      ) : null}

      {game.gameState.modal.type === "shop" && currentPlayer ? (
        <MonopolyPopup
          playerName={currentPlayer.name}
          playerTokenIcon={currentPlayer.tokenIcon}
          locationName={currentTile?.name ?? "港都雜貨舖"}
          locationImageSrc={currentTile ? getLandmarkImageSrc(currentTile.id) : undefined}
          theme="shop"
          effectIcon="🧰"
          effectTitle="歡迎來到港都雜貨舖"
          effectAmount={`目前金額：$${currentPlayer.money}`}
          actions={
            <button className="mono-btn mono-btn-primary" onClick={game.skipModal}>
              離開商店
            </button>
          }
          onClose={game.skipModal}
        >
          <div className="mono-shop-grid">
            {game.dataBundle.shopItems.map((item: ShopItemDef) => {
              const carry = currentPlayer.inventory[item.id] ?? 0;
              const canBuy = currentPlayer.money >= item.price && carry < item.maxCarry;
              return (
                <article key={item.id} className="mono-shop-item">
                  <h4>
                    {item.icon} {item.name}
                  </h4>
                  <p>{item.description}</p>
                  <p>價格：${item.price}</p>
                  <p>
                    持有：{carry}/{item.maxCarry}
                  </p>
                  <button className="mono-btn mono-btn-soft" disabled={!canBuy} onClick={() => game.buyShopItem(item)}>
                    購買
                  </button>
                </article>
              );
            })}
          </div>
        </MonopolyPopup>
      ) : null}

      {game.gameState.modal.type === "card" && currentPlayer ? (
        <MonopolyPopup
          playerName={currentPlayer.name}
          playerTokenIcon={currentPlayer.tokenIcon}
          locationName={currentTile?.name ?? "事件格"}
          locationImageSrc={currentTile ? getLandmarkImageSrc(currentTile.id) : undefined}
          theme="card"
          effectIcon={cardModalPayload?.card.icon ?? "🎴"}
          effectTitle={cardModalPayload?.card.title ?? "抽卡事件"}
          effectExtra={<p className="mono-effect-sub">{cardModalPayload?.card.description}</p>}
          actions={
            <button className="mono-btn mono-btn-primary" onClick={game.applyCard}>
              套用效果
            </button>
          }
          onClose={game.skipModal}
        />
      ) : null}

      {game.gameState.modal.type === "quiz" && currentPlayer ? (
        <MonopolyPopup
          playerName={currentPlayer.name}
          playerTokenIcon={currentPlayer.tokenIcon}
          locationName={quizModalPayload?.source === "turn_gate" ? "回合開始答題（必答）" : currentTile?.name ?? "港都知識王"}
          locationImageSrc={currentTile ? getLandmarkImageSrc(currentTile.id) : undefined}
          theme="quiz"
          effectIcon="❓"
          effectTitle={quizModalPayload?.question.question ?? "題目讀取中"}
          effectExtra={
            <p className="mono-effect-sub">
              {quizModalPayload?.source === "turn_gate"
                ? "本題答對才可開始本回合行動。"
                : "答對可獲獎勵，答錯可能扣款或停留。"}
            </p>
          }
          onClose={quizModalPayload?.source === "turn_gate" ? undefined : handleCloseQuizModal}
        >
          <section className="mono-quiz-tts">
            <div className="mono-quiz-tts-row">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={ttsEnabled}
                  onChange={(event) => setTtsEnabled(event.currentTarget.checked)}
                />
                自動朗讀題目
              </label>
              <label className="mono-tts-speed">
                語速：{ttsRate.toFixed(1)}x
                <input
                  type="range"
                  min={0.7}
                  max={1.4}
                  step={0.1}
                  value={ttsRate}
                  onChange={(event) => setTtsRate(Number(event.currentTarget.value))}
                  disabled={!ttsSupported}
                />
              </label>
            </div>
            <div className="mono-actions">
              <button
                type="button"
                className="mono-btn mono-btn-soft"
                disabled={!ttsSupported || !quizModalPayload?.question}
                onClick={() => {
                  if (!quizModalPayload?.question) return;
                  speakQuizQuestion(quizModalPayload.question, true);
                }}
              >
                朗讀題目
              </button>
              <button type="button" className="mono-btn mono-btn-soft" disabled={!ttsSupported || !ttsSpeaking} onClick={stopQuizTts}>
                停止朗讀
              </button>
            </div>
          </section>
          <div className="mono-quiz-options">
            {quizModalPayload?.question.options.map((option, index) => (
              <button key={`${option}_${index}`} className="mono-quiz-option-btn" onClick={() => handleAnswer(index)}>
                {String.fromCharCode(65 + index)}. {option}
              </button>
            ))}
          </div>
        </MonopolyPopup>
      ) : null}

      {game.gameState.modal.type === "payment_notice" ? (
        (() => {
          const notice = paymentModalPayload?.notice;
          const paymentTile = resolvePaymentTile(notice);
          const receiverText = notice?.isSystemReceiver ? "系統/銀行" : notice?.receiverName;
          return (
            <MonopolyPopup
              playerName={notice?.payerName ?? currentPlayerName}
              playerTokenIcon={currentPlayerToken}
              locationName={paymentTile?.name ?? "付款事件"}
              locationImageSrc={paymentTile ? getLandmarkImageSrc(paymentTile.id) : undefined}
              playerHint={notice?.isWaived ? `${notice?.payerName ?? "玩家"} 觸發付款抵銷！` : `${notice?.payerName ?? "玩家"} 觸發付款事件！`}
              theme="pay"
              effectIcon={notice?.isWaived ? "🛡️" : "💵"}
              effectTitle={notice?.reason ?? "付款通知"}
              effectAmount={notice?.isWaived ? "已抵銷，未實際扣款" : `-$${notice?.amount ?? 0}`}
              effectExtra={
                <div className="mono-effect-sub mono-payment-list">
                  <p>付款人：{notice?.payerName}</p>
                  <p>
                    付款人金額：${notice?.payerBefore ?? 0} → ${notice?.payerAfter ?? 0}
                  </p>
                  <p>收款方：{receiverText}</p>
                  {notice?.isSystemReceiver ? (
                    <p>系統收款不追蹤帳戶餘額。</p>
                  ) : (
                    <p>
                      收款方金額：${notice?.receiverBefore ?? 0} → ${notice?.receiverAfter ?? 0}
                    </p>
                  )}
                </div>
              }
              actions={
                <button className="mono-btn mono-btn-primary" onClick={game.acknowledgePaymentNotice}>
                  確認
                </button>
              }
            />
          );
        })()
      ) : null}

      {game.gameState.modal.type === "message" ? (
        (() => {
          const tile = resolveMessageTile(messageModalPayload?.title);
          return (
            <MonopolyPopup
              playerName={currentPlayerName}
              playerTokenIcon={currentPlayerToken}
              locationName={tile?.name ?? messageModalPayload?.title ?? "地點提示"}
              locationImageSrc={tile ? getLandmarkImageSrc(tile.id) : undefined}
              theme="message"
              effectIcon="📢"
              effectTitle={messageModalPayload?.message ?? "已抵達新地點。"}
              actions={
                <button className="mono-btn mono-btn-primary" onClick={game.skipModal}>
                  確認
                </button>
              }
              onClose={game.skipModal}
            />
          );
        })()
      ) : null}

      {showEndGameConfirm ? (
        <MonopolyPopup
          playerName={currentPlayerName}
          playerTokenIcon={currentPlayerToken}
          locationName="確認結束遊戲"
          theme="confirm"
          effectIcon="📊"
          effectTitle="確定要結束本局並前往結算頁嗎？"
          effectExtra={<p className="mono-effect-sub">結束後會依照現金 + 房產價值進行排名。</p>}
          actions={
            <>
              <button className="mono-btn mono-btn-soft" onClick={() => setShowEndGameConfirm(false)}>
                取消
              </button>
              <button className="mono-btn mono-btn-primary" onClick={handleConfirmFinishGame}>
                確定結束並結算
              </button>
            </>
          }
          onClose={() => setShowEndGameConfirm(false)}
        />
      ) : null}
    </main>
  );
}




