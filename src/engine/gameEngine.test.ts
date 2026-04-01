import { describe, expect, it } from "vitest";
import { buildSettlementRanking, calculateRent, createInitialPropertyState, stepMove } from "./gameEngine";
import type { GameConfig, PlayerState, PropertyDef } from "../types/game";

function makePlayer(id: string): PlayerState {
  return {
    id,
    name: id,
    token: "duck",
    tokenIcon: "🦆",
    position: 0,
    money: 10000,
    ownedProperties: [],
    inventory: {},
    statusEffects: {
      skipTurns: 0,
      rentImmunity: 0,
      moneyImmunity: 0,
      quizShield: 0,
      landDiscountNext: 0,
      freeUpgrade: 0,
      rerollCharges: 0,
      fixedDice: null
    }
  };
}

const config: GameConfig = {
  initialMoney: 12000,
  startBonus: 2000,
  minPlayers: 2,
  maxPlayers: 4,
  groupBonusMultiplier: 1.5,
  tokens: [],
  comboRules: [
    {
      id: "combo_art_revival",
      name: "文藝復興租金",
      requiredPropertyIds: ["pier2", "kmc"],
      bonusMultiplier: 1.4,
      description: "test"
    }
  ],
  quizConfig: {
    defaultRewardMoney: 500,
    defaultPenaltyMoney: -300,
    turnGateEnabled: true,
    turnGateFailPolicy: "end_turn",
    drawPolicy: "random_no_repeat",
    requireOptionsCount: 4
  }
};

const properties: PropertyDef[] = [
  {
    id: "pier2",
    boardTileId: "pier2",
    name: "駁二",
    group: "文化藝術區",
    color: "#aaa",
    price: 1000,
    rent: [100, 200, 300, 400],
    upgradeCosts: [100, 100, 100],
    description: "",
    houseLabels: []
  },
  {
    id: "kmc",
    boardTileId: "kmc",
    name: "高流",
    group: "文化藝術區",
    color: "#aaa",
    price: 1000,
    rent: [100, 200, 300, 400],
    upgradeCosts: [100, 100, 100],
    description: "",
    houseLabels: []
  }
];

describe("stepMove", () => {
  it("跨越起點時應標記 passedStart", () => {
    const result = stepMove(23, 1, 24);
    expect(result.next).toBe(0);
    expect(result.passedStart).toBe(true);
  });

  it("後退不應標記 passedStart", () => {
    const result = stepMove(0, -1, 24);
    expect(result.next).toBe(23);
    expect(result.passedStart).toBe(false);
  });
});

describe("calculateRent", () => {
  it("同色組 + combo 皆生效", () => {
    const owner = makePlayer("p1");
    const visitor = makePlayer("p2");

    const states = createInitialPropertyState(properties);
    states.pier2 = { tileId: "pier2", ownerId: owner.id, level: 1 };
    states.kmc = { tileId: "kmc", ownerId: owner.id, level: 0 };

    const rent = calculateRent({
      propertyDef: properties[0],
      owner,
      allPlayers: [owner, visitor],
      propertiesState: states,
      allPropertyDefs: properties,
      config
    });

    expect(rent).toBeGreaterThan(200);
  });
});

describe("buildSettlementRanking", () => {
  it("應以總資產排序，總資產同分時以房產資產優先", () => {
    const p1 = makePlayer("p1");
    const p2 = makePlayer("p2");
    const p3 = makePlayer("p3");

    p1.money = 7000;
    p2.money = 6800;
    p3.money = 4000;

    p1.ownedProperties = ["pier2"];
    p2.ownedProperties = ["kmc"];
    p3.ownedProperties = [];

    const states = createInitialPropertyState(properties);
    states.pier2 = { tileId: "pier2", ownerId: p1.id, level: 0 };
    states.kmc = { tileId: "kmc", ownerId: p2.id, level: 2 };

    const ranking = buildSettlementRanking({
      players: [p1, p2, p3],
      propertiesState: states,
      propertyDefs: properties
    });

    expect(ranking).toHaveLength(3);
    expect(ranking[0].playerId).toBe("p2");
    expect(ranking[1].playerId).toBe("p1");
    expect(ranking[2].playerId).toBe("p3");
    expect(ranking[0].rank).toBe(1);
    expect(ranking[0].totalAsset).toBe(8000);
    expect(ranking[0].propertyAsset).toBe(1200);
  });
});
