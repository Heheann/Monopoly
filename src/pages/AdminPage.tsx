import { useMemo, useState } from "react";
import {
  extractQuestionBankFromImport,
  exportBundleString,
  getDefaultDataBundle,
  importBundleString,
  loadDataBundle,
  mergeQuestionBank,
  type QuestionImportMode,
  resetDataBundle,
  saveDataBundle
} from "../state/dataStore";
import type { BoardTile, CardDef, PropertyDef, QuestionDef, SeedDataBundle, ShopItemDef } from "../types/game";

type TabKey =
  | "board"
  | "properties"
  | "chanceCards"
  | "fateCards"
  | "shopItems"
  | "questionBank"
  | "gameConfig";

type QuestionValidationResult = {
  isValid: boolean;
  errors: string[];
};

function coerceValue(originalValue: unknown, value: string): unknown {
  if (typeof originalValue === "number") {
    const num = Number(value);
    return Number.isFinite(num) ? num : originalValue;
  }
  if (typeof originalValue === "boolean") {
    return value === "true";
  }
  if (Array.isArray(originalValue) || (typeof originalValue === "object" && originalValue !== null)) {
    try {
      return JSON.parse(value);
    } catch {
      return originalValue;
    }
  }
  return value;
}

function validateQuestions(questions: QuestionDef[]): QuestionValidationResult {
  const errors: string[] = [];
  questions.forEach((question, index) => {
    const row = `第 ${index + 1} 題`;
    if (!question.question.trim()) {
      errors.push(`${row}：題目不可為空`);
    }
    if (question.options.length !== 4) {
      errors.push(`${row}：選項必須剛好 4 個`);
    }
    if (question.answerIndex < 0 || question.answerIndex > 3) {
      errors.push(`${row}：正確答案索引需介於 0~3`);
    }
  });
  return {
    isValid: errors.length === 0,
    errors
  };
}

function ArrayEditor<T extends object>({
  title,
  rows,
  onChange,
  createNew
}: {
  title: string;
  rows: T[];
  onChange: (next: T[]) => void;
  createNew: () => T;
}) {
  const keys = useMemo(() => {
    const allKeys = new Set<string>();
    rows.forEach((row) => {
      Object.keys(row as Record<string, unknown>).forEach((key) => allKeys.add(key));
    });
    return Array.from(allKeys);
  }, [rows]);

  const updateCell = (rowIndex: number, key: string, value: string) => {
    onChange(
      rows.map((row, index) => {
        if (index !== rowIndex) {
          return row;
        }

        const asRecord = row as Record<string, unknown>;
        const original = asRecord[key];
        return {
          ...asRecord,
          [key]: coerceValue(original, value)
        } as T;
      })
    );
  };

  const deleteRow = (rowIndex: number) => {
    onChange(rows.filter((_, index) => index !== rowIndex));
  };

  const addRow = () => {
    onChange([...rows, createNew()]);
  };

  return (
    <section className="admin-section">
      <div className="admin-section-head">
        <h3>{title}</h3>
        <button onClick={addRow}>新增</button>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>#</th>
              {keys.map((key) => (
                <th key={`${title}_${key}`}>{key}</th>
              ))}
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`${title}_${rowIndex}`}>
                <td>{rowIndex + 1}</td>
                {keys.map((key) => {
                  const value = (row as Record<string, unknown>)[key];
                  const display =
                    typeof value === "object" && value !== null ? JSON.stringify(value) : value === undefined ? "" : String(value);
                  return (
                    <td key={`${title}_${rowIndex}_${key}`}>
                      <input value={display} onChange={(event) => updateCell(rowIndex, key, event.target.value)} />
                    </td>
                  );
                })}
                <td>
                  <button className="danger-btn" onClick={() => deleteRow(rowIndex)}>
                    刪除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function AdminPage() {
  const [bundle, setBundle] = useState<SeedDataBundle>(loadDataBundle());
  const [activeTab, setActiveTab] = useState<TabKey>("board");
  const [statusText, setStatusText] = useState("已載入目前設定");
  const [questionCategoryFilter, setQuestionCategoryFilter] = useState("全部");
  const [questionDifficultyFilter, setQuestionDifficultyFilter] = useState("全部");
  const [showDisabledQuestion, setShowDisabledQuestion] = useState(true);
  const [questionImportMode, setQuestionImportMode] = useState<QuestionImportMode>("overwrite");

  const applyChanges = () => {
    const validation = validateQuestions(bundle.questionBank);
    if (!validation.isValid) {
      setStatusText(`題庫驗證失敗：${validation.errors[0]}`);
      return;
    }
    saveDataBundle(bundle);
    setStatusText("已儲存並套用設定。回到遊戲頁點擊『重新載入資料』即可生效。");
  };

  const restoreDefault = () => {
    const defaults = resetDataBundle();
    setBundle(defaults);
    setStatusText("已還原為預設資料。");
  };

  const exportJson = () => {
    const content = exportBundleString(bundle);
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "kaohsiung-monopoly-config.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setStatusText("已匯出 JSON。");
  };

  const importJsonFile = async (file: File | null) => {
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const imported = importBundleString(text);
      setBundle(imported);
      saveDataBundle(imported);
      setStatusText("完整設定匯入成功並已儲存。");
    } catch (error) {
      const message = error instanceof Error ? error.message : "匯入失敗";
      setStatusText(`匯入失敗：${message}`);
    }
  };

  const importQuestionBankFile = async (file: File | null) => {
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const incomingQuestions = extractQuestionBankFromImport(text);
      const { next, report } = mergeQuestionBank(bundle.questionBank, incomingQuestions, questionImportMode);

      const nextBundle = {
        ...bundle,
        questionBank: next
      };
      setBundle(nextBundle);
      saveDataBundle(nextBundle);

      const reportText =
        `題庫匯入完成（模式：${report.mode === "overwrite" ? "全部覆蓋" : "追加題目"}）` +
        `，來源 ${report.incomingCount} 題，新增 ${report.addedCount} 題，改 id ${report.changedIdCount} 題，` +
        `略過題幹重複 ${report.skippedDuplicateTextCount} 題，無效 ${report.invalidCount} 題。` +
        (report.firstInvalidReason ? ` 首筆錯誤：${report.firstInvalidReason}` : "");
      setStatusText(reportText);
    } catch (error) {
      const message = error instanceof Error ? error.message : "題庫匯入失敗";
      setStatusText(`題庫匯入失敗：${message}`);
    }
  };

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "board", label: "棋盤格子" },
    { key: "properties", label: "景點資料" },
    { key: "chanceCards", label: "機會卡" },
    { key: "fateCards", label: "命運卡" },
    { key: "shopItems", label: "商店商品" },
    { key: "questionBank", label: "題庫" },
    { key: "gameConfig", label: "遊戲設定" }
  ];

  const questionCategories = useMemo(() => {
    const categories = Array.from(new Set(bundle.questionBank.map((item) => item.category)));
    return ["全部", ...categories];
  }, [bundle.questionBank]);

  const filteredQuestions = useMemo(() => {
    return bundle.questionBank.filter((question) => {
      if (!showDisabledQuestion && !question.enabled) {
        return false;
      }
      if (questionCategoryFilter !== "全部" && question.category !== questionCategoryFilter) {
        return false;
      }
      if (questionDifficultyFilter !== "全部" && question.difficulty !== questionDifficultyFilter) {
        return false;
      }
      return true;
    });
  }, [bundle.questionBank, questionCategoryFilter, questionDifficultyFilter, showDisabledQuestion]);

  return (
    <main className="admin-page">
      <section className="admin-toolbar">
        <div className="tab-row">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={activeTab === tab.key ? "tab-btn active" : "tab-btn"}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="admin-actions">
          <button className="primary-btn" onClick={applyChanges}>
            儲存並套用
          </button>
          <button onClick={exportJson}>匯出 JSON</button>
          <label className="file-label">
            匯入完整設定
            <input
              type="file"
              accept="application/json"
              onChange={(event) => importJsonFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <button className="danger-btn" onClick={restoreDefault}>
            還原預設
          </button>
        </div>

        <p className="admin-status">{statusText}</p>
      </section>

      {activeTab === "board" ? (
        <ArrayEditor<BoardTile>
          title="棋盤格子"
          rows={bundle.board}
          onChange={(next) => setBundle((prev) => ({ ...prev, board: next }))}
          createNew={(): BoardTile => ({
            id: `tile_${Date.now()}`,
            name: "新格子",
            type: "public",
            group: "public",
            color: "#cccccc",
            price: 0,
            rent: [0],
            upgradeCosts: [],
            icon: "📍",
            description: "請編輯描述",
            position: bundle.board.length
          })}
        />
      ) : null}

      {activeTab === "properties" ? (
        <ArrayEditor<PropertyDef>
          title="景點資料"
          rows={bundle.properties}
          onChange={(next) => setBundle((prev) => ({ ...prev, properties: next }))}
          createNew={(): PropertyDef => ({
            id: `property_${Date.now()}`,
            boardTileId: "",
            name: "新景點",
            group: "未分類",
            color: "#999999",
            price: 1000,
            rent: [100, 200, 300, 400],
            upgradeCosts: [500, 800, 1200],
            description: "請編輯",
            houseLabels: ["小攤位", "特色民宿", "主題旅館"]
          })}
        />
      ) : null}

      {activeTab === "chanceCards" ? (
        <ArrayEditor<CardDef>
          title="機會卡"
          rows={bundle.chanceCards}
          onChange={(next) => setBundle((prev) => ({ ...prev, chanceCards: next }))}
          createNew={(): CardDef => ({
            id: `chance_${Date.now()}`,
            title: "新機會卡",
            description: "請填寫效果",
            type: "chance",
            effectType: "MONEY",
            effectValue: 100,
            target: "self",
            icon: "❗",
            rarity: "common"
          })}
        />
      ) : null}

      {activeTab === "fateCards" ? (
        <ArrayEditor<CardDef>
          title="命運卡"
          rows={bundle.fateCards}
          onChange={(next) => setBundle((prev) => ({ ...prev, fateCards: next }))}
          createNew={(): CardDef => ({
            id: `fate_${Date.now()}`,
            title: "新命運卡",
            description: "請填寫效果",
            type: "fate",
            effectType: "MONEY",
            effectValue: -100,
            target: "self",
            icon: "❓",
            rarity: "common"
          })}
        />
      ) : null}

      {activeTab === "shopItems" ? (
        <ArrayEditor<ShopItemDef>
          title="商店商品"
          rows={bundle.shopItems}
          onChange={(next) => setBundle((prev) => ({ ...prev, shopItems: next }))}
          createNew={(): ShopItemDef => ({
            id: `item_${Date.now()}`,
            name: "新道具",
            type: "custom",
            price: 500,
            icon: "🎁",
            description: "請描述道具效果",
            timing: "own_turn",
            stackable: true,
            maxCarry: 2,
            effect: { kind: "MONEY_IMMUNITY", value: 1 }
          })}
        />
      ) : null}

      {activeTab === "questionBank" ? (
        <section className="admin-section">
          <div className="admin-section-head">
            <h3>題庫管理（專用後台）</h3>
            <button
              onClick={() =>
                setBundle((prev) => ({
                  ...prev,
                  questionBank: [
                    ...prev.questionBank,
                    {
                      id: `q_${Date.now()}`,
                      question: "請輸入題目",
                      options: ["選項 A", "選項 B", "選項 C", "選項 D"],
                      answerIndex: 0,
                      explanation: "請輸入解析",
                      category: "一般",
                      difficulty: "easy",
                      enabled: true,
                      reward: { money: 300, moveSteps: 0, skipTurns: 0 },
                      penalty: { money: -200, moveSteps: 0, skipTurns: 0 }
                    }
                  ]
                }))
              }
            >
              新增題目
            </button>
          </div>

          <div className="question-filter-row">
            <label>
              匯入模式
              <select
                value={questionImportMode}
                onChange={(event) => setQuestionImportMode(event.target.value as QuestionImportMode)}
              >
                <option value="overwrite">全部覆蓋（只覆蓋題庫）</option>
                <option value="append">追加題目</option>
              </select>
            </label>
            <label className="file-label">
              匯入題庫 JSON
              <input
                type="file"
                accept="application/json"
                onChange={(event) => importQuestionBankFile(event.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <p className="hint-text">支援完整設定 JSON（取 questionBank）或純題庫陣列 JSON。</p>

          <div className="question-filter-row">
            <label>
              分類
              <select value={questionCategoryFilter} onChange={(event) => setQuestionCategoryFilter(event.target.value)}>
                {questionCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label>
              難度
              <select value={questionDifficultyFilter} onChange={(event) => setQuestionDifficultyFilter(event.target.value)}>
                {["全部", "easy", "medium", "hard"].map((difficulty) => (
                  <option key={difficulty} value={difficulty}>
                    {difficulty}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={showDisabledQuestion}
                onChange={(event) => setShowDisabledQuestion(event.target.checked)}
              />
              顯示停用題目
            </label>
          </div>

          <div className="question-editor-list">
            {filteredQuestions.map((question) => {
              const sourceIndex = bundle.questionBank.findIndex((item) => item.id === question.id);
              return (
                <article key={question.id} className="question-editor-card">
                  <header>
                    <strong>{question.id}</strong>
                    <div className="question-card-actions">
                      <button
                        onClick={() =>
                          setBundle((prev) => ({
                            ...prev,
                            questionBank: prev.questionBank.filter((item) => item.id !== question.id)
                          }))
                        }
                        className="danger-btn"
                      >
                        刪除
                      </button>
                    </div>
                  </header>

                  <label>
                    題目
                    <textarea
                      value={question.question}
                      onChange={(event) =>
                        setBundle((prev) => {
                          const next = [...prev.questionBank];
                          next[sourceIndex] = { ...next[sourceIndex], question: event.target.value };
                          return { ...prev, questionBank: next };
                        })
                      }
                    />
                  </label>

                  <div className="question-option-grid">
                    {question.options.map((option, optionIndex) => (
                      <label key={`${question.id}_option_${optionIndex}`}>
                        選項 {String.fromCharCode(65 + optionIndex)}
                        <input
                          value={option}
                          onChange={(event) =>
                            setBundle((prev) => {
                              const next = [...prev.questionBank];
                              const nextOptions = [...next[sourceIndex].options];
                              nextOptions[optionIndex] = event.target.value;
                              next[sourceIndex] = { ...next[sourceIndex], options: nextOptions };
                              return { ...prev, questionBank: next };
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>

                  <div className="question-meta-row">
                    <label>
                      正解索引
                      <select
                        value={question.answerIndex}
                        onChange={(event) =>
                          setBundle((prev) => {
                            const next = [...prev.questionBank];
                            next[sourceIndex] = { ...next[sourceIndex], answerIndex: Number(event.target.value) };
                            return { ...prev, questionBank: next };
                          })
                        }
                      >
                        <option value={0}>A</option>
                        <option value={1}>B</option>
                        <option value={2}>C</option>
                        <option value={3}>D</option>
                      </select>
                    </label>
                    <label>
                      分類
                      <input
                        value={question.category}
                        onChange={(event) =>
                          setBundle((prev) => {
                            const next = [...prev.questionBank];
                            next[sourceIndex] = { ...next[sourceIndex], category: event.target.value };
                            return { ...prev, questionBank: next };
                          })
                        }
                      />
                    </label>
                    <label>
                      難度
                      <select
                        value={question.difficulty}
                        onChange={(event) =>
                          setBundle((prev) => {
                            const next = [...prev.questionBank];
                            next[sourceIndex] = {
                              ...next[sourceIndex],
                              difficulty: event.target.value as QuestionDef["difficulty"]
                            };
                            return { ...prev, questionBank: next };
                          })
                        }
                      >
                        <option value="easy">easy</option>
                        <option value="medium">medium</option>
                        <option value="hard">hard</option>
                      </select>
                    </label>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={question.enabled}
                        onChange={(event) =>
                          setBundle((prev) => {
                            const next = [...prev.questionBank];
                            next[sourceIndex] = { ...next[sourceIndex], enabled: event.target.checked };
                            return { ...prev, questionBank: next };
                          })
                        }
                      />
                      啟用
                    </label>
                  </div>

                  <label>
                    解析
                    <textarea
                      value={question.explanation}
                      onChange={(event) =>
                        setBundle((prev) => {
                          const next = [...prev.questionBank];
                          next[sourceIndex] = { ...next[sourceIndex], explanation: event.target.value };
                          return { ...prev, questionBank: next };
                        })
                      }
                    />
                  </label>

                  <div className="question-meta-row">
                    <label>
                      答對獎勵金
                      <input
                        type="number"
                        value={question.reward.money}
                        onChange={(event) =>
                          setBundle((prev) => {
                            const next = [...prev.questionBank];
                            next[sourceIndex] = {
                              ...next[sourceIndex],
                              reward: { ...next[sourceIndex].reward, money: Number(event.target.value) }
                            };
                            return { ...prev, questionBank: next };
                          })
                        }
                      />
                    </label>
                    <label>
                      答錯懲罰金
                      <input
                        type="number"
                        value={question.penalty.money}
                        onChange={(event) =>
                          setBundle((prev) => {
                            const next = [...prev.questionBank];
                            next[sourceIndex] = {
                              ...next[sourceIndex],
                              penalty: { ...next[sourceIndex].penalty, money: Number(event.target.value) }
                            };
                            return { ...prev, questionBank: next };
                          })
                        }
                      />
                    </label>
                    <label>
                      答對位移
                      <input
                        type="number"
                        value={question.reward.moveSteps}
                        onChange={(event) =>
                          setBundle((prev) => {
                            const next = [...prev.questionBank];
                            next[sourceIndex] = {
                              ...next[sourceIndex],
                              reward: { ...next[sourceIndex].reward, moveSteps: Number(event.target.value) }
                            };
                            return { ...prev, questionBank: next };
                          })
                        }
                      />
                    </label>
                    <label>
                      答錯位移
                      <input
                        type="number"
                        value={question.penalty.moveSteps}
                        onChange={(event) =>
                          setBundle((prev) => {
                            const next = [...prev.questionBank];
                            next[sourceIndex] = {
                              ...next[sourceIndex],
                              penalty: { ...next[sourceIndex].penalty, moveSteps: Number(event.target.value) }
                            };
                            return { ...prev, questionBank: next };
                          })
                        }
                      />
                    </label>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {activeTab === "gameConfig" ? (
        <section className="admin-section">
          <h3>遊戲設定（題目規則）</h3>
          <div className="question-meta-row">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={bundle.gameConfig.quizConfig.turnGateEnabled}
                onChange={(event) =>
                  setBundle((prev) => ({
                    ...prev,
                    gameConfig: {
                      ...prev.gameConfig,
                      quizConfig: {
                        ...prev.gameConfig.quizConfig,
                        turnGateEnabled: event.target.checked
                      }
                    }
                  }))
                }
              />
              啟用每回合先答題
            </label>
            <label>
              抽題策略
              <select
                value={bundle.gameConfig.quizConfig.drawPolicy}
                onChange={(event) =>
                  setBundle((prev) => ({
                    ...prev,
                    gameConfig: {
                      ...prev.gameConfig,
                      quizConfig: {
                        ...prev.gameConfig.quizConfig,
                        drawPolicy: event.target.value as "random_no_repeat"
                      }
                    }
                  }))
                }
              >
                <option value="random_no_repeat">random_no_repeat</option>
              </select>
            </label>
            <label>
              必須選項數
              <input
                type="number"
                min={4}
                max={4}
                value={bundle.gameConfig.quizConfig.requireOptionsCount}
                onChange={(event) =>
                  setBundle((prev) => ({
                    ...prev,
                    gameConfig: {
                      ...prev.gameConfig,
                      quizConfig: {
                        ...prev.gameConfig.quizConfig,
                        requireOptionsCount: Number(event.target.value) || 4
                      }
                    }
                  }))
                }
              />
            </label>
          </div>
          <p>失敗策略固定為：end_turn（答錯即本回合行動失敗）。</p>

          <h3>完整 gameConfig JSON</h3>
          <textarea
            className="config-editor"
            value={JSON.stringify(bundle.gameConfig, null, 2)}
            onChange={(event) => {
              try {
                const parsed = JSON.parse(event.target.value);
                setBundle((prev) => ({ ...prev, gameConfig: parsed }));
                setStatusText("gameConfig 編輯中");
              } catch {
                setStatusText("gameConfig JSON 格式錯誤，尚未套用。");
              }
            }}
          />
        </section>
      ) : null}

      <section className="admin-section">
        <h3>完整資料預覽</h3>
        <textarea className="preview-editor" value={JSON.stringify(bundle, null, 2)} readOnly />
      </section>

      <section className="admin-section">
        <h3>資料模型說明</h3>
        <ul>
          <li>棋盤格欄位：id, name, type, group, color, price, rent, upgradeCosts, icon, description, position</li>
          <li>玩家欄位：id, name, token, position, money, ownedProperties, inventory, statusEffects</li>
          <li>道具欄位：id, name, type, price, icon, description, timing, stackable, maxCarry, effect</li>
        </ul>
      </section>

      <section className="admin-section">
        <h3>備註</h3>
        <p>若你修改了棋盤格位置，請同步更新 position 以維持 0~23 外圈順序。</p>
      </section>

      <section className="admin-section">
        <h3>快速還原檔案範本</h3>
        <button onClick={() => setBundle(getDefaultDataBundle())}>載入內建範本到編輯區（未儲存）</button>
      </section>
    </main>
  );
}
