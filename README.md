# 台灣人的政治光譜

靜態網站，入口為 `index.html`，資源在 `assets/`（`data.js` 題庫與政黨估計、`app.js` 介面與計分、`style.css` 樣式）。
不依賴任何外部 CDN、字型或追蹤服務；作答只在瀏覽器計算，進度存於 localStorage。

部署到 GitHub Pages：把本資料夾內容放在 repo 根目錄（或 `docs/`），在 Settings → Pages 選擇對應分支與資料夾即可。
本站由推送到 `main` 觸發的 GitHub Actions 工作流程（`.github/workflows/pages.yml`）發布。
