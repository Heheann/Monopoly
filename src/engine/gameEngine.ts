import type {
  BoardTile,
  ComboRule,
  GameConfig,
  PlayerState,
  PropertyDef,
  PropertyState,
  SeedDataBundle,
  SettlementPlayerEntry,
  SettlementPropertyBreakdown,
  ShopItemDef,
  StatusEffects
} from "../types/game";

export const LEVEL_LABELS = ["未開發", "小攤位", "特色民宿", "主題旅館"];

export function createDefaultStatusEffects(): StatusEffects {
  return {
    skipTurns: 0,
    rentImmunity: 0,
    moneyImmunity: 0,
    quizShield: 0,
    landDiscountNext: 0,
    freeUpgrade: 0,
    rerollCharges: 0,
    fixedDice: null
  };
}

export function createInitialPlayer(
  id: string,
  name: string,
  token: { id: string; icon: string },
  initialMoney: number
): PlayerState {
  return {
    id,
    name,
    token: token.id,
    tokenIcon: token.icon,
    position: 0,
    money: initialMoney,
    ownedProperties: [],
    inventory: {},
    statusEffects: createDefaultStatusEffects()
  };
}

export function createInitialPropertyState(properties: PropertyDef[]): Record<string, PropertyState> {
  return properties.reduce<Record<string, PropertyState>>((acc, property) => {
    acc[property.boardTileId] = {
      tileId: property.boardTileId,
      ownerId: null,
      level: 0
    };
    return acc;
  }, {});
}

export function randomDice(): number {
  return Math.floor(Math.random() * 6) + 1;
}

export function getTileByPosition(board: BoardTile[], position: number): BoardTile {
  return board.find((tile) => tile.position === position) ?? board[0];
}

export function stepMove(currentPosition: number, step: number, boardSize: number): { next: number; passedStart: boolean } {
  const raw = currentPosition + step;
  if (step >= 0) {
    return {
      next: ((raw % boardSize) + boardSize) % boardSize,
      passedStart: raw >= boardSize
    };
  }

  const normalized = ((raw % boardSize) + boardSize) % boardSize;
  return {
    next: normalized,
    passedStart: false
  };
}

export function calculateRent(params: {
  propertyDef: PropertyDef;
  owner: PlayerState;
  allPlayers: PlayerState[];
  propertiesState: Record<string, PropertyState>;
  allPropertyDefs: PropertyDef[];
  config: GameConfig;
}): number {
  const { propertyDef, owner, allPlayers, propertiesState, allPropertyDefs, config } = params;
  const state = propertiesState[propertyDef.boardTileId];
  const level = Math.min(state.level, propertyDef.rent.length - 1);
  let rent = propertyDef.rent[level] ?? propertyDef.rent[0] ?? 0;

  const groupProperties = allPropertyDefs.filter((p) => p.group === propertyDef.group);
  const ownerHasFullGroup = groupProperties.every((p) => propertiesState[p.boardTileId]?.ownerId === owner.id);
  if (ownerHasFullGroup && groupProperties.length > 1) {
    rent = Math.round(rent * config.groupBonusMultiplier);
  }

  const comboMultiplier = getComboMultiplier(owner.id, config.comboRules, propertiesState);
  if (comboMultiplier > 1) {
    rent = Math.round(rent * comboMultiplier);
  }

  const bankruptcyPressure = allPlayers.filter((p) => p.money <= 0).length;
  if (bankruptcyPressure > 0) {
    rent = Math.round(rent * 0.95);
  }

  return Math.max(0, rent);
}

export function getComboMultiplier(
  ownerId: string,
  comboRules: ComboRule[],
  propertiesState: Record<string, PropertyState>
): number {
  let multiplier = 1;
  for (const rule of comboRules) {
    const passed = rule.requiredPropertyIds.every((propertyId) => propertiesState[propertyId]?.ownerId === ownerId);
    if (passed) {
      multiplier *= rule.bonusMultiplier;
    }
  }
  return multiplier;
}

export function applyPurchaseDiscount(price: number, player: PlayerState): { finalPrice: number; consumedDiscount: number } {
  const discount = Math.max(0, player.statusEffects.landDiscountNext);
  if (discount === 0) {
    return { finalPrice: price, consumedDiscount: 0 };
  }

  return {
    finalPrice: Math.max(0, price - discount),
    consumedDiscount: discount
  };
}

export function canAfford(player: PlayerState, amount: number): boolean {
  return player.money >= amount;
}

export function getRandomElement<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function addInventoryItem(player: PlayerState, item: ShopItemDef): PlayerState {
  const current = player.inventory[item.id] ?? 0;
  const next = Math.min(item.maxCarry, current + 1);
  return {
    ...player,
    inventory: {
      ...player.inventory,
      [item.id]: next
    }
  };
}

export function consumeInventoryItem(player: PlayerState, itemId: string): PlayerState {
  const current = player.inventory[itemId] ?? 0;
  if (current <= 0) {
    return player;
  }

  const nextInventory = { ...player.inventory, [itemId]: current - 1 };
  if (nextInventory[itemId] <= 0) {
    delete nextInventory[itemId];
  }

  return {
    ...player,
    inventory: nextInventory
  };
}

export function ensureSeedDataShape(data: SeedDataBundle): boolean {
  return (
    Array.isArray(data.board) &&
    Array.isArray(data.properties) &&
    Array.isArray(data.chanceCards) &&
    Array.isArray(data.fateCards) &&
    Array.isArray(data.shopItems) &&
    Array.isArray(data.questionBank) &&
    !!data.gameConfig
  );
}

export function findPropertyDef(tileId: string, properties: PropertyDef[]): PropertyDef | undefined {
  return properties.find((property) => property.boardTileId === tileId);
}

export function countOwnedByGroup(ownerId: string, group: string, properties: PropertyDef[], states: Record<string, PropertyState>): number {
  return properties.filter((property) => property.group === group && states[property.boardTileId]?.ownerId === ownerId).length;
}

export function calculateUpgradeInvested(upgradeCosts: number[], level: number): number {
  const cap = Math.max(0, Math.min(level, upgradeCosts.length));
  return upgradeCosts.slice(0, cap).reduce((sum, cost) => sum + (Number.isFinite(cost) ? cost : 0), 0);
}

export function buildSettlementRanking(params: {
  players: PlayerState[];
  propertiesState: Record<string, PropertyState>;
  propertyDefs: PropertyDef[];
}): SettlementPlayerEntry[] {
  const { players, propertiesState, propertyDefs } = params;
  const propertyDefByTileId = new Map(propertyDefs.map((propertyDef) => [propertyDef.boardTileId, propertyDef]));

  const rawEntries = players.map<SettlementPlayerEntry>((player) => {
    const properties: SettlementPropertyBreakdown[] = player.ownedProperties.map((tileId) => {
      const propertyDef = propertyDefByTileId.get(tileId);
      const propertyState = propertiesState[tileId];
      const level = Math.max(0, Math.min(3, propertyState?.level ?? 0));
      const basePrice = propertyDef?.price ?? 0;
      const upgradeInvested = propertyDef ? calculateUpgradeInvested(propertyDef.upgradeCosts, level) : 0;

      return {
        tileId,
        name: propertyDef?.name ?? tileId,
        level,
        basePrice,
        upgradeInvested,
        totalValue: basePrice + upgradeInvested
      };
    });

    const propertyAsset = properties.reduce((sum, property) => sum + property.totalValue, 0);
    const cashAsset = player.money;

    return {
      playerId: player.id,
      name: player.name,
      tokenIcon: player.tokenIcon,
      cashAsset,
      propertyAsset,
      totalAsset: cashAsset + propertyAsset,
      propertyCount: player.ownedProperties.length,
      rank: 0,
      properties
    };
  });

  const sortedEntries = [...rawEntries].sort((left, right) => {
    if (right.totalAsset !== left.totalAsset) return right.totalAsset - left.totalAsset;
    if (right.propertyAsset !== left.propertyAsset) return right.propertyAsset - left.propertyAsset;
    if (right.cashAsset !== left.cashAsset) return right.cashAsset - left.cashAsset;
    if (right.propertyCount !== left.propertyCount) return right.propertyCount - left.propertyCount;
    return left.playerId.localeCompare(right.playerId);
  });

  return sortedEntries.map((entry, index) => ({ ...entry, rank: index + 1 }));
}
