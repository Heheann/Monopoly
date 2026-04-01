# 高雄景點大富翁 MVP

React + Vite + TypeScript 單機版網頁遊戲，含前台 `/` 與後台 `/admin`。

## 啟動

```bash
npm install
npm run dev
```

## 功能

- 24 格環狀棋盤（高雄主題）
- 擲骰、移動、過起點領錢
- 景點購買、升級、收租
- 機會卡 / 命運卡
- 商店購買與背包道具使用
- 題目格四選一問答
- 後台 CRUD 與 JSON 匯入匯出
- localStorage 持久化

## 主要資料檔

- `src/data/board.json`
- `src/data/properties.json`
- `src/data/chanceCards.json`
- `src/data/fateCards.json`
- `src/data/shopItems.json`
- `src/data/questionBank.json`
- `src/data/gameConfig.json`

## 測試

```bash
npm run test
```

## 打包

```bash
npm run build
```
