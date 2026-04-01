import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Board } from "../components/Board";
import { EventLog } from "../components/EventLog";
import { InventoryPanel } from "../components/InventoryPanel";
import { ModalShell } from "../components/ModalShell";
import { PlayerPanel } from "../components/PlayerPanel";
import { SetupPanel } from "../components/SetupPanel";
import { findPropertyDef } from "../engine/gameEngine";
import { loadDataBundle } from "../state/dataStore";
import { useGame } from "../state/useGame";
import type { CardDef, PaymentNotice, QuestionDef, ShopItemDef } from "../types/game";

export function GamePage() {
  const navigate = useNavigate();
  const game = useGame(loadDataBundle());
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const lastAutoReadQuestionIdRef = useRef<string | null>(null);
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
        <ModalShell title="景點地產" onClose={game.skipModal} variant="retro">
          {(() => {
            const tileId = propertyModalPayload?.tileId;
            if (!tileId) {
              return <p>讀取中...</p>;
            }
            const tile = game.board.find((item) => item.id === tileId);
            const propertyState = game.gameState.properties[tileId];
            const propertyDef = findPropertyDef(tileId, game.dataBundle.properties);
            if (!tile || !propertyState || !propertyDef) {
              return <p>找不到景點資料。</p>;
            }

            const owner = propertyState.ownerId
              ? game.gameState.players.find((player) => player.id === propertyState.ownerId)
              : null;

            if (!owner) {
              const discount = currentPlayer.statusEffects.landDiscountNext;
              const finalPrice = Math.max(0, propertyDef.price - discount);
              return (
                <>
                  <p>
                    {tile.icon} {tile.name}
                  </p>
                  <p>{tile.description}</p>
                  <p>售價：${propertyDef.price}</p>
                  {discount > 0 ? <p>折價券生效：-{discount}，實付 ${finalPrice}</p> : null}
                  <div className="modal-actions">
                    <button
                      className="primary-btn"
                      disabled={currentPlayer.money < finalPrice}
                      onClick={game.buyCurrentTileProperty}
                    >
                      購買景點
                    </button>
                    <button onClick={game.skipModal}>略過</button>
                  </div>
                </>
              );
            }

            if (owner.id === currentPlayer.id) {
              const level = propertyState.level;
              const canUpgrade = level < 3;
              const upgradeCost = propertyDef.upgradeCosts[level] ?? 0;
              const useFreeUpgrade = currentPlayer.statusEffects.freeUpgrade > 0;
              return (
                <>
                  <p>
                    你已持有 {tile.name}（Lv.{level}）。
                  </p>
                  <p>當前租金：${propertyDef.rent[level]}</p>
                  {canUpgrade ? (
                    <>
                      <p>
                        下次升級成本：{useFreeUpgrade ? "可用免費升級" : `$${upgradeCost}`}
                      </p>
                      <div className="modal-actions">
                        <button
                          className="primary-btn"
                          disabled={!useFreeUpgrade && currentPlayer.money < upgradeCost}
                          onClick={game.upgradeCurrentTileProperty}
                        >
                          升級景點
                        </button>
                        <button onClick={game.skipModal}>暫不升級</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p>已達最高等級。</p>
                      <button onClick={game.skipModal}>知道了</button>
                    </>
                  )}
                </>
              );
            }

            return (
              <>
                <p>
                  {tile.name} 已由 {owner.name} 持有。
                </p>
                <button onClick={game.skipModal}>關閉</button>
              </>
            );
          })()}
        </ModalShell>
      ) : null}

      {game.gameState.modal.type === "shop" && currentPlayer ? (
        <ModalShell title="港都雜貨舖" onClose={game.skipModal} variant="retro">
          <p>目前金額：${currentPlayer.money}</p>
          <div className="shop-grid">
            {game.dataBundle.shopItems.map((item: ShopItemDef) => {
              const carry = currentPlayer.inventory[item.id] ?? 0;
              const canBuy = currentPlayer.money >= item.price && carry < item.maxCarry;
              return (
                <article key={item.id} className="shop-item-card">
                  <h4>
                    {item.icon} {item.name}
                  </h4>
                  <p>{item.description}</p>
                  <p>價格：${item.price}</p>
                  <p>
                    持有：{carry}/{item.maxCarry}
                  </p>
                  <button disabled={!canBuy} onClick={() => game.buyShopItem(item)}>
                    購買
                  </button>
                </article>
              );
            })}
          </div>
          <div className="modal-actions">
            <button className="primary-btn" onClick={game.skipModal}>
              離開商店
            </button>
          </div>
        </ModalShell>
      ) : null}

      {game.gameState.modal.type === "card" ? (
        <ModalShell title="抽卡事件" onClose={game.skipModal} variant="retro">
          <p>
            {cardModalPayload?.card.icon} {cardModalPayload?.card.title}
          </p>
          <p>{cardModalPayload?.card.description}</p>
          <div className="modal-actions">
            <button className="primary-btn" onClick={game.applyCard}>
              套用效果
            </button>
          </div>
        </ModalShell>
      ) : null}

      {game.gameState.modal.type === "quiz" ? (
        <ModalShell
          title={quizModalPayload?.source === "turn_gate" ? "回合開始答題（必答）" : "港都知識王"}
          onClose={quizModalPayload?.source === "turn_gate" ? undefined : handleCloseQuizModal}
          variant="retro"
        >
          <p>{quizModalPayload?.question.question}</p>
          <section className="quiz-tts-panel">
            <div className="quiz-tts-row">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={ttsEnabled}
                  onChange={(event) => setTtsEnabled(event.currentTarget.checked)}
                />
                自動朗讀題目
              </label>
              <label className="quiz-tts-speed">
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
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-btn"
                disabled={!ttsSupported || !quizModalPayload?.question}
                onClick={() => {
                  if (!quizModalPayload?.question) return;
                  speakQuizQuestion(quizModalPayload.question, true);
                }}
              >
                朗讀題目
              </button>
              <button type="button" disabled={!ttsSupported || !ttsSpeaking} onClick={stopQuizTts}>
                停止朗讀
              </button>
            </div>
            <p className="hint-text">
              {ttsSupported
                ? ttsSpeaking
                  ? "正在語音朗讀中，可按「停止朗讀」。"
                  : "可手動朗讀題目，或開啟自動朗讀。"
                : "此裝置/瀏覽器不支援 TTS 語音報讀。"}
            </p>
          </section>
          <div className="quiz-options">
            {quizModalPayload?.question.options.map((option, index) => (
              <button key={`${option}_${index}`} onClick={() => handleAnswer(index)}>
                {String.fromCharCode(65 + index)}. {option}
              </button>
            ))}
          </div>
          <p className="hint-text">
            {quizModalPayload?.source === "turn_gate"
              ? "本題答對才可開始本回合行動；答錯會直接結束回合。"
              : "答對可獲獎勵，答錯可能扣款或停留。"}
          </p>
        </ModalShell>
      ) : null}

      {game.gameState.modal.type === "payment_notice" ? (
        <ModalShell title="付款通知" variant="retro">
          <div className="payment-notice-body">
            <p className="payment-notice-title">
              {paymentModalPayload?.notice.isWaived ? "本次付款已抵銷" : "已發生付款"}
            </p>
            <p>
              原因：{paymentModalPayload?.notice.reason}
            </p>
            <p>
              金額：${paymentModalPayload?.notice.amount ?? 0}
            </p>
            <hr className="retro-divider" />
            <p>
              付款人：{paymentModalPayload?.notice.payerName}
            </p>
            <p>
              金額變化：${paymentModalPayload?.notice.payerBefore ?? 0} → ${paymentModalPayload?.notice.payerAfter ?? 0}
            </p>
            <p>
              收款方：
              {paymentModalPayload?.notice.isSystemReceiver
                ? "系統/銀行"
                : paymentModalPayload?.notice.receiverName}
            </p>
            {paymentModalPayload?.notice.isSystemReceiver ? (
              <p>系統收款不追蹤帳戶餘額。</p>
            ) : (
              <p>
                收款方金額：${paymentModalPayload?.notice.receiverBefore ?? 0} → ${paymentModalPayload?.notice.receiverAfter ?? 0}
              </p>
            )}
            {paymentModalPayload?.notice.isWaived ? (
              <p className="payment-waived-text">已使用保護效果，未實際扣款或轉帳。</p>
            ) : null}
          </div>
          <div className="modal-actions">
            <button className="primary-btn" onClick={game.acknowledgePaymentNotice}>
              知道了
            </button>
          </div>
        </ModalShell>
      ) : null}

      {showEndGameConfirm ? (
        <ModalShell title="確認結束遊戲" onClose={() => setShowEndGameConfirm(false)} variant="retro">
          <p>確定要結束本局並前往結算頁嗎？</p>
          <p className="hint-text">結束後會依照現金 + 房產價值進行排名。</p>
          <div className="modal-actions">
            <button className="primary-btn" onClick={handleConfirmFinishGame}>
              確定結束並結算
            </button>
            <button onClick={() => setShowEndGameConfirm(false)}>取消</button>
          </div>
        </ModalShell>
      ) : null}
    </main>
  );
}


