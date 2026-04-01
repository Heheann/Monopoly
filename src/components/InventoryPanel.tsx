import type { PlayerState, ShopItemDef } from "../types/game";

interface InventoryPanelProps {
  player: PlayerState | null;
  shopItems: ShopItemDef[];
  onUseItem: (itemId: string) => void;
}

export function InventoryPanel({ player, shopItems, onUseItem }: InventoryPanelProps) {
  if (!player) {
    return null;
  }

  const entries = Object.entries(player.inventory);

  return (
    <section className="inventory-panel">
      <h3>背包（{player.name}）</h3>
      {entries.length === 0 ? <p>目前沒有道具。</p> : null}
      <div className="inventory-list">
        {entries.map(([itemId, count]) => {
          const item = shopItems.find((shop) => shop.id === itemId);
          if (!item) {
            return null;
          }

          return (
            <article key={item.id} className="inventory-card">
              <h4>
                {item.icon} {item.name} x{count}
              </h4>
              <p>{item.description}</p>
              <button onClick={() => onUseItem(item.id)}>使用</button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
