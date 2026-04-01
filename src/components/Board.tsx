import type { BoardTile, PlayerState, PropertyDef, PropertyState } from "../types/game";

interface BoardProps {
  board: BoardTile[];
  players: PlayerState[];
  properties: Record<string, PropertyState>;
  propertyDefs: PropertyDef[];
  currentPlayerId?: string;
}

const positionGrid = [
  [12, 13, 14, 15, 16, 17, 18],
  [11, -1, -1, -1, -1, -1, 19],
  [10, -1, -1, -1, -1, -1, 20],
  [9, -1, -1, -1, -1, -1, 21],
  [8, -1, -1, -1, -1, -1, 22],
  [7, -1, -1, -1, -1, -1, 23],
  [6, 5, 4, 3, 2, 1, 0]
];

export function Board({ board, players, properties, propertyDefs, currentPlayerId }: BoardProps) {
  const byPosition = new Map<number, BoardTile>(board.map((tile) => [tile.position, tile]));
  const centerLogoSrc = `${import.meta.env.BASE_URL}logo-center.png`;

  const getTilePlayers = (position: number) => players.filter((player) => player.position === position);

  const renderTile = (position: number) => {
    const tile = byPosition.get(position);
    if (!tile) {
      return <div className="board-tile empty" />;
    }

    const tilePlayers = getTilePlayers(position);
    const propertyDef = propertyDefs.find((item) => item.boardTileId === tile.id);
    const propertyState = properties[tile.id];
    const owner = propertyState?.ownerId ? players.find((player) => player.id === propertyState.ownerId) : null;

    return (
      <div className={`board-tile tile-${tile.type}`} style={{ borderTopColor: tile.color }}>
        <div className="tile-head">
          <span className="tile-icon">{tile.icon}</span>
          <span className="tile-name">{tile.name}</span>
        </div>
        <div className="tile-meta">
          <span>{tile.type === "property" ? `景點 $${tile.price}` : tile.group}</span>
          {tile.type === "property" && propertyState ? <span>Lv.{propertyState.level}</span> : null}
        </div>
        {tile.type === "property" && propertyDef ? (
          <div className="tile-property-info">
            <span>租金：{propertyDef.rent[propertyState?.level ?? 0]}</span>
            <span>{owner ? `持有人：${owner.name}` : "尚未開發"}</span>
          </div>
        ) : null}

        <div className="tile-players">
          {tilePlayers.map((player) => (
            <span
              key={player.id}
              className={`token-chip ${player.id === currentPlayerId ? "active" : ""}`}
              title={player.name}
            >
              {player.tokenIcon}
            </span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <section className="board-wrapper">
      <div className="board-grid">
        {positionGrid.map((row, rowIndex) =>
          row.map((position, colIndex) => {
            if (position === -1) {
              if (rowIndex === 1 && colIndex === 1) {
                return (
                  <div key="center" className="board-center" style={{ gridArea: "2 / 2 / 7 / 7" }}>
                    <img
                      className="center-logo-image"
                      src={centerLogoSrc}
                      alt="主題 Logo"
                    />
                  </div>
                );
              }
              return null;
            }
            return <div key={`tile_${rowIndex}_${colIndex}`}>{renderTile(position)}</div>;
          })
        )}
      </div>
    </section>
  );
}
