import { useMemo, useState } from "react";
import type { GameConfig } from "../types/game";

interface SetupPanelProps {
  config: GameConfig;
  onStart: (players: Array<{ name: string; tokenId: string }>) => void;
}

export function SetupPanel({ config, onStart }: SetupPanelProps) {
  const [playerCount, setPlayerCount] = useState(config.minPlayers);

  const initialPlayers = useMemo(() => {
    return Array.from({ length: config.maxPlayers }, (_, index) => ({
      name: `玩家 ${index + 1}`,
      tokenId: config.tokens[index % config.tokens.length]?.id ?? config.tokens[0].id
    }));
  }, [config.maxPlayers, config.tokens]);

  const [players, setPlayers] = useState(initialPlayers);

  const updatePlayer = (index: number, field: "name" | "tokenId", value: string) => {
    setPlayers((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        [field]: value
      };
      return next;
    });
  };

  return (
    <section className="setup-card">
      <h2>建立新遊戲</h2>
      <p>選擇 2~4 位玩家與高雄主題棋子。</p>
      <div className="setup-row">
        <label htmlFor="playerCount">玩家數</label>
        <select
          id="playerCount"
          value={playerCount}
          onChange={(event) => setPlayerCount(Number(event.target.value))}
        >
          {Array.from({ length: config.maxPlayers - config.minPlayers + 1 }, (_, idx) => {
            const count = idx + config.minPlayers;
            return (
              <option key={count} value={count}>
                {count} 人
              </option>
            );
          })}
        </select>
      </div>

      <div className="setup-grid">
        {players.slice(0, playerCount).map((player, index) => (
          <article key={`setup_${index}`} className="setup-player-card">
            <h3>玩家 {index + 1}</h3>
            <label>
              名稱
              <input
                value={player.name}
                onChange={(event) => updatePlayer(index, "name", event.target.value)}
                maxLength={12}
              />
            </label>
            <label>
              棋子
              <select value={player.tokenId} onChange={(event) => updatePlayer(index, "tokenId", event.target.value)}>
                {config.tokens.map((token) => (
                  <option key={token.id} value={token.id}>
                    {token.icon} {token.name}
                  </option>
                ))}
              </select>
            </label>
          </article>
        ))}
      </div>

      <button className="primary-btn" onClick={() => onStart(players.slice(0, playerCount))}>
        開始遊戲
      </button>
    </section>
  );
}
