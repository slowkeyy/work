# 排班系統

物業管理月排班工具 — 純前端，部署在 GitHub Pages。

## 功能進度

| 階段 | 功能 | 狀態 |
|---|---|---|
| Phase 1 | 案場 / 員工 / 機動人員 設定 + JSON 備份 | ✅ 完成 |
| Phase 2 | 月份休假輸入（必休 + 偏好） | ✅ 完成 |
| Phase 3 | 自動排班演算法 + 月曆檢視 + CSV 匯出 | ⏳ 待開發 |

## 本機試跑

直接用瀏覽器打開 `index.html` 就能跑（雙擊或拖到瀏覽器都行）。

## 部署到 GitHub Pages

1. 在 GitHub 建一個新 repo（例如 `schedule-app`），可設為 Private 或 Public
2. 把這個資料夾的所有檔案推上去：
   ```bash
   git init
   git add .
   git commit -m "init"
   git branch -M main
   git remote add origin https://github.com/你的帳號/schedule-app.git
   git push -u origin main
   ```
3. 進到 repo 的 **Settings → Pages**
4. **Source** 選 `Deploy from a branch`，分支選 `main`，資料夾選 `/ (root)`，按 Save
5. 等 1~2 分鐘，網址會出現在頁面頂部，類似 `https://你的帳號.github.io/schedule-app/`

## 資料儲存

- 資料存在瀏覽器 **localStorage**（換瀏覽器、清快取會不見）
- **強烈建議定期到「備份」頁匯出 JSON**
- 換電腦使用：在新電腦打開網站 → 備份頁 → 匯入 JSON

## 規則設計

| 項目 | 規則 |
|---|---|
| 排班週期 | 每月 |
| 班別 | 早班 / 晚班，員工固定屬於某個班別 |
| 員工休假天數 | 大月 7 天 / 小月 6 天 |
| 必休（硬性） | 員工指定 2 天，100% 給休 |
| 偏好（軟性） | 剩下的 4 ~ 5 天，盡量給休 |
| 案場最低人數 | 早班、晚班分開計算 |
| 機動人員 | 補各案場缺口；同日只能在一處；休假規則同員工 |
