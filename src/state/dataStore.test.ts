import { describe, expect, it } from "vitest";
import { extractQuestionBankFromImport, mergeQuestionBank } from "./dataStore";
import type { QuestionDef } from "../types/game";

function makeQuestion(id: string, question: string): QuestionDef {
  return {
    id,
    question,
    options: ["A", "B", "C", "D"],
    answerIndex: 0,
    explanation: "",
    category: "一般",
    difficulty: "easy",
    enabled: true,
    reward: { money: 100, moveSteps: 0, skipTurns: 0 },
    penalty: { money: -100, moveSteps: 0, skipTurns: 0 }
  };
}

describe("extractQuestionBankFromImport", () => {
  it("支援純題庫陣列", () => {
    const input = JSON.stringify([makeQuestion("q1", "題目1")]);
    const result = extractQuestionBankFromImport(input);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("q1");
  });

  it("支援完整設定 JSON", () => {
    const input = JSON.stringify({ questionBank: [makeQuestion("q1", "題目1")] });
    const result = extractQuestionBankFromImport(input);
    expect(result).toHaveLength(1);
    expect(result[0].question).toBe("題目1");
  });
});

describe("mergeQuestionBank", () => {
  it("追加模式：id 重複改新 id，題幹重複略過", () => {
    const existing = [makeQuestion("id01", "星期五的英文是什麼")];
    const incoming = [
      makeQuestion("id01", "高雄港位於哪個城市"),
      makeQuestion("id02", "星期五的英文是什麼")
    ];

    const { next, report } = mergeQuestionBank(existing, incoming, "append");

    expect(next).toHaveLength(2);
    expect(next.some((question) => question.id === "id01_copy_1")).toBe(true);
    expect(report.changedIdCount).toBe(1);
    expect(report.skippedDuplicateTextCount).toBe(1);
    expect(report.addedCount).toBe(1);
  });

  it("覆蓋模式：只保留匯入題庫", () => {
    const existing = [makeQuestion("old", "舊題目")];
    const incoming = [makeQuestion("new", "新題目")];
    const { next, report } = mergeQuestionBank(existing, incoming, "overwrite");

    expect(next).toHaveLength(1);
    expect(next[0].id).toBe("new");
    expect(report.addedCount).toBe(1);
  });
});
