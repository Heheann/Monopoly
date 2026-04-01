import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { buildSettlementRanking } from "../engine/gameEngine";
import { loadDataBundle } from "../state/dataStore";
import { clearRuntimeState, loadRuntimeState } from "../state/gameStorage";

function formatMoney(value: number): string {
  return `$${value.toLocaleString("zh-TW")}`;
}

export function ResultPage() {
  const navigate = useNavigate();
  const runtimeState = useMemo(() => loadRuntimeState(), []);
  const dataBundle = useMemo(() => loadDataBundle(), []);

  const hasValidGame = !!runtimeState && runtimeState.players.length > 0 && runtimeState.phase === "game_over";

  const ranking = useMemo(() => {
    if (!runtimeState || runtimeState.players.length === 0) return [];
    return buildSettlementRanking({
      players: runtimeState.players,
      propertiesState: runtimeState.properties,
      propertyDefs: dataBundle.properties
    });
  }, [runtimeState, dataBundle.properties]);

  const champion = useMemo(() => {
    if (ranking.length === 0) return null;
    if (!runtimeState?.winnerId) return ranking[0];
    return ranking.find((entry) => entry.playerId === runtimeState.winnerId) ?? ranking[0];
  }, [ranking, runtimeState?.winnerId]);

  const handlePlayAgain = () => {
    clearRuntimeState();
    navigate("/", { replace: true });
  };

  if (!hasValidGame) {
    return (
      <main className="result-page">
        <header className="top-nav">
          <h1>本局結算</h1>
          <Link className="nav-link" to="/">
            回主畫面
          </Link>
        </header>
        <section className="result-card">
          <h2>目前沒有可結算的對局資料</h2>
          <p>請先從主畫面開始遊戲，並使用「結束遊戲」完成本局後再查看結算。</p>
          <div className="modal-actions">
            <button className="primary-btn" onClick={() => navigate("/")}>
              前往遊戲
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="result-page">
      <header className="top-nav">
        <h1>本局結算</h1>
        <div className="top-actions">
          <button className="primary-btn" onClick={handlePlayAgain}>
            再來一局
          </button>
          <Link className="nav-link" to="/">
            返回主畫面
          </Link>
        </div>
      </header>

      <section className="result-card champion-card">
        <h2>本局冠軍</h2>
        {champion ? (
          <p>
            第 {champion.rank} 名：{champion.tokenIcon} {champion.name}（總資產 {formatMoney(champion.totalAsset)}）
          </p>
        ) : (
          <p>無可用資料。</p>
        )}
      </section>

      <section className="result-card">
        <h2>排行榜</h2>
        <div className="result-table-wrap">
          <table className="result-table">
            <thead>
              <tr>
                <th>名次</th>
                <th>玩家</th>
                <th>總資產</th>
                <th>房產資產</th>
                <th>現金</th>
                <th>房產數</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((entry) => (
                <tr key={entry.playerId}>
                  <td>#{entry.rank}</td>
                  <td>
                    {entry.tokenIcon} {entry.name}
                  </td>
                  <td>{formatMoney(entry.totalAsset)}</td>
                  <td>{formatMoney(entry.propertyAsset)}</td>
                  <td>{formatMoney(entry.cashAsset)}</td>
                  <td>{entry.propertyCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="result-card">
        <h2>房產明細</h2>
        <div className="result-breakdown-grid">
          {ranking.map((entry) => (
            <article key={`${entry.playerId}_properties`} className="result-breakdown-card">
              <h3>
                #{entry.rank} {entry.tokenIcon} {entry.name}
              </h3>
              {entry.properties.length === 0 ? (
                <p>無持有房產。</p>
              ) : (
                <ul className="result-property-list">
                  {entry.properties.map((property) => (
                    <li key={`${entry.playerId}_${property.tileId}`}>
                      <span>
                        {property.name}（Lv.{property.level}）
                      </span>
                      <span>{formatMoney(property.totalValue)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
