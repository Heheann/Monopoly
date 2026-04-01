import boardSeed from "../data/board.json";
import chanceSeed from "../data/chanceCards.json";
import fateSeed from "../data/fateCards.json";
import configSeed from "../data/gameConfig.json";
import propertiesSeed from "../data/properties.json";
import questionsSeed from "../data/questionBank.json";
import shopSeed from "../data/shopItems.json";
import type { QuestionDef, SeedDataBundle, StoredDataBundle } from "../types/game";

const STORAGE_KEY = "kaohsiung_monopoly_data_v1";

export type QuestionImportMode = "overwrite" | "append";

export interface QuestionImportReport {
  mode: QuestionImportMode;
  incomingCount: number;
  addedCount: number;
  changedIdCount: number;
  skippedDuplicateTextCount: number;
  invalidCount: number;
  firstInvalidReason?: string;
}

function cloneSeedData(): SeedDataBundle {
  return {
    board: structuredClone(boardSeed) as SeedDataBundle["board"],
    properties: structuredClone(propertiesSeed) as SeedDataBundle["properties"],
    chanceCards: structuredClone(chanceSeed) as SeedDataBundle["chanceCards"],
    fateCards: structuredClone(fateSeed) as SeedDataBundle["fateCards"],
    shopItems: structuredClone(shopSeed) as SeedDataBundle["shopItems"],
    questionBank: structuredClone(questionsSeed) as SeedDataBundle["questionBank"],
    gameConfig: structuredClone(configSeed) as SeedDataBundle["gameConfig"]
  };
}

export function getDefaultDataBundle(): SeedDataBundle {
  return cloneSeedData();
}

export function loadDataBundle(): StoredDataBundle {
  const fallback = cloneSeedData();
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw) as Partial<StoredDataBundle>;
    if (!parsed || typeof parsed !== "object") {
      return fallback;
    }

    const questionBankRaw = Array.isArray(parsed.questionBank) ? parsed.questionBank : fallback.questionBank;

    const rawConfig =
      parsed.gameConfig && typeof parsed.gameConfig === "object"
        ? (parsed.gameConfig as StoredDataBundle["gameConfig"])
        : fallback.gameConfig;

    return {
      board: Array.isArray(parsed.board) ? parsed.board : fallback.board,
      properties: Array.isArray(parsed.properties) ? parsed.properties : fallback.properties,
      chanceCards: Array.isArray(parsed.chanceCards) ? parsed.chanceCards : fallback.chanceCards,
      fateCards: Array.isArray(parsed.fateCards) ? parsed.fateCards : fallback.fateCards,
      shopItems: Array.isArray(parsed.shopItems) ? parsed.shopItems : fallback.shopItems,
      questionBank: questionBankRaw.map((question) => ({
        ...question,
        enabled: typeof question.enabled === "boolean" ? question.enabled : true
      })),
      gameConfig: {
        ...rawConfig,
        quizConfig: {
          ...fallback.gameConfig.quizConfig,
          ...(rawConfig.quizConfig ?? {})
        }
      }
    };
  } catch {
    return fallback;
  }
}

export function saveDataBundle(bundle: StoredDataBundle): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bundle));
}

export function resetDataBundle(): StoredDataBundle {
  const seed = cloneSeedData();
  saveDataBundle(seed);
  return seed;
}

export function exportBundleString(bundle: StoredDataBundle): string {
  return JSON.stringify(bundle, null, 2);
}

export function importBundleString(input: string): StoredDataBundle {
  const parsed = JSON.parse(input) as StoredDataBundle;

  const requiredKeys: (keyof StoredDataBundle)[] = [
    "board",
    "properties",
    "chanceCards",
    "fateCards",
    "shopItems",
    "questionBank",
    "gameConfig"
  ];

  for (const key of requiredKeys) {
    if (!(key in parsed)) {
      throw new Error(`缺少必要欄位: ${String(key)}`);
    }
  }

  return parsed;
}

function normalizeQuestionText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function generateUniqueQuestionId(baseId: string, existingIds: Set<string>): { nextId: string; changed: boolean } {
  const trimmed = baseId.trim();
  const safeBase = trimmed.length > 0 ? trimmed : "q_import";
  if (!existingIds.has(safeBase)) {
    return { nextId: safeBase, changed: false };
  }

  let index = 1;
  let candidate = `${safeBase}_copy_${index}`;
  while (existingIds.has(candidate)) {
    index += 1;
    candidate = `${safeBase}_copy_${index}`;
  }
  return { nextId: candidate, changed: true };
}

function validateQuestionShape(question: Partial<QuestionDef>, index: number): { isValid: boolean; reason?: string } {
  const row = `第 ${index + 1} 題`;
  if (!question || typeof question !== "object") {
    return { isValid: false, reason: `${row}：題目結構錯誤` };
  }
  if (typeof question.question !== "string" || normalizeQuestionText(question.question).length === 0) {
    return { isValid: false, reason: `${row}：題目不可為空` };
  }
  if (!Array.isArray(question.options) || question.options.length !== 4 || question.options.some((option) => typeof option !== "string")) {
    return { isValid: false, reason: `${row}：選項必須是 4 個文字` };
  }
  if (typeof question.answerIndex !== "number" || question.answerIndex < 0 || question.answerIndex > 3) {
    return { isValid: false, reason: `${row}：正確答案索引需介於 0~3` };
  }
  return { isValid: true };
}

function normalizeQuestion(question: Partial<QuestionDef>, fallbackIndex: number): QuestionDef {
  return {
    id: typeof question.id === "string" && question.id.trim() ? question.id.trim() : `q_import_${Date.now()}_${fallbackIndex}`,
    question: typeof question.question === "string" ? question.question.trim() : "",
    options: Array.isArray(question.options) ? question.options.map((option) => String(option ?? "").trim()) : ["", "", "", ""],
    answerIndex: typeof question.answerIndex === "number" ? question.answerIndex : 0,
    explanation: typeof question.explanation === "string" ? question.explanation : "",
    category: typeof question.category === "string" ? question.category : "一般",
    difficulty:
      question.difficulty === "easy" || question.difficulty === "medium" || question.difficulty === "hard"
        ? question.difficulty
        : "easy",
    enabled: typeof question.enabled === "boolean" ? question.enabled : true,
    reward: {
      money: typeof question.reward?.money === "number" ? question.reward.money : 0,
      moveSteps: typeof question.reward?.moveSteps === "number" ? question.reward.moveSteps : 0,
      skipTurns: typeof question.reward?.skipTurns === "number" ? question.reward.skipTurns : 0
    },
    penalty: {
      money: typeof question.penalty?.money === "number" ? question.penalty.money : 0,
      moveSteps: typeof question.penalty?.moveSteps === "number" ? question.penalty.moveSteps : 0,
      skipTurns: typeof question.penalty?.skipTurns === "number" ? question.penalty.skipTurns : 0
    }
  };
}

export function extractQuestionBankFromImport(input: string): QuestionDef[] {
  const parsed = JSON.parse(input) as unknown;
  if (Array.isArray(parsed)) {
    return parsed as QuestionDef[];
  }
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as Partial<StoredDataBundle>).questionBank)) {
    return (parsed as Partial<StoredDataBundle>).questionBank as QuestionDef[];
  }
  throw new Error("匯入檔格式不正確：需為完整設定 JSON（含 questionBank）或純題庫陣列。");
}

export function mergeQuestionBank(
  existing: QuestionDef[],
  incoming: QuestionDef[],
  mode: QuestionImportMode
): { next: QuestionDef[]; report: QuestionImportReport } {
  const report: QuestionImportReport = {
    mode,
    incomingCount: incoming.length,
    addedCount: 0,
    changedIdCount: 0,
    skippedDuplicateTextCount: 0,
    invalidCount: 0
  };

  if (mode === "overwrite") {
    const validQuestions: QuestionDef[] = [];
    incoming.forEach((rawQuestion, index) => {
      const validation = validateQuestionShape(rawQuestion, index);
      if (!validation.isValid) {
        report.invalidCount += 1;
        if (!report.firstInvalidReason && validation.reason) {
          report.firstInvalidReason = validation.reason;
        }
        return;
      }
      validQuestions.push(normalizeQuestion(rawQuestion, index));
    });
    report.addedCount = validQuestions.length;
    return { next: validQuestions, report };
  }

  const next = [...existing];
  const existingIds = new Set(existing.map((question) => question.id));
  const existingTexts = new Set(existing.map((question) => normalizeQuestionText(question.question)));

  incoming.forEach((rawQuestion, index) => {
    const validation = validateQuestionShape(rawQuestion, index);
    if (!validation.isValid) {
      report.invalidCount += 1;
      if (!report.firstInvalidReason && validation.reason) {
        report.firstInvalidReason = validation.reason;
      }
      return;
    }

    const normalizedQuestion = normalizeQuestion(rawQuestion, index);
    const normalizedText = normalizeQuestionText(normalizedQuestion.question);
    if (existingTexts.has(normalizedText)) {
      report.skippedDuplicateTextCount += 1;
      return;
    }

    const { nextId, changed } = generateUniqueQuestionId(normalizedQuestion.id, existingIds);
    if (changed) {
      report.changedIdCount += 1;
      normalizedQuestion.id = nextId;
    }

    next.push(normalizedQuestion);
    existingIds.add(normalizedQuestion.id);
    existingTexts.add(normalizedText);
    report.addedCount += 1;
  });

  return { next, report };
}
