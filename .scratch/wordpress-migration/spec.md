# Spec: WordPress 搬遷至 Astro 靜態網站

Status: ready-for-agent

## Problem Statement

站長目前用 WordPress 經營 `aniya.moe`（Twenty Sixteen 主題，12 個外掛全部啟用），想改成以純靜態網頁管理：文章用 Markdown 寫、交給 Git 版本控管，不必再維護主機、外掛更新和資安修補。

最大的顧慮是 SEO。網站已有 88 個被索引的網址（22 篇文章、5 個頁面、3 個分類、57 個標籤、首頁），sitemap 裡還有 772 筆圖片網址；任何一個舊網址失效都可能掉排名。網址本身也不好處理：文章網址含日期，2021–22 年的文章、分類和多數標籤是中文或日文 slug。

內容裡也有大量 WordPress 專屬格式，現成的匯出工具處理不了：83 個 Envira 相簿（約 509 張圖）、72 個 Jetpack 前後對照滑桿、兩套並存的腳註（`[ref]` shortcode 與 Gutenberg 內建腳註）。

此外，站長希望完整記錄搬遷過程，之後寫成分享文章。

## Solution

用 Astro 重建網站，部署在 Cloudflare Workers static assets，由 GitHub Actions 建置與部署。

- 一支一次性的轉換腳本直接讀 WordPress 的 SQL 備份，轉出 22 篇文章和 5 個頁面的 Markdown／MDX，並產出一份可永久保存的「舊網址對應表」。轉完逐篇人工檢查，之後以 Markdown 為準，不再重跑腳本。
- 所有舊網址不是照原路徑產生，就是 301 到新位置；舊網址不會無預警變成 404（明確排除的類別見 Out of Scope）。
- 網址檢查腳本是驗證的核心：在本機對建置結果跑一次、在預覽網址對實際 HTTP 回應跑一次，兩段都通過才切換 DNS；之後 CI 每次部署都跑。
- 外觀重新設計，只保留站名、配色基調和導覽列的 6 個連結。
- 過程逐階段記錄在 repo 的搬遷日誌，上線後改寫成系列文章。

## User Stories

### 讀者

1. 身為讀者，我想從 Google 搜尋結果點進舊的文章網址時，直接看到同一篇文章，這樣我不會碰到失效連結。
2. 身為讀者，我想打開中文 slug 的文章網址（不論瀏覽器送出的是百分比編碼還是 UTF-8），都能正確看到文章，這樣分享出去的中文網址不會壞掉。
3. 身為讀者，我想在網址少打結尾斜線時被自動導到正確網址，這樣手打網址也能進得去。
4. 身為讀者，我想點舊的 `?p=ID` 短網址時被導到對應文章，這樣以前分享的短網址仍然有效。
5. 身為讀者，我想點舊的附件頁網址時被導到那張圖片，這樣舊的圖片連結不會壞。
6. 身為讀者，我想打開舊的 `/wp-content/uploads/...` 圖片網址時被導到新的圖片網址，這樣外站引用的圖片仍然看得到。
7. 身為手機讀者，我想載入符合螢幕尺寸的 webp 圖片，而不是 2560px 的原圖，這樣頁面開得快、不浪費流量。
8. 身為讀者，我想在旅遊文章裡看到網格排列的相簿，點圖片可以開啟 lightbox 左右翻看，這樣能像以前一樣瀏覽大量照片。
9. 身為讀者，我想用拖曳滑桿比較前後對照的兩張圖，這樣能看出聖地巡禮的實景與動畫畫面的差異。
10. 身為讀者，我想點文中的腳註編號就跳到註解、看完再跳回原處，這樣閱讀不中斷。
11. 身為讀者，我想看到有語法高亮、並標示檔名的程式碼區塊，這樣我知道程式碼屬於哪個檔案。
12. 身為讀者，我想 YouTube 影片先只顯示縮圖、點了才載入播放器，這樣頁面不會因為嵌入影片而變慢。
13. 身為讀者，我想播放文章裡的影片時可以拖曳進度條，這樣能直接跳到想看的段落。
14. 身為讀者，我想用中文關鍵字搜尋全站文章，這樣能找到以前讀過的內容。
15. 身為讀者，我想依分類、標籤或年份瀏覽文章列表，並看到各分類與年份的文章數，這樣能找到同主題或同時期的文章。
16. 身為讀者，我想看到標籤雲，這樣能一眼看出網站常寫的主題。
17. 身為讀者，我想在文章結尾看到依標籤計算的相關文章，這樣能繼續讀同主題的內容。
18. 身為讀者，我想用分享按鈕把文章分享到 Facebook、X、Mastodon、Threads 等平台，而且頁面不因此載入第三方追蹤程式。
19. 身為讀者，我想在文章上看到發布日期與最後更新時間，這樣我能判斷內容是否過時。
20. 身為讀者，我想用 GitHub 帳號在文章下留言並回覆別人的留言，這樣能跟站長和其他讀者交流。
21. 身為讀者，我想在點到失效連結時看到一個有導覽列、搜尋框和最新文章的 404 頁面，這樣我還能找到想看的內容，而不是面對一片空白。
22. 身為讀者，我想在首頁用分頁瀏覽較舊的文章，這樣能看完所有文章。
23. 身為讀者，我想從導覽列進入首頁、隱私權政策、關於、自傳、聯絡和訂閱頁面，這樣網站結構跟以前一樣好找。
24. 身為讀者，我想打開舊的作者頁網址時被導到「關於」頁面，這樣仍能看到站長介紹。

### RSS 訂閱者

25. 身為 RSS 訂閱者，我想原本訂閱的 `/feed/` 在搬遷後繼續更新，而且內容是全文，這樣我不必重新訂閱。
26. 身為使用 Atom 的訂閱者，我想 `/feed/atom/` 繼續有效，這樣我的閱讀器不會出錯。
27. 身為訂閱了單篇文章、分類、標籤或留言 feed 的訂閱者，我想那些舊 feed 網址被導到有意義的頁面，而不是回 404。

### 搜尋引擎與社群平台

28. 身為搜尋引擎爬蟲，我想在原本的 `/sitemap.xml` 路徑取得新的 sitemap，而且裡面的圖片網址是新的，這樣能盡快更新索引。
29. 身為搜尋引擎爬蟲，我想舊的子 sitemap 與 `/wp-sitemap.xml` 被 301 到 `/sitemap.xml`，這樣不會抓到失效的 sitemap。
30. 身為搜尋引擎爬蟲，我想讀到新的 `robots.txt`，裡面仍有 `Sitemap:` 那一行。
31. 身為搜尋引擎爬蟲，我想不存在的網址回真正的 404 狀態碼，而不是回 200 的錯誤頁，這樣不會被判定為 soft 404。
32. 身為搜尋引擎，我想讀到與搬遷前一致的標題格式、meta description、canonical、Open Graph 和 JSON-LD，這樣索引內容不會因搬遷而變動。
33. 身為社群平台，我想從沒有自訂社群圖片的文章取得文章第一張圖當作 og:image，這樣分享卡片不會都是網站圖示。
34. 身為搜尋引擎爬蟲，我想日期彙整頁維持可索引但不列在 sitemap、首頁分頁維持 `noindex`，跟搬遷前一樣。
35. 身為搜尋引擎爬蟲，我想 `www.aniya.moe` 一律 301 到 `aniya.moe`，這樣不會出現重複內容。
36. 身為瀏覽器，我想在搬遷後持續收到 HSTS header，這樣已列入 preload 清單的網域不會出問題。
37. 身為 AI 爬蟲，我想讀到新的 `llms.txt`。

### 站長

38. 身為站長，我想在本機用 Markdown 寫文章、推到 `main` 就自動部署到正式站，這樣發文不必登入任何後台。
39. 身為站長，我想用 `draft: true` 標記草稿，正式建置時不輸出，這樣能把未完成的文章先放在 repo 裡。
40. 身為站長，我想推到其他 branch 時部署到預覽網址，這樣能先看實際效果再合併。
41. 身為站長，我想 CI 在任何舊網址失效時擋下部署，這樣我不會不小心破壞 SEO。
42. 身為站長，我想在 MDX 文章裡用 `<Gallery>` 和 `<Compare>` 元件放相簿與對照滑桿，這樣以後寫遊記也能用同樣的功能。
43. 身為站長，我想把圖片放進依文章分資料夾的統一圖片目錄，不必自己做縮圖或轉檔，這樣整理圖片很簡單。
44. 身為站長，我想用一支腳本一次轉完 27 篇內容，再逐篇檢查，這樣不必手動重打文章。
45. 身為站長，我想搬遷前後沿用同一個 GA4 屬性，這樣能比較搬遷前後的流量，判斷 SEO 有沒有受影響。
46. 身為站長，我想在 GA4 看到被請求的 404 網址，這樣能找出漏掉的舊網址並補上轉址。
47. 身為站長，我想切換前在 Google Search Console 確認網域資源、切換後監控 4 週的 404 與轉址數量，這樣能及早發現 SEO 問題。
48. 身為站長，我想在新網站出問題時，用 `wrangler rollback` 在幾秒內回到上一版。
49. 身為站長，我想把 WordPress 備份另外存一份到別的地方，這樣在極端情況下還能重建舊網站。
50. 身為站長，我想把每個階段的決策、踩到的坑和指令記在搬遷日誌，這樣上線後能整理成分享文章。
51. 身為站長，我想把網站 repo 公開，並在同一個 repo 的 Discussions 存放留言，這樣不必另外管理一個留言 repo。

## Implementation Decisions

### 平台與部署

- 部署平台是 Cloudflare **Workers static assets**，不用 Pages。兩者費用都是 $0；選 Workers 是因為它有 `html_handling` 設定，而且需要寫程式的轉址可以寫在同一個 Worker 裡。
- Worker 設定：`html_handling: "force-trailing-slash"`、`not_found_handling: "404-page"`。
- GitHub Actions 負責建置、跑網址檢查、執行 `wrangler deploy`。推到 `main` 部署到正式站；推到其他 branch 部署成預覽版本，取得預覽網址。Cloudflare API token 存在 GitHub Secrets。
- 網站 repo 為 public。

### 內容轉換器（一次性）

- 用 Node 寫，直接解析 WordPress 的 SQL 備份，不匯入資料庫，也不使用 WXR 匯出檔。
- 輸入：已發布的 22 篇文章與 5 個頁面、分類與標籤、AIOSEO 的 SEO 設定、Envira 相簿資料、`_wp_old_slug` 與 `_wp_old_date`、附件紀錄。
- 輸出三樣東西：
  1. 內容檔：不需要元件的寫成 `.md`，含相簿或對照滑桿的寫成 `.mdx`（約 10 篇）。
  2. 圖片：只複製網站實際使用、且被內容、相簿或 SEO 設定引用的圖片（767 張），放進統一圖片目錄。
  3. **舊網址對應表**：一份提交進 repo 的資料檔，內容包括 WordPress 文章 ID、舊 slug、舊日期、附件頁網址、舊的 upload 路徑，各自對應到新內容或新圖片。轉換器丟掉之後，這份對應表仍是產生轉址規則的唯一來源。
- Block 轉換規則：
  - 段落、標題、清單、表格、分隔線轉成 Markdown；`<ruby>` 與表格保留 HTML。
  - `[ref]…[/ref]` 與 Gutenberg 內建腳註都轉成 GFM 腳註 `[^n]`。
  - 程式碼區塊保留語言標示，`title` 屬性轉成 Expressive Code 的檔名標題。
  - `<mark style=…>` 統一成一種螢光筆樣式，不保留各自的顏色。
  - YouTube 嵌入轉成輕量嵌入元件。
  - Envira 相簿轉成 `<Gallery>`，圖片清單取自區塊內的 JSON。
  - Jetpack image-compare（含 `wp:html` 的手動版本）轉成 `<Compare>`。
  - 站內的絕對網址 `https://aniya.moe/...` 改成相對路徑；`i0.wp.com` 的 Photon 網址改回原始圖片；圖片引用指向統一圖片目錄裡的新檔案。
  - `[lmt-post-modified-info]` 移除，由版型統一顯示最後更新時間。
  - `<!-- more -->` 不保留；有手動摘要的用手動摘要。
- 轉完逐篇人工檢查 27 篇，之後所有修正直接改 Markdown，轉換器不再執行。

### 內容模型

- Astro content collections 分成「文章」與「頁面」兩個集合，用 schema 驗證 frontmatter。
- 文章 frontmatter：標題、slug（解碼後的 UTF-8）、發布時間、最後更新時間、分類、標籤、摘要、meta description、社群圖片、`draft`、WordPress 文章 ID。
- 頁面 frontmatter：標題、slug、父頁面路徑、最後更新時間、meta description。
- 發布時間以 **Asia/Taipei** 時區解讀，文章網址裡的日期也用這個時區計算，才會跟 WordPress 的 permalink 完全一致。

### 路由與網址

- 照原路徑產生：
  - 文章：`/YYYY/MM/DD/<slug>/`
  - 頁面（含階層）：`/about/`、`/about/contact/`、`/about/autobiography/`、`/policy/`、`/subscribe/`
  - 分類 `/category/<slug>/`、標籤 `/tag/<slug>/`（「未分類」沒有文章，不產生）
  - 日期彙整：`/YYYY/`、`/YYYY/MM/`、`/YYYY/MM/DD/`
  - 首頁分頁：`/page/N/`，每頁 10 篇（沿用 WordPress 的 `posts_per_page`），加 `noindex`
  - `/feed/`（RSS）、`/feed/atom/`（Atom），全文，最新 10 篇
  - `/sitemap.xml`、`/robots.txt`、`/llms.txt`
- 所有網址都有結尾斜線。

### 轉址

- 建置時根據舊網址對應表與 Astro 輸出的圖片網址，產生 `_redirects`。
- 靜態規則（共約 1,600 條，在 2,000 條上限內）：
  - 附件頁 → 新的圖片網址（孤兒圖沒有搬，它們的附件頁不轉址，回 404）
  - `/wp-content/uploads/YYYY/MM/<檔名>` → 新的圖片網址（包含原本帶 `-scaled` 的檔名）
  - 影片與 PDF 的舊路徑 → R2 上的新網址
  - 改過的舊 slug 與舊日期 → 現在的網址
  - 作者頁 `/author/erase2004/` → `/about/`
  - `/wp-sitemap.xml` 與 `post-sitemap.xml` 等子 sitemap → `/sitemap.xml`
  - `/comments/feed/` → `/feed/`
- 動態規則：單篇、分類、標籤的 `…/feed/` → 該頁本身。
- Worker 程式：只在首頁 `/` 執行。若帶有 `?p=ID` 或 `?page_id=ID`，依對應表 301 到該文章或頁面，ID 不存在就回 404（與 WordPress 的行為一致）；沒有這些參數的請求交回靜態檔案處理。
- `www.aniya.moe` 用 Cloudflare 的 zone 層級 Redirect Rule 301 到 `aniya.moe`，不依賴舊主機。
- `/wp-admin/`、`/wp-login.php`、`/xmlrpc.php`、`/wp-json/` 回 404。

### 媒體

- 統一圖片目錄放在 `src/assets/images/<文章 slug>/<檔名>`，網站共用圖（`night.png`、header 圖）放 `site/` 子資料夾，favicon 放在 `public/`。檔名去掉 WordPress 加的 `-scaled`。
- 圖片交給 Astro 最佳化，輸出 webp 和多種響應式尺寸。轉址的目標是 Astro 輸出的帶 hash 網址，所以轉址規則必須在建置時產生，不能手寫。
- 不搬：舊縮圖（`-WxH`）、LiteSpeed 產生的 webp 副本與 `.bk` 備份、超過 2560px 的相機原圖、94 張沒被引用的孤兒圖。
- 8 支影片（179 MB，其中 2 支超過 25 MiB 的單檔上限）放在 R2，以 `media.aniya.moe/videos/<文章 slug>/` 提供。R2 支援 range request，影片可以正常拖曳進度條。唯一的 PDF 也放在 R2，同樣依文章 slug 分資料夾。

### 元件與版型

- 從 Astro 官方 `blog` 範本開始，自己實作版型。保留站名「TsukiStudio」、標語「生活點滴紀錄」、配色基調、導覽列的 6 個連結。
- `<Gallery>`：網格排列，用 PhotoSwipe 開 lightbox。只在用到的頁面載入 JS。
- `<Compare>`：包裝 `img-comparison-slider` web component。只在用到的頁面載入 JS。
- 輕量 YouTube 嵌入：先顯示縮圖，點了才載入 iframe。
- 程式碼高亮用 Expressive Code。
- 側欄與頁尾：Pagefind 搜尋（中文）、分類（含文章數）、年份彙整（含文章數）、標籤雲。
- 文章頁：發布日期、最後更新時間、腳註、分享按鈕（純連結，不載入第三方 JS）、依標籤重疊度計算的 3 篇相關文章（與 Jetpack 現在的數量相同）、giscus 留言。
- giscus 使用同一個 repo 的 Discussions，分類名稱為 `Comments`。
- 404 頁：導覽列、Pagefind 搜尋框、最新 5 篇文章、回首頁連結，加 `noindex`，HTTP 狀態碼必須是 404。

### SEO 與分析

- 標題格式：`<文章標題> - TsukiStudio`；首頁是 `TsukiStudio - 生活點滴紀錄`。
- meta description：有 AIOSEO 自訂描述的用自訂描述，否則用摘要。
- og:image：AIOSEO 的自訂社群圖片 → 文章第一張圖 → `night.png`，依序 fallback。
- 每頁都輸出 canonical，指向該頁本身的正式網址。
- 保留 `article:published_time`、`article:modified_time`、`article:tag`、`fediverse:creator`（`@erase2004@g0v.social`），`html lang="zh-TW"`、`og:locale` `zh_TW`。
- JSON-LD 輸出 BlogPosting、BreadcrumbList、WebSite、Person。
- sitemap：只列首頁、文章、頁面、分類、標籤，附圖片網址（新網址）；不列日期彙整和分頁。
- GA4：直接嵌入 gtag，沿用 `G-NWNYVH87N4`。404 頁送一個事件，記錄被請求的網址。

### 切換流程

1. 在 Google Search Console 確認 `aniya.moe` 有「網域」資源；沒有就先用 DNS TXT 驗證，留下切換前的基準數據。
2. 兩段式驗證：先在本機對建置結果跑網址檢查，再對預覽網址跑一次，兩段都通過。
3. 關閉 Cloudflare 的 Rocket Loader。
4. 確認 HSTS header 的來源；若是舊主機加的，改由 Cloudflare Edge Certificates 設定或寫進 `_headers`。
5. 建立 `www` 的 Redirect Rule。
6. 刪除指向舊主機的 A record，把 `aniya.moe` 綁定為 Worker 的 Custom Domain。
7. 對正式網域再跑一次網址檢查，全部通過後才關閉舊主機。
8. 重新提交 `/sitemap.xml`，接下來 4 週每週檢查 GSC 的 404 與已轉址數量，對照 GA4 的 404 事件補轉址規則。

### 回滾

- 新網站本身出問題：`wrangler rollback` 回到上一個 Worker 版本。
- 必須退回 WordPress 的極端情況：從 WordPress 備份重建。備份要另存一份到別的地方（雲端硬碟或外接硬碟）。

## Testing Decisions

- 好的測試只驗證外部可觀察的行為：某個網址回什麼狀態碼、轉到哪裡、頁面裡有什麼標籤；不測試內部實作。
- **主要的測試 seam 是網址檢查腳本**，一支腳本支援兩種目標：
  - 建置輸出目錄：確認每個預期網址都對應到一個檔案，或對應到一條 `_redirects` 規則與正確的目標。
  - 任意 base URL（預覽網址或正式網域）：實際發 HTTP request，檢查狀態碼與 `Location`，不自動跟隨轉址。
- 網址檢查的預期清單由兩個來源組成：
  - 搬遷前抓下的線上 sitemap 快照，提交進 repo 當作固定的 fixture，不隨網站重建而改變。
  - 舊網址對應表：日期彙整、`?p=ID`、`?page_id=ID`、附件頁、舊 upload 路徑、舊 slug、作者頁、各種 feed 與子 sitemap。
- 網址檢查要涵蓋的情況：
  - 中文 slug 的百分比編碼與 UTF-8 兩種寫法。
  - 缺結尾斜線時 301 到有斜線的版本。
  - 不存在的網址回 404，而且內容是 404 頁。
  - `www` 301 到正式網域（只在正式網域上檢查）。
- 網址檢查同時抽驗 HTML head：每頁的 canonical 等於自身網址、標題格式正確、有 description。
- 預覽網址上的第二段驗證，專門用來確認官方文件沒寫明的兩件事：Workers 對百分比編碼中文路徑的比對，以及 `force-trailing-slash` 的實際行為。
- 轉換器用代表性的區塊片段做 fixture 測試，每條轉換規則至少一個案例：Envira 相簿、image-compare（block 版與 `wp:html` 版）、兩種腳註、帶 `title` 的程式碼區塊、`<mark>`、`<ruby>`、YouTube、Photon 網址、站內絕對網址。轉換器是一次性的，這些測試只在開發轉換器期間使用；最終把關靠 27 篇的人工檢查。
- 內容 schema 由 Astro content collections 在建置時驗證，frontmatter 有誤就建置失敗。
- 這是新 repo，沒有既有的測試可以參考。

## Out of Scope

- Jetpack Email 訂閱與訂閱者通知；RSS 保留。
- 熱門文章與手動精選文章。
- Jetpack Stats、MonsterInsights。
- 舊留言搬遷（沒有已核准的留言）。
- 舊縮圖網址（`-WxH`）與 LiteSpeed webp 網址的轉址，這些網址直接 404。
- 94 張孤兒圖與超過 2560px 的相機原圖。
- infinite scroll，改用一般分頁。
- 切換後保留舊主機；舊主機在正式網域驗證通過後就關閉。
- 仿製 Twenty Sixteen 的外觀。
- AMP、多語系。
- 把搬遷日誌改寫成正式的系列文章。這件事在網站上線後另外進行，本 spec 只涵蓋日誌的持續記錄。

## Further Notes

- **規模**：22 篇文章、5 個頁面、3 個分類、57 個標籤。網站實際使用的圖片 861 張、387 MB，全部不超過 2560px；其中 767 張被引用。8 支 mp4 共 179 MB。
- **Cloudflare 限制**（2026-10 查證）：每次部署最多 20,000 個檔案、單檔 25 MiB、`_redirects` 最多 2,000 條靜態加 100 條動態規則。Pages 對 range request 回 200 而不是 206；Workers 的 range request 支援未查證，所以影片一律放 R2。
- **未查證、須在預覽網址實測**：Workers 對百分比編碼中文路徑的比對方式、`force-trailing-slash` 的實際轉址行為、`not_found_handling` 的預設值。
- **時區**：WordPress 的 `timezone_string` 是 Asia/Taipei，文章網址的日期以當地時間計算；轉換與路由都必須用同一時區，否則跨日發布的文章網址會錯一天。
- 2025-05-17 同一天有 8 篇遊記，這天的日期彙整頁會有 8 篇文章。
- contact 頁面含有 email，這些 email 已公開在現有網站上；repo 公開後也會出現在 repo 裡。
- 搬遷過程記錄在 `docs/migration-log.md`，每完成一個階段就更新。
