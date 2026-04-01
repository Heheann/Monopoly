export type TileType =
  | "start"
  | "property"
  | "chance"
  | "fate"
  | "transport"
  | "shop"
  | "quiz"
  | "traffic_jam"
  | "rest"
  | "go_to_jam"
  | "public";

export interface BoardTile {
  id: string;
  name: string;
  type: TileType;
  group: string;
  color: string;
  price: number;
  rent: number[];
  upgradeCosts: number[];
  icon: string;
  description: string;
  position: number;
}

export interface PropertyDef {
  id: string;
  boardTileId: string;
  name: string;
  group: string;
  color: string;
  price: number;
  rent: number[];
  upgradeCosts: number[];
  description: string;
  houseLabels: string[];
}

export type CardType = "chance" | "fate";

export type CardEffectType =
  | "MOVE_STEPS"
  | "MONEY"
  | "SKIP_TURNS"
  | "MOVE_TO_TILE"
  | "RENT_IMMUNITY"
  | "DRAW_AGAIN"
  | "MONEY_IMMUNITY"
  | "QUIZ_SHIELD";

export interface CardDef {
  id: string;
  title: string;
  description: string;
  type: CardType;
  effectType: CardEffectType;
  effectValue: number;
  target: "self" | "all";
  icon: string;
  rarity?: "common" | "uncommon" | "rare";
}

export interface ShopItemEffect {
  kind:
    | "REROLL"
    | "FIXED_DICE"
    | "RENT_IMMUNITY"
    | "MONEY_IMMUNITY"
    | "MOVE_STEPS"
    | "LAND_DISCOUNT"
    | "FREE_UPGRADE"
    | "REMOVE_STUCK"
    | "QUIZ_SHIELD";
  value: number;
}

export interface ShopItemDef {
  id: string;
  name: string;
  type: string;
  price: number;
  icon: string;
  description: string;
  timing: string;
  stackable: boolean;
  maxCarry: number;
  effect: ShopItemEffect;
}

export interface QuestionOutcome {
  money: number;
  moveSteps: number;
  skipTurns: number;
}

export interface QuestionDef {
  id: string;
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
  category: string;
  difficulty: "easy" | "medium" | "hard";
  enabled: boolean;
  reward: QuestionOutcome;
  penalty: QuestionOutcome;
}

export interface ComboRule {
  id: string;
  name: string;
  requiredPropertyIds: string[];
  bonusMultiplier: number;
  description: string;
}

export interface TokenDef {
  id: string;
  name: string;
  icon: string;
}

export interface GameConfig {
  initialMoney: number;
  startBonus: number;
  minPlayers: number;
  maxPlayers: number;
  groupBonusMultiplier: number;
  tokens: TokenDef[];
  comboRules: ComboRule[];
  quizConfig: {
    defaultRewardMoney: number;
    defaultPenaltyMoney: number;
    turnGateEnabled: boolean;
    turnGateFailPolicy: "end_turn";
    drawPolicy: "random_no_repeat";
    requireOptionsCount: number;
  };
}

export interface StatusEffects {
  skipTurns: number;
  rentImmunity: number;
  moneyImmunity: number;
  quizShield: number;
  landDiscountNext: number;
  freeUpgrade: number;
  rerollCharges: number;
  fixedDice: number | null;
}

export interface PlayerState {
  id: string;
  name: string;
  token: string;
  tokenIcon: string;
  position: number;
  money: number;
  ownedProperties: string[];
  inventory: Record<string, number>;
  statusEffects: StatusEffects;
}

export interface PropertyState {
  tileId: string;
  ownerId: string | null;
  level: number;
}

export type TurnPhase =
  | "setup"
  | "await_gate_quiz"
  | "await_roll"
  | "moving"
  | "resolving"
  | "await_end"
  | "game_over";

export interface TurnGateState {
  passed: boolean;
  questionId: string | null;
  mode: "turn_gate" | "tile_quiz" | null;
}

export interface QuestionCycleState {
  remainingIds: string[];
  usedIds: string[];
}

export interface PaymentNotice {
  id: string;
  reason: string;
  amount: number;
  payerName: string;
  receiverName: string;
  payerBefore: number;
  payerAfter: number;
  receiverBefore: number | null;
  receiverAfter: number | null;
  isSystemReceiver: boolean;
  isWaived: boolean;
}

export type SoundEventType =
  | "quiz_correct"
  | "quiz_wrong"
  | "property_buy"
  | "property_upgrade"
  | "payment_to_player"
  | "payment_to_system"
  | "payment_waived"
  | "shop_buy"
  | "card_draw"
  | "dice_roll"
  | "pass_start_bonus"
  | "game_end";

export interface SoundEvent {
  id: string;
  type: SoundEventType;
  createdAt: number;
}

export interface ModalState {
  type: "property" | "shop" | "card" | "quiz" | "message" | "payment_notice" | null;
  payload?: unknown;
}

export interface GameState {
  players: PlayerState[];
  properties: Record<string, PropertyState>;
  currentPlayerIndex: number;
  turn: number;
  phase: TurnPhase;
  lastDice: number | null;
  log: string[];
  modal: ModalState;
  turnGate: TurnGateState;
  questionCycle: QuestionCycleState;
  paymentNoticeQueue: PaymentNotice[];
  soundQueue: SoundEvent[];
  winnerId: string | null;
}

export interface SeedDataBundle {
  board: BoardTile[];
  properties: PropertyDef[];
  chanceCards: CardDef[];
  fateCards: CardDef[];
  shopItems: ShopItemDef[];
  questionBank: QuestionDef[];
  gameConfig: GameConfig;
}

export interface StoredDataBundle extends SeedDataBundle {}

export interface PendingCard {
  card: CardDef;
}

export interface PendingPropertyAction {
  tileId: string;
}

export interface PendingQuiz {
  question: QuestionDef;
}

export interface SettlementPropertyBreakdown {
  tileId: string;
  name: string;
  level: number;
  basePrice: number;
  upgradeInvested: number;
  totalValue: number;
}

export interface SettlementPlayerEntry {
  playerId: string;
  name: string;
  tokenIcon: string;
  cashAsset: number;
  propertyAsset: number;
  totalAsset: number;
  propertyCount: number;
  rank: number;
  properties: SettlementPropertyBreakdown[];
}
