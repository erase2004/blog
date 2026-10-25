# TsukiStudio

[aniya.moe](https://aniya.moe) 的原始碼：Tsuki 的個人部落格，紀錄生活點滴、技術筆記和旅遊遊記。

2026 年 10 月從 WordPress 搬到 Astro 靜態網站，部署在 Cloudflare Workers。WordPress 時期的每個網址都有處理：照舊打開、301 轉到新網址，或刻意回 404。搬家的過程和決策記在 [`docs/migration-log.md`](docs/migration-log.md)。

## 使用的技術

- [Astro](https://astro.build/)：用 Markdown／MDX 寫文章，建置成靜態 HTML，圖片轉成多種寬度的 webp
- [Expressive Code](https://expressive-code.com/)：程式碼區塊
- [Pagefind](https://pagefind.app/)：站內搜尋
- [giscus](https://giscus.app/)：留言，存在這個 repo 的 GitHub Discussions
- [Cloudflare Workers](https://developers.cloudflare.com/workers/static-assets/)：提供靜態檔案和 `_redirects` 轉址，另有一個小 Worker 處理 WordPress 的 `/?p=` 這類舊網址
- Cloudflare R2：影片和 PDF，放在 `media.aniya.moe`
- GitHub Actions：建置、測試、部署，並且每週檢查正式站

## 目錄

```text
src/
├── content/posts/    # 文章（.md／.mdx）
├── content/pages/    # 頁面（關於我、隱私權政策…）
├── assets/images/    # 圖片，一篇文章一個資料夾
├── data/             # 分類、標籤、舊網址對照表
├── pages/            # 網址路由
├── components/
├── integrations/     # 建置時產生 _redirects 等檔案
└── worker.ts         # 處理 WordPress 查詢字串網址的 Worker
scripts/
├── url-checker/          # 舊網址檢查
├── r2-media/             # 上傳、驗證 R2 上的影片
└── wordpress-converter/  # 當初把 WordPress 轉成 Markdown 的程式，保留作紀錄
tests/
docs/
```

## 開發

需要 Node.js 24 和 npm 11。

```sh
npm ci        # 安裝套件，同時啟用 git hook
npm run dev   # 開發伺服器，http://localhost:4321
```

| 指令 | 用途 |
| --- | --- |
| `npm run dev` | 開發伺服器 |
| `npm run build` | 建置到 `dist/` |
| `npm run preview` | 建置後用 `wrangler dev` 在本機模擬 Cloudflare |
| `npm run check` | 型別檢查 |
| `npm test` | 單元測試和網站測試（第一次要先跑 `npx playwright install chromium`） |
| `npm run check-urls -- build` | 用建置結果檢查每個舊網址 |
| `npm run check-urls -- http <網址>` | 對執行中的網站檢查每個舊網址 |
| `npm run upload-media`、`npm run verify-media` | 上傳、驗證 R2 上的影片（需要 Cloudflare 憑證） |

`npm run convert-wordpress` 會清空 `src/content/`，再從 WordPress 備份重新產生，所以要加 `-- --overwrite-content` 才會執行。現在的文章以 Markdown 為準，直接編輯就好。

## 寫文章

在 `src/content/posts/` 新增 `.md` 檔（要用元件時用 `.mdx`）：

```markdown
---
title: "文章標題"
slug: "post-slug"
published: 2026-11-01T10:00:00+08:00
updated: 2026-11-01T10:00:00+08:00
categories: ["技術"]
tags: ["astro"]
excerpt: "列表和 meta description 用的摘要。"
draft: true
---
```

- 網址是 `/年/月/日/<slug>/`，日期以台北時間計算。
- 分類和標籤要先登記在 `src/data/categories.json`、`src/data/tags.json`。
- 圖片放在 `src/assets/images/<slug>/`，用相對路徑引用。
- `draft: true` 的文章不會出現在正式站。

完整的欄位見 [`src/content.config.ts`](src/content.config.ts)，欄位不對時建置會失敗。

## 部署

Push 之後，GitHub Actions 會建置、檢查舊網址、跑測試，然後部署：

- `main` → 正式站 https://aniya.moe
- 其他分支 → 預覽網址（`noindex`）

`main` 只接受 PR，而且 Build、Test、Deploy、Conventions 四項檢查都要通過。Commit 訊息遵循 [Conventional Commits](https://www.conventionalcommits.org/)，分支名稱遵循 [Conventional Branch](https://conventionalbranch.org/)。

## 文件

- [`docs/migration-log.md`](docs/migration-log.md)：WordPress 搬家紀錄
- [`docs/agents/conventions.md`](docs/agents/conventions.md)：開發慣例和踩過的坑（英文，寫給 AI agent）
- [`.scratch/wordpress-migration/`](.scratch/wordpress-migration/)：搬家的規格和工作票

## 授權

- **程式碼**：程式碼、測試、設定和文件以 [MIT](LICENSE) 授權。
- **部落格內容**：`src/content/` 的文章和頁面、`src/assets/images/` 的圖片，以及 `media.aniya.moe` 上的影片和檔案，以 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hant) 授權。轉載時請註明作者 Tsuki，並附上原文連結。
- **第三方素材**：動畫截圖、照片中的藝術作品和商標，以及網站圖示和頁首背景圖（`public/` 的圖示、`src/assets/images/site/`），權利屬於原作者，不適用上述授權。
