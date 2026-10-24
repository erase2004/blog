# 01: Astro 骨架、Worker 設定與搬遷日誌

**What to build:** 從 Astro 官方 `blog` 範本建立網站骨架，並設定 Cloudflare Workers static assets，讓網站能在本機以接近正式環境的方式執行。同時建立搬遷日誌，把規劃階段的結論記錄下來。

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] 以 Astro 官方 `blog` 範本建立專案，固定 Node 版本與套件管理工具
- [x] 移除範本附帶、spec 用不到的示範內容
- [x] 建置輸出採目錄格式，每個頁面都輸出成 `<路徑>/index.html`
- [x] Worker 設定 `html_handling: "force-trailing-slash"` 與 `not_found_handling: "404-page"`
- [x] 用 `wrangler dev` 啟動後，缺結尾斜線的網址會 301 到有斜線的版本
- [x] 用 `wrangler dev` 啟動後，不存在的網址回 HTTP 404（先用簡單的 404 頁，正式版在 17 號）
- [x] 建立搬遷日誌 `docs/migration-log.md`，記錄規劃階段的主要決策與理由：平台、框架、網址策略、媒體處理、驗證方式
- [x] 搬遷日誌記下查證過的 Cloudflare 限制，以及尚未查證、要在預覽網址實測的項目
