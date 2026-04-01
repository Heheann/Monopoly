import type { PlayerState } from "../types/game";

interface PlayerPanelProps {
  players: PlayerState[];
  currentPlayerIndex: number;
}

export function PlayerPanel({ players, currentPlayerIndex }: PlayerPanelProps) {
  return (
    <section className="player-panel">
      <h3>玩家資訊</h3>
      <div className="player-list">
        {players.map((player, index) => (
          <article key={player.id} className={`player-card ${index === currentPlayerIndex ? "active" : ""}`}>
            <header>
              <h4>
                {player.tokenIcon} {player.name}
              </h4>
              <span>{index === currentPlayerIndex ? "目前回合" : "等待中"}</span>
            </header>
            <p>金額：${player.money}</p>
            <p>位置：{player.position}</p>
            <p>持有景點：{player.ownedProperties.length}</p>
            <p>
              狀態：停留 {player.statusEffects.skipTurns} / 免租 {player.statusEffects.rentImmunity} / 免扣款 {player.statusEffects.moneyImmunity}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
