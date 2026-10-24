# 搬遷日誌：WordPress → Astro

記錄 `aniya.moe` 從 WordPress 搬到 Astro 靜態網站的過程：每個階段的決策與理由、踩到的坑、用過的指令。網站上線後改寫成系列文章。規格在 `.scratch/wordpress-migration/spec.md`，各階段的工作在同一個資料夾的 `issues/`。

## 規劃階段（2026-10-24）

### 起點

- WordPress（Twenty Sixteen 主題，12 個外掛全部啟用），22 篇文章、5 個頁面、3 個分類、57 個標籤，被索引的網址 88 個，sitemap 裡另有 772 筆圖片網址。
- 想改成用 Markdown 寫文章、交給 Git 版本控管，不必再維護主機、外掛更新和資安修補。
- 最大的顧慮是 SEO：任何一個舊網址失效都可能掉排名。

### 平台：Cloudflare Workers static assets

- 決定：部署在 Cloudflare Workers 的 static assets，不用 Pages；GitHub Actions 建置與部署，推到 `main` 上正式站，其他 branch 上預覽版本。
- 理由：
  - 兩者費用都是 $0。
  - Workers 有 `html_handling` 設定，可以統一結尾斜線。
  - `?p=ID` 這類需要寫程式的轉址，可以寫在同一個 Worker 裡，而且只在首頁執行，其他頁面仍是免費的靜態檔案請求。
  - `wrangler rollback` 可以在幾秒內退回上一版。

### 框架：Astro

- 決定：從 Astro 官方 `blog` 範本開始，版型自己做。
- 理由：
  - 輸出純靜態檔案，不需要伺服器。
  - content collections 用 schema 驗證 frontmatter，寫錯建置就失敗。
  - MDX 可以在文章裡放 `<Gallery>`、`<Compare>` 元件，取代 Envira 相簿與 Jetpack 對照滑桿。
  - 內建圖片最佳化，自動輸出 webp 與響應式尺寸，不必自己做縮圖。

### 網址策略

- 原則：每個舊網址不是照原路徑產生，就是 301 到新位置，不會無預警變成 404（明確排除的只有舊縮圖 `-WxH`、LiteSpeed webp 網址、孤兒圖的附件頁）。
- 文章 `/YYYY/MM/DD/<slug>/`、頁面、分類、標籤、日期彙整、首頁分頁、`/feed/` 全部沿用原路徑，所有網址都有結尾斜線。
- 文章網址的日期以 Asia/Taipei 時區計算，跟 WordPress 的 `timezone_string` 一致，否則跨日發布的文章網址會錯一天。
- `_redirects` 在建置時產生，不手寫：圖片轉址的目標是 Astro 輸出的帶 hash 網址，建置前不知道。
- 轉換腳本產出一份「舊網址對應表」提交進 repo；轉換器丟掉之後，它仍是產生轉址規則的唯一來源。
- `www.aniya.moe` 用 Cloudflare zone 層級的 Redirect Rule 301 到 `aniya.moe`，不依賴舊主機。

### 媒體處理

- 圖片放統一圖片目錄 `src/assets/images/<文章 slug>/`，交給 Astro 最佳化。只搬被內容、相簿或 SEO 設定引用的 767 張。
- 不搬：舊縮圖、LiteSpeed 產生的 webp 與 `.bk` 備份、超過 2560px 的相機原圖、94 張孤兒圖。
- 8 支影片（179 MB，其中 2 支超過單檔 25 MiB 上限）與唯一的 PDF 放 R2，以 `media.aniya.moe` 提供。R2 支援 range request，影片可以拖曳進度條。

### 驗證方式

- 網址檢查腳本是整個搬遷的主要測試：預期清單來自搬遷前抓下的 sitemap 快照（`tests/fixtures/wordpress-sitemap-2026-10-24/`）和舊網址對應表。
- 兩段式：先對本機的建置結果跑，再對預覽網址的實際 HTTP 回應跑，兩段都通過才切換 DNS；之後 CI 每次部署都跑。
- 「待完成清單」ratchet：還沒做的網址允許失敗，做完就必須從清單移除。
- 切換後 4 週，每週看 Google Search Console 的 404 與已轉址數量，對照 GA4 的 404 事件補轉址規則。

## Cloudflare 限制

### 已查證（2026-10-24 讀官方文件）

| 項目 | 限制 |
|---|---|
| 每個版本的檔案數 | 20,000（Free 方案） |
| 單一檔案大小 | 25 MiB |
| `_redirects` | 2,000 條靜態規則 + 100 條動態規則，每條最多 1,000 字元 |
| `_headers` | 100 條規則 |
| `html_handling` | `auto-trailing-slash`（預設）、`force-trailing-slash`、`drop-trailing-slash`（wrangler 的設定 schema 另有 `none`） |
| `not_found_handling` | `404-page`、`single-page-application`（schema 另有 `none`）；這個站設 `404-page` |
| `run_worker_first` | 符合的請求一律執行 Worker，計入 Free 方案每天 100,000 次的額度；靜態檔案請求免費 |

- Pages 對 range request 回 200 而不是 206，所以影片不放在網站裡。

### 尚未查證，要在預覽網址實測（19 號）

- Workers 對百分比編碼中文路徑的比對方式。
- `force-trailing-slash` 的實際轉址行為（狀態碼、會不會形成迴圈）。
- `not_found_handling` 的預設值。
- Workers static assets 是否支援 range request（206）。目前影片一律放 R2，不受影響。
- 小寫百分比編碼的中文路徑（WordPress canonical 的寫法）應該得到什麼回應。網址檢查暫時接受「跟 UTF-8 寫法一樣的回應，或轉址到只差在編碼大小寫的同一路徑」，由 `scripts/url-checker/settings.ts` 的 `LOWERCASE_PERCENT_ENCODED_PATHS` 這一個設定決定，19 號實測後定案（見下面 03 號）。

### 本機 `wrangler dev` 的觀察（01 號，wrangler 4.152.0）

本機用的 asset 處理程式碼（miniflare 裡的 asset worker）跟正式環境是同一份開源程式碼，但仍要在預覽網址確認。

- **`force-trailing-slash` 的轉址是 307，不是 301。** `/foo` 與 `/foo/index.html` 都 307 到 `/foo/`。WordPress 對缺斜線的網址回 301，所以另外在 `_redirects` 為每個頁面加一條 301 規則（見下面 01 號）。
- `_redirects` 的規則比 `html_handling` 先處理：有規則的網址回 301，沒有規則的才走 `html_handling` 的 307。
- 不設 `not_found_handling` 時，不存在的網址回 404、內容空白；設成 `404-page` 後回 `404.html` 的內容，狀態碼仍是 404。
- 中文路徑（以 `/中文/` 測試）：
  - 大寫的百分比編碼 `/%E4%B8%AD%E6%96%87/` 回 200。
  - **小寫的百分比編碼 `/%e4%b8%ad%e6%96%87/` 會 307 到大寫的版本。** WordPress 的 canonical 和站內連結用的是小寫編碼，Google 索引的很可能也是小寫，03、19 號要處理。
  - 用 UTF-8 寫的 `_redirects` 規則比對得到大寫編碼的請求，比對不到小寫編碼的請求。
  - 直接送未編碼的 UTF-8 路徑（curl）時，`wrangler dev` 回 400。瀏覽器一律會先編碼，這點要在預覽網址再確認。
- `/404.html` 和 `/404` 都 307 到 `/404/`，而 `/404/` 回 200 並顯示 404 頁。這不是舊網址，但等於多了一個回 200 的錯誤頁（404 頁本身有 `noindex`），留給 17 號決定要不要處理。

## 01：Astro 骨架、Worker 設定（2026-10-24）

### 建立專案

```sh
npm create astro@5.3.1 -- blog-template --template blog --no-install --no-git --skip-houston --yes
```

- 產生的是 Astro 7.4.2 的 `blog` 範本。先原封不動提交一次，之後的 commit 就看得出改了範本哪些地方。
- 移除的示範內容：5 篇範例文章與佔位圖片、`/blog/`、`/about/`、`rss.xml` 頁面、文章版型、範本的 README 與 `AGENTS.md`，以及頁首、頁尾連到 Astro 社群帳號的連結。
- 移除 `@astrojs/rss` 和 `@astrojs/sitemap`：feed 要在 `/feed/` 並提供 Atom，sitemap 要在 `/sitemap.xml` 並附圖片網址，都跟這兩個套件的預設不同，留給 12 號決定做法。
- 保留：MDX、`sharp`（圖片最佳化）、範本的基本樣式與字型（版型在 15 號重做）。
- 站名改成 TsukiStudio、標語「生活點滴紀錄」、`site` 設為 `https://aniya.moe`、`<html lang="zh-TW">`。

### 固定 Node 與 npm 版本

- `.nvmrc` 寫 `24`，`package.json` 的 `engines` 限定 Node 24、npm 11，`packageManager` 寫 `npm@11.19.1`。
- `.npmrc` 設 `engine-strict=true`，版本不符時 `npm install` 直接失敗。驗證方式：把 `engines.node` 暫時改成 `>=99`，`npm install` 回 `EBADENGINE`／`notsup` 錯誤。
- 套件版本由 `package-lock.json` 固定。
- npm 11 預設不執行相依套件的 install script，裝 wrangler 時 esbuild 和 workerd 的 postinstall 被擋下。這兩個 script 只是檢查並最佳化執行檔的位置，不跑也能用（建置與 `wrangler dev` 都正常），所以用 `npm install-scripts deny esbuild workerd` 明確記錄為拒絕，安裝時就不會再出現提示。
- `npm audit` 回報 3 個 undici 的漏洞，來源是 wrangler 內含的 miniflare（只在本機開發時用到）。建議的修法是把 wrangler 降到 4.35.0，不採用，等 wrangler 更新。

### 建置輸出與 Worker 設定

- `astro.config.mjs`：`build.format: 'directory'`（每個頁面輸出成 `<路徑>/index.html`，這是 Astro 的預設值，明確寫出來）、`trailingSlash: 'always'`。
- `wrangler.jsonc`：只有靜態檔案的 Worker，名稱 `aniya-moe`，`assets.directory` 指向 `./dist`，`html_handling: "force-trailing-slash"`、`not_found_handling: "404-page"`。
- `compatibility_date` 設 `2026-10-19`：本機的 workerd 是 1.20261019.1，只支援到這一天，設更晚的日期會被警告並退回。
- 先放一個簡單的 404 頁（`noindex`、回首頁的連結），正式版在 17 號。

### 缺結尾斜線的網址改成 301

- 問題：`force-trailing-slash` 的轉址是 307（見上面的本機觀察），規格要的是 301。
- 做法：寫一個 Astro integration（`src/integrations/trailing-slash-redirects.ts`），建置完成後為每個輸出成 `<路徑>/index.html` 的頁面，在 `_redirects` 加一條 `/<路徑> /<路徑>/ 301`。首頁和 `404.html` 不需要。
- 代價：這些規則算在 2,000 條靜態規則的上限裡。依 sitemap 快照估算，完整網站約 116 個頁面（22 篇文章、5 個頁面、3 個分類、57 個標籤、27 個日期彙整、2 個首頁分頁），加上規格估計的約 1,600 條轉址，合計約 1,716 條，仍在上限內。
- 06 號產生 `_redirects` 時要跟這些規則放在同一個檔案；這個 integration 是附加在既有檔案後面，不會覆蓋。
- 不採用的做法：
  - 每個請求都先執行 Worker 來補斜線：會消耗 Worker 請求額度，規格要求 Worker 只在首頁執行。
  - Cloudflare zone 層級的 Redirect Rule：只對正式網域有效，`wrangler dev` 和預覽網址都測不到。

### 測試

- 用 Vitest。`npm test` 會把網站建置到暫存資料夾，另外加一個只在測試時存在的頁面 `/probe/`（網站還沒有首頁以外的頁面），再用 `wrangler dev` 以專案的 `wrangler.jsonc` 提供這份輸出，實際發 HTTP request 檢查：
  - 頁面輸出成 `<路徑>/index.html`。
  - `/probe` 301 到 `/probe/`，`/probe/` 回 200。
  - `_redirects` 裡補斜線的規則都指向真的存在的頁面。
  - 不存在的網址回 404，內容是 404 頁。
- `wrangler dev --assets <資料夾>` 只會覆蓋 `assets.directory`，`html_handling` 與 `not_found_handling` 仍然讀 `wrangler.jsonc`（看過 wrangler 的原始碼確認），所以測試用的是正式的設定。
- Windows 上只結束 node 程序時 workerd 會留著，測試結束時用 `taskkill /T` 把整個程序樹一起結束。

### 本機預覽

```sh
npm run preview   # astro build 之後執行 wrangler dev
```

用 `wrangler dev` 啟動後手動確認：`/` 回 200、`/index.html` 307 到 `/`、`/no-such-page/` 回 404 並顯示 404 頁、`/wp-admin/` 回 404。目前首頁以外沒有頁面，缺斜線的 301 由上面的測試驗證。

## 03：網址檢查腳本（2026-10-24）

整個搬遷的主要測試：拿 WordPress 時代的每一個網址去問新網站，確認回應正確。之後每張 issue 都用它證明自己完成了。

### 用法

```sh
npm run build
npm run check-urls -- build              # 檢查建置輸出（預設 dist，也可以給其他資料夾）
npm run check-urls -- http <base URL>    # 對實際的網站發 HTTP request，例如預覽網址
npm run check-urls -- build --prune-pending   # 順便把已經通過的網址從待完成清單刪掉
```

- 通過時 exit code 是 0，檢查失敗是 1，參數錯誤是 2。
- 本機跑 HTTP 模式：`npm run preview` 啟動 `wrangler dev` 之後，`npm run check-urls -- http http://localhost:8787`。
- 程式在 `scripts/check-urls.ts` 與 `scripts/url-checker/`。Node 24 可以直接執行 TypeScript（type stripping），不需要編譯。

### 預期清單

每個網址各有一種預期：

| 種類 | 預期 |
|---|---|
| `page` | 200，HTML head 有指向自身正式網址（`https://aniya.moe/...`）的 canonical、`<title>`、meta description；缺結尾斜線的網址 301 到有斜線的版本 |
| `file` | 200，不檢查內容（`robots.txt`、sitemap、feed） |
| `redirect` | 301 到指定的 `location`；沒指定時（例如圖片，新網址要建置後才知道），轉址目標必須在同一個網站而且回 200 |
| `not-found` | 404 |

來源：

- **sitemap 快照**（`tests/fixtures/wordpress-sitemap-2026-10-24/`）：88 個頁面（`page`）；圖片網址 761 個（`redirect`，快照列了 772 筆，其中 11 張圖出現在兩篇文章）；`/robots.txt` 和它指向的 `/sitemap.xml`（`file`）；sitemap index 列出的 5 個子 sitemap（301 到 `/sitemap.xml`）。
- **舊網址對應表**（`src/data/old-url-map.json`，05 號建立）：檔案存在才讀。網址檢查只讀其中的 `urls` 陣列，每筆是 `{ "url", "expect", "location"? }`，其他欄位不管，05 號可以自由設計對應表的其他部分；要改格式的話，改 `scripts/url-checker/expected-urls.ts` 的 `fromMappingTable()` 和它的測試。兩個來源對同一個網址的預期不一致時直接報錯。
- 另外固定檢查一個從來不存在的網址 `/url-checker/no-such-page/` 回 404。

這兩個位置和下面的設定都在 `scripts/url-checker/settings.ts`。

### 中文網址的兩種寫法

- **UTF-8 寫法**：sitemap 裡的寫法。由用戶端編碼後送出，跟瀏覽器一樣，送出去的是大寫的百分比編碼（`%E6%8A%80`）。
- **百分比編碼寫法**：WordPress 在 canonical 和站內連結用的小寫編碼（`%e6%8a%80`）。
- 不送未編碼的 UTF-8 原始位元組：瀏覽器不會這樣送，`wrangler dev` 也直接回 400（見 01 號）。
- 小寫寫法該得到什麼回應還沒定案，是**留給 19 號的問題**，由 `LOWERCASE_PERCENT_ENCODED_PATHS` 這一個設定決定：
  - `'as-expected-or-recase-redirect'`（預設）：跟預期一樣的回應（頁面就是 200），或轉址到只差在編碼大小寫的同一路徑。本機 Workers 的行為是後者：307 到大寫的版本。
  - `'as-expected'`：一定要是預期的回應本身，不接受轉址。
- 比對 canonical 和 `Location` 時，同一個字的大小寫編碼視為相同（RFC 3986 認定兩者等價）。

### 建置輸出模式怎麼判斷

建置輸出模式不是單純檢查檔案存不存在，而是照 Cloudflare 的 asset worker 原始碼（workers-shared，miniflare 內附同一份），模擬 Workers static assets 會怎麼回應：先比對 `_redirects`，再照 `force-trailing-slash` 找檔案，找不到就用 `404.html` 回 404。這樣兩種模式可以共用同一套判斷。測試裡兩種模式跑同一組案例，HTTP 模式由 `wrangler dev` 提供同一個資料夾，結果必須一致。

讀原始碼時確認的幾件事（`wrangler dev` 實測一致）：

- `_redirects` 的來源路徑會用 WHATWG URL 正規化：UTF-8 字元編成大寫的百分比編碼，已經寫成跳脫字元的保持原樣。比對時拿的是請求原始的路徑，所以 UTF-8 寫的規則只對大寫編碼的請求有效，寫成小寫跳脫字元的規則只對小寫的請求有效。如果 19 號決定小寫網址也要直接 301，可以用這個方式加規則（但會多佔靜態規則的額度）。
- 靜態規則一律比動態規則（含 `*` 或 `:placeholder`）先比對；第一條動態規則之後的規則，即使沒有萬用字元也算動態規則。
- 沒有命中規則時，路徑先解碼，再用 `encodeURIComponent` 重新編碼；跟請求的寫法不同就 307 到重新編碼的版本。小寫編碼被 307 到大寫就是這個原因，而且不存在的網址也一樣。
- 帶 query string 的網址（`?p=ID`）由 Worker 程式處理，建置輸出模式無法判斷，標記為略過，只在 HTTP 模式檢查。

### 待完成清單

`scripts/url-checker/pending.txt`：允許暫時失敗的網址。

- 一行一個網址，寫成 UTF-8 路徑（跟報告裡的寫法一樣），依 code point 排序（等同 `LC_ALL=C sort`）。空行和 `#` 開頭的註解不算。
- 檢查失敗的情況：清單外的網址失敗；清單內的網址已經通過；清單裡有不在預期清單的網址；清單沒排好或重複。報告會列出要刪掉的行。
- 刪除：`--prune-pending` 只刪掉該刪的那幾行，其他內容一個字都不動。
- 新增：新的預期網址（例如 05 號的對應表帶進來的日期彙整、`?p=ID`）如果還沒實作，加進清單的排序位置；沒加的話檢查會失敗，不會漏掉。
- 初始內容是 855 筆：87 個頁面、761 個圖片網址、`/robots.txt`、`/sitemap.xml`、5 個子 sitemap。目前通過的只有首頁和 404 檢查。
- 為了讓平行進行的 issue 合併時不衝突，不同第一層路徑（`/2021/`、`/category/`、`/tag/`、`/wp-content/`……）之間隔一行空行。實驗過：兩個 branch 刪掉相鄰的兩行，git 合併會衝突；中間隔著一行沒動的，就能自動合併。各 issue 負責的網址大致按第一層路徑分開，例如 06 號刪 `/wp-content/`、11 號刪 `/category/` 與 `/tag/`、12 號刪 `/robots.txt` 與 `/sitemap.xml`，彼此不會碰到相鄰的行。

### 測試

- `tests/url-checker/expected-urls.test.ts`：從真正的 sitemap 快照讀出 88 個頁面、761 個圖片網址、`robots.txt` 與子 sitemap；對應表的讀入、編碼正規化、與快照衝突時報錯。
- `tests/url-checker/check-urls.test.ts`：在暫存資料夾做一個小型網站（頁面、中文頁面、各種 head 錯誤、靜態與動態 `_redirects` 規則、圖片轉址、外部網址的轉址、404 頁），每一種判斷各一個案例，建置輸出模式與 HTTP 模式各跑一次；待完成清單的每一種規則；`--prune-pending` 的刪除方式。
- `tests/site-serving.test.ts`：對真正的建置結果，用 commit 進去的待完成清單跑兩種模式，都要通過。這個測試保證清單剛好列出目前還沒做的網址。
- HTML 解析用 `node-html-parser`，裝的是 9.0.4；最新的 9.0.5 發布才 5 天，先不用。

## 02：帳號與外部服務設定（2026-10-24）

站長在各服務的後台操作，我用 API 和 DNS 查詢逐項驗收。這裡不記任何 token 或金鑰的值。

### GitHub

- 建立公開 repo `erase2004/blog`，開啟 Discussions，建立 `Comments` 分類，安裝 giscus GitHub App。giscus 的 API 讀得到這個 repo 的分類，代表 app 已經裝好。
- **還沒推送**：站長決定先不推。04 號 CI/CD 要等推上去之後才能開始。
- 安裝 gh CLI 2.103.2，用 `gh auth login --web` 登入。踩到的坑：Claude Code 的 `!` 指令跑在 bash，PowerShell 的 `& "路徑"` 寫法會出現語法錯誤，要改寫成 `"/c/Program Files/GitHub CLI/gh.exe"`。
- GitHub Secrets 設了 `CLOUDFLARE_API_TOKEN` 與 `CLOUDFLARE_ACCOUNT_ID`。

### Cloudflare

- API token 驗證為 active，看得到 `aniya.moe` zone，也讀得到 Workers 列表。部署權限要到 04 號實際部署時才能確認。
- 踩到的坑：
  - 後台顯示的「API Token」欄位其實是 account ID（它也出現在 R2 的 S3 端點網址裡），真正的 token 是 `cfat_` 開頭那串。
  - 第一版 token 沒有 R2 權限，呼叫 R2 API 回 authentication error，之後補上「Workers R2 Storage: Edit」。
- R2：bucket `media`，自訂網域 `media.aniya.moe`，狀態 active。驗收方式：上傳一個測試檔，從 `https://media.aniya.moe/` 讀得到，刪除後回 404。另外還有一組只限這個 bucket 的 S3 API 金鑰，目前用不到。

### Google Search Console

- 原本只有用 GA 驗證的「網址前置字元」資源 `https://aniya.moe/`。
- 新增「網域」資源 `aniya.moe`，用 DNS TXT record 驗證，這筆 record 要永久保留。理由：GA 驗證靠首頁的追蹤碼，切換時只要追蹤碼暫時不見就會失去驗證；DNS 驗證跟網站內容無關，而且涵蓋 `www`、`media` 子網域與 `http://`。
- GSC 的數據不是從驗證那天才開始累積，新驗證的資源也看得到之前的歷史數據。

### 備份

- WordPress 備份已另存一份到異地（站長確認）。

## 05：轉換器與文章、頁面的文字內容（2026-10-24）

### 重新產生所有轉換結果

```sh
npm run convert-wordpress                      # 讀 D:/wordpress-backup/wordpress-2026-10-24-23e0c01.sql
npm run convert-wordpress -- <其他 dump.sql>   # 換一份備份
```

- 一個指令重新產生所有轉換出來的檔案：`src/content/posts/`、`src/content/pages/`（先整個清空再寫，在 18 號人工檢查之前，這兩個資料夾裡的檔案都來自轉換器）、`src/data/categories.json`、`src/data/tags.json`、`src/data/old-url-map.json`。
- 同一份備份、同一份程式碼，輸出的每個位元組都一樣（實測兩次輸出的雜湊相同；測試也確認資料表的列換了順序，輸出不變）。所以**平行的 branch 合併時，這些產生出來的檔案衝突了不用手動解，合併完程式碼後重跑這個指令就好**。待完成清單不是產生的，照 03 號的規則處理。
- 備份檔只讀不寫，路徑在 `scripts/wordpress-converter/settings.ts`。結束時會列出還留著「未轉換標記」的元素各有幾個。

### 架構

程式在 `scripts/convert-wordpress.ts`（指令）與 `scripts/wordpress-converter/`：

| 檔案 | 內容 |
|---|---|
| `sql-dump.ts` | 直接解析 mysqldump 的 SQL：從 `CREATE TABLE` 拿欄位名稱，從 `INSERT` 拿資料列，處理 `\'`、`\\`、`\n` 等跳脫字元。不匯入資料庫，也不用 WXR。25 MB 的備份約 0.4 秒。 |
| `wordpress.ts` | 把資料表整理成文章（各種 post type）、metadata、選項、分類與標籤、使用者、AIOSEO 設定。 |
| `blocks.ts` | 照 WordPress 的 block parser 解析 `<!-- wp:… -->` 區塊，保留每個區塊的原始寫法（給未轉換標記用）。 |
| `content.ts` | 轉換引擎：每個區塊、HTML 元素、shortcode 交給登記的規則；沒有規則的一律變成未轉換標記。 |
| `rules/` | 轉換規則，一個關注點一個模組，在 `rules/index.ts` 登記。 |
| `convert.ts` | 整個網站：每篇文章與頁面的 frontmatter 和檔名、分類與標籤資料檔、對應表。 |
| `url-map/` | 對應表裡的舊網址，一類一個模組，在 `url-map/index.ts` 登記。 |
| `seo.ts` | AIOSEO 的描述與社群圖片，以及 AIOSEO 從內文產生描述的方式。 |
| `markdown.ts`、`html.ts`、`frontmatter.ts` | Markdown 跳脫、保留的 HTML、frontmatter 的寫法。 |

### 後續 issue 怎麼擴充轉換器

06、08、09、10 號會在各自的 branch 同時擴充轉換器，所以每個關注點都是獨立的模組：

- **已經預留的模組**：`rules/images.ts`（06）、`rules/media.ts`（07：影片與 PDF）、`rules/code.ts`、`rules/footnotes.ts`、`rules/youtube.ts`（08）、`rules/gallery.ts`（09）、`rules/compare.ts`（10）。它們已經登記好、宣告了自己負責的區塊與元素，目前只留下未轉換標記，模組開頭的註解寫了該轉成什麼、資料在哪裡。**這幾張 issue 只要改自己的模組，不用動 `rules/index.ts`**，彼此不會衝突。
- **新增一個關注點**：寫一個新模組，在 `rules/index.ts` 加一行 `export { 名稱 } from './檔名.ts';`（照字母排序，不同 issue 加的行通常不會相鄰）。
- 一條規則（`rule.ts` 的 `Rule`）可以宣告：
  - `blocks`：依區塊名稱（`core/image`、`envira/envira-gallery`）轉換整個區塊，回傳 Markdown。
  - `elements`：依標籤名稱轉換文字裡的 HTML 元素；`sup[data-fn]` 這種寫法只比對有那個屬性的元素，優先於 `sup`。
  - `shortcodes`：依名稱轉換 shortcode（`ref` 就是 `[ref]…[/ref]`）。
  - `finish`：整篇轉完之後執行，例如把腳註定義加在文末。
  - 同一個區塊、元素或 shortcode 只能有一條規則認領，重複就直接報錯，不會因為登記順序而默默蓋掉。
- 規則拿到的 `context`：`entry`（正在轉換的文章）、`site`（整份備份的資料）、`parse()`、`inline()`（文字內容轉 Markdown）、`blocks()`（內層區塊）、`rawHtml()`（在 .md 和 .mdx 裡意思都一樣的 HTML）、`url()`（站內絕對網址轉相對路徑）、`unconverted()`。
- 需要元件時：`context.document.imports.add("import Gallery from '…';")`，有 import 的檔案自動輸出成 `.mdx`，對應表裡的檔名也跟著變。`context.document.footer` 加在文末，`context.document.state` 讓規則存放一篇文章內的狀態（例如腳註編號）。
- 對應表也一樣：`url-map/` 一類舊網址一個模組，回傳 `urls`（預期）和自己的 section（例如 06 號的 upload 路徑與附件頁）。

### 未轉換的元素：明顯的標記

還不能轉換的元素原封不動留在輸出裡，不會靜默丟失：

- 區塊：變成一個程式碼區塊，標題是 `wp-unconverted: <區塊名稱>`，內容是區塊在 WordPress 裡的原始寫法。頁面上看得到，建置照常通過，在 .md 和 .mdx 都合法（測試會編譯成 MDX 確認）。Gutenberg 腳註區塊的標記另外列出存在 postmeta 裡的腳註內文，在 08 號轉換之前不會遺失。
- 文字裡的元素：變成行內程式碼 `` `wp-unconverted: <原始寫法>` ``。
- 用 `grep -r wp-unconverted src/content` 就能找到全部。08 號的驗收條件「05 號留下的對應標記全部處理掉」指的就是這些。

轉換後留下的標記（kind：數量／檔案數）：

| 元素 | 數量 | 負責的 issue |
|---|---|---|
| `core/image` | 93／18（另有 5 張在 3 個 gallery 裡） | 06 |
| `img`（文字裡 48px 的小圖） | 6／4 | 06 |
| `core/video`、`core/file` | 7／4、1／1 | 07 |
| `core/code` | 9／3 | 08 |
| `[ref]`、`sup[data-fn]`、`core/footnotes` | 38／6、37／8、8／8 | 08 |
| `core/embed`（YouTube） | 2／1 | 08 |
| `envira/envira-gallery`、`core/gallery` | 83／10、3／3 | 09 |
| `jetpack/image-compare`、`core/html` | 72／6、8／4 | 10 |

數字跟規劃時統計的完全一致，沒有其他種類的未轉換元素。

### 文字類 block 的轉換規則

| 來源 | 轉成 |
|---|---|
| 段落 | Markdown 段落；空段落省略；置中、字級等 class 不保留 |
| 標題 | 同層級的 `#` 標題；inline style（`line-height:0` 等）不保留 |
| 清單（舊式 `<ul>` 與 list-item block） | Markdown 清單，保留編號與巢狀 |
| 表格 | 保留 HTML（唯一的表格沒有表頭列、儲存格裡有換行），去掉 WordPress 的 class 與外層 `<figure>`，一列一行 |
| 分隔線 | `---`；寬版、點點等樣式不保留 |
| 按鈕 | 一般連結，一個按鈕一段，外觀交給新版型 |
| 欄位 | 攤平，裡面的區塊依序排列（唯一一個是 100% 寬的單欄） |
| `<mark style=… class=…>` | 一律 `<mark>`，由版型決定一種螢光筆樣式 |
| `<ruby>` | 保留 HTML |
| 站內的 `https://aniya.moe/…`、`http://aniya.moe/…` | 相對路徑，中文路徑解碼成 UTF-8 方便閱讀 |
| `[lmt-post-modified-info]`、`<!-- more -->` | 移除 |

- **粗體、斜體與中文標點**：CommonMark 的規則下，`這是**「重要」**的` 裡的 `**` 不會變成粗體（星號內側是標點、外側是文字）。轉換器逐一檢查每組強調符號前後的字元，會失效的就改用 `<strong>`／`<em>`。判斷標準跟 Astro 用的 Markdown 引擎（Sätteri）一致，測試直接用 Sätteri 渲染確認。
- **跳脫**：`*`、`_`、`[`、`]`、`<`、`{`、`}`、`~`、`` ` `` 等在 Markdown 或 MDX 有意義的字元一律跳脫；行首的 `#`、`>`、`-`、`1.` 也是，不會變成標題或清單。保留的 HTML 裡改用字元參照（`&#42;`），這樣在 .md 的 HTML 區塊和 MDX 的 JSX 裡意思都一樣（09、10 號會把含相簿與對照滑桿的文章改成 MDX）。
- **連結的 `target="_blank"`、`rel` 不保留**：Markdown 連結表達不了。要外部連結另開分頁，15 號可以在 Markdown 設定統一處理。
- **`<mark>` 的實際用途**：已發布的內容只有 4 個 `<mark>`（規劃時的 20 個含修訂版本），都是 `background-color:rgba(0, 0, 0, 0)` 加灰色字的 class，也就是 WordPress 的「文字顏色」功能，不是螢光筆。照 spec 統一成 `<mark>`；15、18 號可以決定要不要改回一般文字。
- **`<ruby>` 只出現在對照滑桿的圖說裡**：規則已經寫好也有測試，等 10 號轉換圖說時才會出現在輸出。

### frontmatter 與內容 schema

- 文章：`src/content/posts/<slug>.md`，頁面依階層放：`src/content/pages/about/contact.md`。
- 文章 frontmatter：`title`、`slug`（解碼後的 UTF-8）、`published`、`updated`（都寫成 `+08:00` 的時間）、`categories`、`tags`、`excerpt`（手動摘要，11 篇有）、`description`（AIOSEO 自訂描述，11 篇有）、`socialImage`（AIOSEO 社群圖片，11 篇有，暫時是舊的 upload 路徑，06 號改成統一圖片目錄裡的圖）、`draft`、`wordpressId`。
- 頁面 frontmatter：`title`、`slug`、`parent`（父頁面路徑，例如 `about`）、`updated`、`description`、`wordpressId`。
- 分類與標籤是兩個 collection（`src/data/categories.json`、`src/data/tags.json`），ID 就是網址裡的 slug，文章用 `reference()` 參照。只列有已發布文章的分類與標籤（3 個與 57 個），「未分類」不列。
- `src/content.config.ts` 驗證 frontmatter，錯了建置就失敗。踩到的坑：**Astro 對參照到不存在的分類或標籤只印出錯誤，建置照樣成功**（而且之後的建置因為快取連錯誤都不印）。所以 `src/lib/content.ts` 的 `getPosts()` 另外檢查，參照錯誤時建置失敗。手動驗證過：拿掉 `title`、改成不存在的標籤，建置都會失敗。
- 文章至少要有 `description` 或 `excerpt` 其中一個（schema 檢查），這就是 meta description 的來源：有 AIOSEO 自訂描述用自訂的，否則用摘要。
- `draft: true` 的文章只在正式建置時排除（`getPosts()`），11、12 號列文章時也要用這個函式。

### 時區與網址

- WordPress 的 `post_date_gmt` 是 UTC，轉換器換算成 Asia/Taipei 寫進 frontmatter；網站用 `published` 在 Asia/Taipei 的日期組出 `/YYYY/MM/DD/<slug>/`（`src/lib/content.ts`）。轉換器也逐篇比對換算結果跟 WordPress 存的當地時間 `post_date` 一致，不一致就停下。
- 2025-05-17 同一天有 9 篇文章（前言與 Day 1–8），網址都跟 WordPress 一致。
- 頁面網址由 `parent` 和 `slug` 組成：`/about/`、`/about/contact/`、`/about/autobiography/`、`/policy/`、`/subscribe/`。
- 路由：`src/pages/[year]/[month]/[day]/[slug].astro`、`src/pages/[...page].astro`。版型目前只有標題、日期、內文，15 號重做。

### AIOSEO 的設定

- 自訂描述在 11 篇文章（2025 年以後的遊記等）。352 號文章的描述欄位是 `#post_excerpt`、標題欄位是 `#post_title #separator_sa #site_title`，都是 AIOSEO 的預設範本，不是自訂值。**所以其實沒有自訂標題**（規劃時記為 1 篇），14 號不用處理。轉換器遇到其他範本寫法或自訂標題會直接停下，不會默默忽略。
- 社群圖片：10 篇用自訂圖片，前言那篇設定成「精選圖片」（`_thumbnail_id` → `highlight.jpg`），一併帶入，共 11 篇。
- 頁面沒有自訂描述，AIOSEO 用的是 `#post_content`：從內文產生。看了備份裡 AIOSEO 的原始碼（`getDescriptionFromContent()`）照做：去掉圖片、figure 與嵌入、去掉 shortcode、區塊層級的標籤之間視為空白（wpautop 的效果）、去掉所有標籤、空白合併，取前 55 個字元（zh_TW 以字元計算）。5 個頁面的結果跟線上網站的 meta description 逐字相同（2026-10-24 抓的）。
- 線上網站的標題有 `遊記 – 岡山…`（en dash），資料庫裡是 `遊記 - 岡山…`：WordPress 的 wptexturize 會把 ` - ` 換成 ` – `。frontmatter 保留資料庫裡的原文；Astro 預設的 smartypants 在內文有類似效果，但不處理 `<title>`，14 號比對標題時要決定怎麼處理。

### 舊網址對應表

`src/data/old-url-map.json`，一行一筆，網址依 code point 排序：

- `content`：每篇文章與頁面的 `wordpressId`、`type`、`title`、`url`、`file`、`oldSlugs`、`oldDates`。
- `urls`：網址檢查讀的預期，格式沒變（`{ url, expect, location? }`），`fromMappingTable()` 不用改。
- 之後 06 號加 upload 路徑與附件頁、07 號加影片與 PDF 的路徑，各自一個 `url-map/` 模組和 section。

涵蓋從 WordPress 資料推得出來的每一類舊網址，預期照 spec 的路由與轉址章節：

| 類別 | 數量 | 預期 | 負責 |
|---|---|---|---|
| 首頁、文章、頁面 | 1 + 22 + 5 | 200 | 05 |
| `?p=ID`、`?page_id=ID`（每篇文章與頁面兩種都有） | 54 | 301 到該文章或頁面 | 13 |
| 沒用過的 ID（備份裡最大的 ID 加 1：`?p=1887`、`?page_id=1887`） | 2 | 404 | 13 |
| 舊 slug | 1 | 301 到現在的網址 | 13 |
| 分類、標籤 | 3 + 57 | 200 | 11 |
| 「未分類」 | 1 | 404 | — |
| 日期彙整（有文章的年、月、日） | 4 + 9 + 14 | 200 | 11 |
| 分頁：`/page/2/`、`/page/3/`、`/2025/page/2/` | 3 | 200 | 11 |
| `/page/4/` | 1 | 404 | 11 |
| `/feed/`、`/feed/atom/` | 2 | 200 | 12 |
| `/comments/feed/` | 1 | 301 到 `/feed/` | 13 |
| 文章、頁面、分類、標籤的 `…/feed/` | 22 + 5 + 3 + 57 | 301 到該頁 | 13 |
| `/author/erase2004/` | 1 | 301 到 `/about/` | 13 |
| `/wp-sitemap.xml` | 1 | 301 到 `/sitemap.xml` | 13 |
| `/wp-admin/`、`/wp-login.php`、`/xmlrpc.php`、`/wp-json/` | 4 | 404 | — |

用線上網站確認過的幾件事（2026-10-24）：

- **舊日期的轉址其實是 0 筆**：備份裡 3 筆 `_wp_old_date` 屬於導覽選單項目（2 筆）和一個 Envira 相簿，不是文章。13 號寫的「3 篇改過日期的文章」不存在；程式仍然會處理文章的 `_wp_old_date`，只是目前沒有資料。
- **`/2025/page/2/` 存在**（200）：2025 年有 11 篇文章，每頁 10 篇。11 號的 issue 只提到分類與標籤不會有分頁，這一頁也要產生。
- **頁面也有 feed**：`/about/feed/`、`/about/contact/feed/` 都回 200，所以跟文章的 feed 一樣列入，13 號的動態規則要涵蓋頁面。
- `?page_id=` 加文章 ID、`?p=` 加頁面 ID 也都會 301（WordPress 找不到時用 ID 找）；不存在的 ID 回 404。
- `/category/uncategorized/` 在 WordPress 回 200（空的彙整頁），spec 決定不產生，所以預期是 404。
- `/wp-sitemap.xml` 在 WordPress 是 302，spec 要 301。
- 沒有涵蓋的：`?cat=`、`?tag=`、`?m=`、`?author=`、`?s=` 等其他 query string，以及 `/feed/rss2/` 之類的 feed 變體。spec 的 Worker 只處理 `?p=` 與 `?page_id=`，要涵蓋得先改 spec。

### 待完成清單

- 22 篇文章與 5 個頁面通過，從清單移除（27 筆）。
- 對應表帶進來、還沒實作的預期全部加進清單（179 筆），之後由 11、12、13 號照 WordPress 推出來的預期逐步刪掉，而不是照各自的實作結果。帶 query string 的 56 筆在建置輸出模式是略過，在 HTTP 模式會失敗，所以也在清單上。
- 清單從 855 筆變成 1,007 筆。新增的方式：跑一次網址檢查，把失敗與略過的網址照 03 號的排序與分組規則插進去（先確認過同樣的程式對原本的清單會一字不差地重現）。

### 測試

- `tests/wordpress-converter/sql-dump.test.ts`：SQL 的解析，含跳脫字元與 NULL。
- `tests/wordpress-converter/content.test.ts`：每條轉換規則至少一個 fixture，片段取自真正的備份；強調、跳脫、連結、表格等用 Sätteri 渲染確認讀者看到的結果，並確認輸出能編譯成 MDX；每一種留給後續 issue 的元素都要留下標記；規則的擴充方式（認領、重複認領報錯、import 讓檔案變成 MDX、文末內容）。
- `tests/wordpress-converter/convert-wordpress.test.ts`：用一個小型的 WordPress 資料（真實資料列刪減而成）轉換整個網站：frontmatter、時區、AIOSEO、頁面階層與描述（期望值是線上網站的實際描述）、分類與標籤資料檔、對應表的每一類舊網址、資料列順序不影響輸出。
- `tests/site-serving.test.ts`（03 號）：對真正的建置結果跑網址檢查，22 篇文章與 5 個頁面在建置輸出與 HTTP 兩種模式都通過，待完成清單剛好列出還沒做的網址。
- 加了 `satteri` 作為 devDependency，版本跟 Astro 用的同一個（0.10.5，npm 只裝一份），讓測試用跟網站一樣的引擎渲染 Markdown。

## 07：影片與 PDF 搬到 R2（2026-10-24）

### 上傳與檢查

上傳需要 Cloudflare 的憑證，由站長在本機或 CI 執行；影片和 PDF 不進 repo。

```sh
npm run upload-media -- --dry-run      # 列出每個檔案要執行的 wrangler 指令，不上傳，不需要憑證
npm run upload-media                   # 需要環境變數 CLOUDFLARE_API_TOKEN、CLOUDFLARE_ACCOUNT_ID
npm run upload-media -- --force        # 不管 R2 上有沒有，全部重新上傳
npm run upload-media -- --backup <資料夾>   # 備份不在 D:/wordpress-backup 時
npm run verify-media                   # 每個網址回 200、Content-Type 與大小正確，range request 回 206
```

- 檔案清單來自舊網址對應表的 `media` section（轉換器產生），每個檔案一行：WordPress 附件 ID、所屬文章、舊的 upload 路徑、附件頁、R2 上的網址、Content-Type、檔案大小。上傳、檢查和 `_redirects` 都讀這一份。
- 每個檔案執行一次 `wrangler r2 object put media/<key> --file <備份裡的檔案> --content-type <type> --remote`。**wrangler 4 的 `r2 object` 指令預設操作本機的模擬 bucket，一定要加 `--remote`**。wrangler 單次上傳的上限是 300 MiB（最大的影片 77 MiB），所以都是單一 PUT。
- **可以重複執行**：上傳前先對 R2 的網址發 HEAD，ETag 等於本機檔案的 MD5（單一 PUT 上傳的物件，R2 的 ETag 就是 MD5）且 Content-Type 相同就略過，所以中途失敗時重跑一次只會補傳缺的。這個 HEAD 加了一個 query string，避免檢查時的 404 被 Cloudflare 快取在真正的網址上。
- 上傳前先確認備份裡每個檔案都在、大小跟 WordPress 記錄的（`_wp_attachment_metadata` 的 `filesize`）一致，有任何不符就一個都不傳。
- `verify-media` 對每個網址發一般的 GET（只讀 header），再從檔案中間要 1,024 bytes（`<video>` 拖曳進度條時就是這樣要資料），檢查回 206、`Content-Range` 正確。舊網址有沒有轉到這裡，是網址檢查的工作。
- 2026-10-24 對 `media.aniya.moe` 跑過 dry run 與 verify：9 個檔案都還沒上傳（404），備份裡的 9 個檔案大小都跟資料庫記錄一致。如果剛上傳完 verify 還看到 404，可能是 Cloudflare 快取了之前的 404，等幾分鐘再跑。

### R2 上的位置

`https://media.aniya.moe/videos/<文章 slug>/<檔名>`（影片）、`https://media.aniya.moe/files/<文章 slug>/<檔名>`（PDF），檔名不改。

| 檔案 | 文章 | 大小 |
|---|---|---|
| `瀨戶內國際藝術祭-2025-3.pdf` | travel-setonaikai-2025-prologue | 0.6 MB |
| `20250421_172759284.mp4` | travel-setonaikai-2025-day2 | 23 MiB |
| `20250426_103131827.mp4`、`20250426_103338052.mp4` | travel-setonaikai-2025-day7 | 77 MiB、46 MiB |
| `20250427_092603501.mp4` | travel-setonaikai-2025-day8 | 25 MiB |
| `round-switch-01.mp4`、`fcp-01.mp4`、`virtualized-view-01.mp4`、`virtualized-view-01-1.mp4` | acgn-museum-ssg | 0.4–5.8 MiB |

- 「文章」是內容裡用到這個檔案的那篇；沒有文章用到的，算它當初上傳到的那篇。備份裡兩種特例各一個：
  - `20250426_103131827.mp4` 上傳時沒有附加到任何文章（`post_parent` 是 0），是 Day 7 用的，所以放在 Day 7。
  - `virtualized-view-01.mp4` 沒有被任何內容用到（文章用的是重新上傳的 `virtualized-view-01-1.mp4`），照 issue 一樣搬，放在它上傳到的 acgn-museum-ssg。
- 一個檔案被兩篇以上用到、或沒人用又沒有上傳到已發布文章時，轉換器會直接停下。
- 8 支 mp4 共 187,229,733 bytes（178.6 MiB，issue 寫的 179 MB）。其中 2026 年的 4 支，WordPress 的 metadata 偵測成 `video/quicktime`，但附件類型與線上網站回的 Content-Type 都是 `video/mp4`，照 `video/mp4` 上傳。

### 內容的轉換（`rules/media.ts`）

- 影片 block 轉成 HTML，在 .md 與 .mdx 裡意思都一樣（測試用 Sätteri 渲染並編譯成 MDX 確認）：

  ```html
  <figure>
  <video controls loop muted preload="metadata" src="https://media.aniya.moe/videos/acgn-museum-ssg/round-switch-01.mp4"></video>
  <figcaption>在不同賽季間切換瀏覽「初音未來」這家公司的資訊</figcaption>
  </figure>
  ```

  `loop`、`muted` 等只在原本有設定時保留。`preload="metadata"` 是 Gutenberg 影片 block 的預設值（預設值不寫進 HTML），寫出來讓瀏覽器一開始只抓影片長度和第一格，不會一進頁面就下載 77 MiB。置中的 class 跟其他 block 一樣不保留。
- PDF 的 file block 轉成一個連結 `[瀨戶內國際藝術祭 2025 旅遊計畫](https://media.aniya.moe/files/…/瀨戶內國際藝術祭-2025-3.pdf)`。原本旁邊的「下載」按鈕是同一個檔案的第二個連結，不保留（它的 `download` 屬性對其他網域的檔案本來就無效）。
- 05 號留下的 `core/video`（7 個）與 `core/file`（1 個）標記全部處理掉。找不到對應附件的影片或檔案仍然留下標記。

### 舊網址

- 9 個舊的 upload 路徑與 9 個附件頁，全部 301 直接轉到 R2 上的網址（附件頁不先轉到舊 upload 路徑，少一次轉址）。
- 附件頁的網址照 WordPress 的 `get_attachment_link()`：附加在文章上的是 `<文章網址><附件 slug>/`（PDF 的 slug 是中文：`/2025/05/17/travel-setonaikai-2025-prologue/瀨戶內國際藝術祭-2025-3/`）；沒附加的在最上層：`/20250426_103131827/`。9 個都在線上網站確認過，WordPress 都是 301 到檔案本身（2026-10-24）。
- `_redirects` 的規則由 `src/integrations/media-redirects.ts` 在建置時從 `media` section 產生，跟 01 號的斜線規則一樣用附加的方式寫進 `_redirects`，共 18 條靜態規則。**`_redirects` 裡第一條動態規則之後的規則都算動態規則**，13 號加動態規則時要放在這些規則後面。
- 沒有涵蓋：`/?attachment_id=1403` 這種 query string（WordPress 會 301 到附件頁；spec 的 Worker 只處理 `?p=` 與 `?page_id=`）、附件頁少了結尾斜線的寫法、`/<文章網址>/attachment/<slug>/` 這種 WordPress 也接受的別名。

### 待完成清單

沒有變動：影片與 PDF 的網址不在 sitemap 快照裡，05 號也沒有把它們加進對應表，所以從來不在清單上。這次加進對應表的 18 筆預期在建置輸出與 HTTP 兩種模式都直接通過。

### 測試

- `tests/wordpress-converter/media.test.ts`：用 05 號的小型 WordPress 資料加上備份裡的影片與 PDF 附件（真實資料列刪減而成）：影片與 PDF 的轉換結果、資料夾怎麼決定（用到的文章、沒附加的、沒人用的）、附件頁網址、對應表的 `media` section 與轉址預期。
- `tests/r2-media/upload.test.ts`：用暫存資料夾當備份、本機 HTTP server 模擬 `media.aniya.moe`、記錄呼叫的函式代替 wrangler：dry run 印出指令且不需要憑證、略過內容與類型相同的物件、內容或類型不同時重傳、`--force`、備份檔案缺少或大小不符時一個都不傳、沒有憑證不傳、wrangler 失敗時停下。
- `tests/r2-media/verify.test.ts`：同一個模擬 server：正常時通過；檔案不存在、類型或大小不對、server 不支援 range request（回 200）時各自報錯。
- `tests/site-serving.test.ts`（03 號）照舊對真正的建置結果跑網址檢查，現在包含這 18 筆轉址。

### 還沒驗證（上傳之後）

- R2 的自訂網域對 range request 回 206、中文檔名的 key 能用百分比編碼的網址讀到：`npm run verify-media` 會確認。
- 在瀏覽器裡實際播放、拖曳進度條：上傳後打開 Day 7（77 MiB 那支）試。
- HTTP 模式的網址檢查（預覽網址，19 號）確認正式環境的 `_redirects` 對 R2 的轉址。

## 11：彙整頁（2026-10-24）

### 產生的網址

| 路由 | 網址 | 數量 |
|---|---|---|
| `src/pages/index.astro` | `/`（最新 10 篇） | 1 |
| `src/pages/page/[page].astro` | `/page/2/`、`/page/3/` | 2 |
| `src/pages/category/[category]/[...page].astro` | `/category/<slug>/`（技術、旅遊、閒聊） | 3 |
| `src/pages/tag/[tag]/[...page].astro` | `/tag/<slug>/` | 57 |
| `src/pages/[year]/[...archive].astro` | `/YYYY/`、`/YYYY/MM/`、`/YYYY/MM/DD/`，加上 `/2025/page/2/` | 4 + 9 + 14 + 1 |

- 全部由 `src/lib/archives.ts` 產生：每個彙整（首頁、分類、標籤、年、月、日）是一串新到舊的文章，`archivePages()` 每 10 篇切一頁，第 2 頁以後在 `<彙整網址>page/N/`。分類與標籤走同一段程式，現在沒有超過 10 篇的（旅遊剛好 10 篇），所以沒有分頁；之後旅遊再多一篇，`/category/旅遊/page/2/` 會自動出現。
- 「未分類」沒有文章，不產生，繼續回 404。`/page/4/`、`/2025/page/3/` 也是 404。
- 幾個路由的樣式互相重疊（`[year]/[...archive]`、`[year]/[month]/[day]/[slug]`、`[...page]`）。Astro 7 只有在兩個路由產生**同一個網址**時才算衝突，所以沒問題；`astro dev` 也確認過每種網址都找得到對的頁面。
- 建置後總共 119 頁，`_redirects` 的補斜線規則變成 117 條（01 號估計約 116 條）。

### 跟 WordPress 一樣的地方（2026-10-24 對照線上網站）

- 標題照 AIOSEO 的範本：`技術 - TsukiStudio`、`BOOK☆WALKER - TsukiStudio`、`2025 - TsukiStudio`、`5 月, 2025 - TsukiStudio`（月份彙整就是這個怪格式）、`2025 年 5 月 17 日 - TsukiStudio`；第 2 頁以後加上 ` - Page N`（AIOSEO 的 `pagedFormat`），例如 `TsukiStudio - 生活點滴紀錄 - Page 3`。
- 第 2 頁以後是 `noindex, nofollow`：AIOSEO 的 `noindexPaginated`、`nofollowPaginated` 都開著，所以除了首頁分頁，`/2025/page/2/` 也是。spec 只寫了 `noindex`，這裡照「跟搬遷前一樣」連 `nofollow` 一起保留。第一頁（包括日期彙整）沒有 `noindex`，維持可索引。
- `<link rel="prev">`、`<link rel="next">` 照舊輸出。
- 列表依發布時間新到舊；2025-05-17 同一天的遊記照發布時間排，順序跟 WordPress 一樣。

### 跟 WordPress 不一樣的地方

- **canonical**：WordPress 的分頁 canonical 指向第一頁（`/page/2/` → `/`、`/2025/page/2/` → `/2025/`）。spec 規定每頁都指向自己，網址檢查也這樣檢查，所以指向自己。這些頁面本來就是 noindex，影響不大。
- **meta description**：WordPress 的分類、標籤、日期彙整都沒有 description（AIOSEO 的範本是空的，或是分類描述，而分類都沒寫描述）。網址檢查要求每頁都有，所以補上「分類「技術」的文章」「2025 年 5 月的文章」這類句子，第 2 頁以後跟 WordPress 的首頁分頁一樣加上 ` - Page N`。首頁沿用 `生活點滴紀錄`。
- 首頁標題順便改成 WordPress 的 `TsukiStudio - 生活點滴紀錄`（本來是 14 號的項目，首頁改成文章列表時一起做了）。
- 列表裡每篇文章顯示標題、日期、摘要（沒有手動摘要的用 AIOSEO 描述）；WordPress 顯示的是 `<!--more-->` 之前的內文。版面由 15 號重做。

### 側欄元件（給 15 號放進側欄）

- `src/components/CategoryList.astro`：有文章的分類，依名稱排序，附文章數，例如「技術 (9)」。
- `src/components/YearList.astro`：有文章的年份，新到舊，附文章數，例如「2025 (11)」。
- `src/components/TagCloud.astro`：有文章的標籤，依名稱排序，文章越多字越大。
- 名稱的排序照 WordPress 的 `strnatcasecmp`：英文字母不分大小寫，其他字元照 code point，所以日文在中文前面。
- 標籤雲的字級照 WordPress（`wp_generate_tag_cloud()`，小工具設定 10pt–16pt）：`round(log10(文章數 + 1) * 100)` 線性對應到 10pt–16pt，跟線上網站的字級差不到 0.01pt。WordPress 的小工具只顯示 30 個標籤（文章數最多的 30 個；同樣是 1 篇的標籤選哪幾個，取決於 MySQL 回傳的順序，沒辦法重現），這裡 57 個全部顯示。
- 元件裡沒有標題（WordPress 是「Category」「ARCHIVES」），樣式只有標籤雲排成一行，標題與外觀交給 15 號。

### 發現

- spec 說 2025-05-17 有 8 篇遊記，其實是 9 篇（前言加 Day 1–8），這一天的彙整頁有 9 篇。
- 12 號做 sitemap 時要排除日期彙整與分頁：`src/lib/archives.ts` 的 `categoryArchives()`、`tagArchives()` 可以直接拿來列分類與標籤。

### 待完成清單

日期彙整 28 頁（含 `/2025/page/2/`）、分類 3 頁、標籤 57 頁、`/page/2/`、`/page/3/` 通過，從清單移除 90 筆：1,007 筆 → 917 筆。`/page/` 這一組整個清空，順手刪掉多出來的空行。

### 測試

`tests/site-serving.test.ts`（對建置結果開 `wrangler dev`，用 HTTP 請求檢查）：

- `archives`：分類、標籤（含 `book☆walker`、日文 slug）、年、月、日彙整、`/2025/page/2/`、首頁與 `/page/N/` 列出的文章與順序；分頁的 `noindex, nofollow`；標題。期望值都是線上 WordPress 同一個網址列出的內容。
- `sidebar widgets`：三個元件放在只有測試建置才有的 `/widgets/` 頁（`tests/fixtures/widgets-page.astro`），期望值是線上網站側欄的分類數、年份數與標籤雲字級。`tests/support/build-site.mjs` 多了第三個參數 `<widgetsPath>`。

### 07 補記：實際上傳到 R2（2026-10-24）

- 由 orchestrator 用 `npm run upload-media` 上傳，token 只放在執行當下的環境變數裡，沒有寫進任何檔案。
- 9 個檔案全部上傳完成。再跑一次 `--dry-run` 顯示「0 個要上傳、9 個已在 R2」，確認重複執行不會重傳。
- `npm run verify-media`：9 個全部通過。每個檔案都回 200，Content-Type 與大小正確；從中段要 1 KiB 的 range request 回 206，Content-Range 正確，影片可以拖曳進度條。

## 08：程式碼區塊、腳註與 YouTube（2026-10-24）

### 程式碼區塊 → Expressive Code

- 9 個程式碼區塊（3 篇文章）由 Code Syntax Block 外掛寫成：`<pre title="src/router/index.js" class="wp-block-code"><code lang="javascript">`。轉換規則 `rules/code.ts` 轉成 fenced code：`` ```javascript title="src/router/index.js" ``，`title` 屬性就是 Expressive Code 的檔名標題；沒有 `title` 的 3 個就只有語言。
- **語言名稱**：外掛用的是 Prism 的名稱，其中 `markup` Shiki（Expressive Code 用的高亮引擎）不認得。外掛自己的語言清單把 `markup` 標示為「HTML」，所以轉成 `html`；`javascript`、`typescript` 照舊。
- 程式碼內容只解碼 HTML 字元參照（`&gt;` → `>`），不經過 shortcode 的處理，程式碼裡長得像 `[ref]` 的文字原樣保留；內容有 `` ``` `` 時自動加長 fence。
- 行號：外掛的 `lineNumbers` 屬性從來沒有設成 true（只有一個區塊明確寫 false），原本就沒有行號，所以沒裝行號外掛。`<pre id="block-…">` 沒有被任何連結用到，不保留。
- 網站端：`astro-expressive-code` 0.44.3。Astro 7 預設的 Markdown 引擎是 Sätteri，Expressive Code 從 0.44 起直接支援（把自己加進 Sätteri 的 hast plugin），**不需要**改回 remark／`@astrojs/markdown-remark`。整合要放在 `mdx()` 前面，.md 與 .mdx 都有效。
- Expressive Code 只有英文與德文的介面文字，複製按鈕用 `pluginFramesTexts.addLocale('zh-TW', …)` 加上中文（「複製到剪貼簿」「已複製！」），`defaultLocale: 'zh-TW'`。
- 佈景主題用預設的 `github-dark`／`github-light`，跟著系統的深淺色切換；15 號決定配色時可以在 `expressiveCode({ themes })` 改。
- 其他 issue 還沒處理的未轉換標記本來就是 `html title="wp-unconverted: …"` 的程式碼區塊，現在也由 Expressive Code 顯示（標題列寫著 `wp-unconverted: core/image` 等），一樣看得到。

### 腳註 → GFM 腳註

- 兩套腳註都轉成 GFM 腳註 `[^n]`（`rules/footnotes.ts`），一篇文章裡兩套共用同一組編號，依出現在內文的順序編號，註解文字統一放在檔案最後（`[^1]: …`，一行一則）：
  - `[ref]…[/ref]`（Footnotes 外掛）：38 個，在 5 篇 2021–22 年的文章與「自傳」頁面。外掛設定是 `[ref]`／`[/ref]`、阿拉伯數字、相同內容合併（實際沒有內容相同的腳註）、註解列在文末。
  - Gutenberg 內建腳註：內文的 `<sup data-fn="ID">` 共 37 個，在 8 篇 2025 年以後的文章；註解文字存在 postmeta `footnotes`（JSON），依 ID 對應。逐篇比對過：內文出現的順序跟 JSON 的順序一致，原本的編號就是 1、2、3…，所以轉換後的編號跟原文一模一樣。`core/footnotes` 區塊本身不輸出，註解改由網站列在文末。
- 防呆：JSON 裡有註解沒被內文引用時，轉換器直接停下（GFM 不顯示沒被引用的註解，等於默默遺失）；內文引用了 JSON 裡沒有的 ID，留下未轉換標記。實際資料兩種情況都沒有。352 號文章的 `footnotes` 是空字串、442 號是 `[]`，都沒有 Gutenberg 腳註。
- 網站端：Sätteri 本來就支援 GFM 腳註。點編號跳到 `#user-content-fn-n`，註解後面的 ↩ 跳回 `#user-content-fnref-n`。腳註區的標題預設是英文「Footnotes」（`sr-only`，只給螢幕閱讀器），改成中文：

  ```js
  markdown: {
    processor: satteri({
      features: {
        gfm: { footnotes: { label: '註腳', backLabel: '回到內文的註腳 {reference}' } },
        smartPunctuation: true,
      },
    }),
  },
  ```

  為了 import `satteri()`，把 `@astrojs/markdown-satteri` 加成直接相依，版本跟 Astro 用的同一個（0.4.5）。傳入 `features` 時明確寫上 `smartPunctuation: true`，維持 Astro 的預設。
- WordPress 原本的錨點（Gutenberg 的 `#<uuid>`、外掛的 `#footnote_plugin_…`）不保留：站內沒有連結指向它們，搜尋引擎也不會索引片段。

### YouTube → 輕量嵌入

- 前言那篇的 2 個 YouTube 嵌入轉成 `<YouTube id="x3_Pcru8SS8" title="TVアニメ『Summer Pockets』第1弾PV" />`（`rules/youtube.ts`），檔案因為 import 變成 `.mdx`，對應表裡的檔名跟著改。其他網站的嵌入（實際沒有）留下未轉換標記。
- **標題從 oEmbed 快取來**：WordPress 把嵌入時拿到的 player HTML 存在 postmeta `_oembed_<md5>`，iframe 的 `title` 就是影片標題。key 是網址加參數的 md5，不好重算，所以在這篇文章的 `_oembed_*` 裡找 `src` 含有該影片 ID 的 iframe。找不到時元件用「YouTube 影片」。
- 元件 `src/components/YouTube.astro`：
  - 先顯示縮圖 `https://i.ytimg.com/vi/<id>/hqdefault.jpg`（480×360、上下有黑邊，用 `object-fit: cover` 放進 16:9 的框剛好裁掉），外面包著到 YouTube 影片頁的連結，所以沒有 JavaScript 也能看。
  - 點下去才換成 `youtube-nocookie.com` 的 iframe（`autoplay=1`，一次點擊就開始播放），焦點移到 player。
  - 元件裡的 `<script>` 由 Astro 打包，只在用到元件的頁面載入。
  - 縮圖本身仍是對 `i.ytimg.com` 的請求（沒有 cookie）；要完全不連第三方，得在建置時下載縮圖，目前沒做。
- 踩到的坑：縮圖是 inline 元素時，底下的行高空隙把 16:9 的框撐高，露出一條黑邊；改成 `display: block`。

### 測試

- `tests/wordpress-converter/code.test.ts`、`footnotes.test.ts`、`youtube.test.ts`：一條規則一個檔案，片段取自真正的備份；腳註用 Sätteri 渲染確認編號與來回連結，Gutenberg 腳註和 YouTube 標題用小型的 WordPress 資料（含 postmeta）轉換。`content.test.ts` 的「留給後續 issue」清單拿掉這幾種，`convert-wordpress.test.ts` 改成確認 Gutenberg 腳註從 postmeta 轉出來。
- `tests/site-serving.test.ts` 加了「converted content」：建置時多產生測試用的 `/converted/md/` 與 `/converted/mdx/`（`tests/fixtures/converted-content.*`，內容就是轉換器輸出的寫法），檢查 Expressive Code 的檔名標題、語言與高亮、中文複製按鈕、腳註的來回連結與中文標籤、YouTube 只有縮圖沒有 iframe。
- 踩到的坑：
  - `injectRoute()` 直接指向 `.md`／`.mdx` 時，Astro 把它當成 API endpoint（警告「No API Route handler exists for the method GET」），不會產生頁面。改用一個 `.astro` 頁面 import 兩個檔案、用 `getStaticPaths()` 產生兩頁。`tests/support/build-site.mjs` 多收 `<路徑>=<fixture>` 參數。
  - 兩個測試檔同時對同一個專案跑 Astro 建置，會互相刪掉 `.astro/.prerender` 裡的檔案而失敗，所以建置相關的檢查都放在 `site-serving.test.ts`，共用一次建置。
  - 在 Git Bash 手動執行 `build-site.mjs` 時，`/probe/` 這種參數會被轉成 `C:/Program Files/Git/probe/`，要加 `MSYS_NO_PATHCONV=1`。
- 點擊行為用 headless Chrome（DevTools Protocol）實際操作確認：前言頁一開始 0 個 iframe、2 張縮圖，點第一張後換成 `youtube-nocookie.com/embed/x3_Pcru8SS8?autoplay=1` 的 iframe，標題正確、取得焦點、沒有 JavaScript 錯誤；腳註點編號跳到註解、點 ↩ 跳回原處。

### 未轉換標記

08 號負責的 `core/code`（9）、`[ref]`（38）、`sup[data-fn]`（37）、`core/footnotes`（8）、`core/embed`（2）全部處理掉。合併 07、11 號之後重跑轉換器，剩下的都屬於 06、09、10 號：

```text
core/gallery: 3 in 3 files
core/html: 8 in 4 files
core/image: 93 in 18 files
envira/envira-gallery: 83 in 10 files
img: 6 in 4 files
jetpack/image-compare: 72 in 6 files
```

## 15：版型設計（2026-10-24）

### 配色：沿用 Twenty Sixteen 的自訂色

- 來源是 WordPress 的 `theme_mods_twentysixteen`：`background_color` `#1a1a1a`、`page_background_color` `#ffffff`、`main_text_color` `#1a1a1a`、`secondary_text_color` `#686868`、`link_color` `#007acc`（`color_scheme` 是 default）。線上網站看起來就是「#1a1a1a 的外框裡放一張白紙」。
- 「附加 CSS」（`custom_css`，404 bytes）只有兩條修正圖片邊距的規則（`.below-entry-meta` 的 `margin`、`max-width`），沒有顏色；新版的圖片本來就不會超出內文寬度，這兩條不需要。
- 新版保留這個基調：頁首、頁尾與寬螢幕兩側是 `#1a1a1a`，內容放在白色的紙面上；內文 `#1a1a1a`、次要文字 `#686868`、連結 `#007acc`。另外衍生幾個顏色：深色底上的連結藍 `#5ab4f0`、分隔線 `#e2e2e2`、淺灰底 `#f4f5f6`、螢光筆 `#ffe98a`。全部寫成 `src/styles/global.css` 開頭的 CSS 變數。
- 對比度：`#686868`／白 5.5:1、`#007acc`／白 4.6:1、白字／`#007acc` 4.6:1，都過 WCAG AA。
- 舊的頁首圖（夜空與月亮，`cropped-akiba07-scaled-3.jpg`）沒有沿用；改在站名前放一個月牙圖示（Tsuki＝月），呼應原本的意象。

### 版面

- 頁首（站名、標語、導覽列）→ 白色紙面（主欄＋右側欄，側欄 17rem）→ 頁尾。結構在 `src/layouts/BaseLayout.astro`，各區塊在 `src/components/Header.astro`、`Sidebar.astro`、`Footer.astro`。
- 響應式：寬度 64rem 以下側欄移到主欄下方（分類、年份並排，標籤雲全寬）；40rem 以下紙面貼齊螢幕兩邊，導覽列排成 3×2 的格子。
- **導覽列**：6 個連結的順序照線上 WordPress 的選單：首頁、關於我、我的故事、聯絡方式、訂閱、隱私權政策（issue 裡列的順序不一樣，以線上網站為準）。WordPress 把「我的故事」「聯絡方式」做成「關於我」底下的下拉選單，新版攤平成 6 個並排的連結。文字直接取頁面的標題（從 content collection 讀，頁面不存在就建置失敗），站長改頁面標題時導覽列跟著變。目前所在的頁面加 `aria-current="page"`。
- **側欄**：順序照 WordPress 側欄（搜尋、熱門文章、Category、ARCHIVES、標籤雲；熱門文章不搬）：搜尋（預留）、分類、年份、標籤。每個小工具上方一條粗線，是 Twenty Sixteen 的特徵。搜尋框的位置在 `Sidebar.astro` 開頭，用 `SEARCH SLOT (ticket 16)` 註解標出來，16 號照註解放一個 `<section class="widget" id="search">` 就有一樣的外觀。
- **文章頁**：分類、標題、發布日期與最後更新、內文、標籤。16 號的分享按鈕、相關文章、留言接在文章後面（`[slug].astro` 裡有註解標出位置）。
- **列表頁**（首頁、分類、標籤、日期彙整）：每篇顯示日期、分類、標題、摘要，下面是「較新的文章／第 N 頁，共 M 頁／較舊的文章」。首頁的 h1（站名）跟頁首重複，只留給螢幕閱讀器。
- **頁尾**：版權、Mastodon 連結。

### 日期

- 發布日期與最後更新都用 WordPress 的 `date_format`（`Y 年 n 月 j 日`）、Asia/Taipei 時區（`formatSiteDate()`），`<time datetime>` 帶完整時間。
- **排程發布的文章**：有 3 篇遊記（前言、Day 1、Day 7）的 `updated` 比 `published` 早：前一天晚上改完、設定隔天早上發布。WordPress 的 Twenty Sixteen 只顯示發布日期（`updated` 藏起來），所以以前看不出來。新版若照實顯示，會出現「最後更新比發布早」，所以最後更新取兩者較晚的那個（`src/lib/content.ts` 的 `postUpdated()`）。14 號輸出 `article:modified_time` 時要用原始值還是這個，由 14 號決定。

### 字型

- 拿掉範本的 Atkinson 字型（兩個 woff 檔與 `astro.config.mjs` 的 `fonts` 設定）。它只有拉丁字母，中文一律落到系統字型，中英混排時字重與字高對不起來。改用系統字型（Segoe UI／蘋方／微軟正黑體／Noto Sans TC），中英文由同一套系統字型搭配，也不用下載任何字型檔。
- 內文 17px（手機 16px），文章內文行高 1.85。

### 文章內文的樣式

只依賴一般的 HTML，不依賴 06、09、10 號的元件：

- 圖片、影片、iframe 不超過內文寬度；`figure`／`figcaption` 置中、說明文字用次要色。
- 表格太寬時在表格裡左右捲動（`display: block; overflow-x: auto`），整頁不會變寬；儲存格至少 6em 寬，窄欄的中文不會一字一行。
- 段落裡的長網址可以斷行；`<mark>` 統一成螢光筆（轉換器已經把各種顏色統一成 `<mark>`）。
- 腳註（`[data-footnotes]`）：文末一條分隔線、字小一號；編號顯示成 `[1]`，跳過去的註解短暫加底色。
- **Expressive Code 改成只用 `github-dark`**（08 號是 `github-dark`／`github-light` 跟著系統深淺色切換）。網站只有淺色版，系統是深色模式時只有程式碼區塊變深色會很突兀；固定成深色，也呼應頁首的 `#1a1a1a`。

### 測試

`tests/site-serving.test.ts` 新增 `layout`：

- 8 種頁面（首頁、`/page/2/`、文章、頁面、分類、標籤、月份彙整、404 頁）都檢查：頁首有連到首頁的站名與標語；導覽列是那 6 個連結、順序正確；目前頁面有標記；側欄在主欄外，依序有分類、年份、標籤（期望值同 11 號，都是線上網站的側欄）；頁尾有 `rel="me"` 的 Mastodon 連結。
- 文章日期，3 篇，期望值取自 WordPress 資料庫的 `post_date`／`post_modified`：一般情況、台北時區（台北 00:42 更新，UTC 還是前一天）、排程發布。
- **手機寬度沒有水平捲動**：用 Playwright（Chromium）以 320px 寬（WCAG 1.4.10 reflow 規定的寬度）打開全部 22 篇文章、5 個頁面、每種列表頁與 404 頁，檢查 `scrollWidth <= clientWidth`；失敗時列出超出右邊界的元素。外部請求（YouTube 縮圖、R2 影片）在測試裡擋掉，不依賴網路。還沒寫樣式時這個測試抓到 4 篇（Day 2、Day 7、Day 8、acgn-museum-ssg）：未轉換標記的程式碼區塊與影片把版面撐寬。
- Playwright 1.64.1 加成 devDependency。瀏覽器要另外安裝：`npx playwright install chromium`（約 120 MB，裝在使用者目錄，不在 repo 裡）。**04 號的 CI 要加一步 `npx playwright install --with-deps chromium`**，否則這個測試會失敗。

### 外觀確認

首頁、文章頁、分類彙整的桌面（1366px）與手機（375px）截圖交給站長確認（不放進 repo）。issue 的「站長確認外觀」等站長看過再勾。

### 發現

- WordPress 頁首有一個隱藏的 `<a rel="me" href="https://g0v.social/@erase2004">Mastodon</a>`，是 Mastodon 驗證個人檔案連結（綠色勾勾）用的，沒有任何 issue 提到。新版放在頁尾，而且改成看得到的連結；站長若想維持隱藏可以再改。

## 06：圖片搬遷與舊圖片網址轉址（2026-10-24）

### 重新產生

```sh
npm run convert-wordpress                                   # 備份與 uploads 資料夾的位置在 settings.ts
npm run convert-wordpress -- <dump.sql> <uploads 資料夾>     # 換一份備份
```

- 轉換器現在也會從備份的 `D:/wordpress-backup/wp-content/uploads`（只讀不寫）把圖片複製到 `src/assets/images/`，讓這個資料夾剛好只有內容用到的圖：多的刪掉，缺的或大小、時間不同的才複製。重跑一次是 0 張複製，不會每次重寫 377 MB。
- 跟 05 號一樣，產生出來的檔案（內容、對應表、圖片）合併衝突時，合併程式碼後重跑這個指令就好。

### 搬了哪些圖：769 張、377 MB

- 被已發布的文章與頁面用到的圖：內文裡的 `<img>`、Envira 相簿與對照滑桿 block 裡的 JSON（含 `i0.wp.com` 的 Photon 網址、`-WxH` 縮圖網址、百分比編碼的檔名），以及 AIOSEO 的社群圖片（含前言那篇的精選圖片）。共 **767 張**，跟規劃時從檔案系統算出來的清單逐一比對完全相同。
- 再加上全站設定用到的 **2 張**：AIOSEO 的預設社群圖片 `night.png`（og:image 的最後 fallback），和佈景主題的 header 圖 `cropped-akiba07-scaled-3.jpg`。spec 指定它們放 `site/`。15 號的新版型沒有沿用 header 圖（改用月牙圖示），但檔案照 spec 保留，舊網址仍轉到它（每頁都有這張圖，可能在 Google 圖片裡）。
- **跟 issue 的出入**：issue 寫「共 767 張」、「94 張孤兒圖不搬」，但規劃時這兩張被算在 94 張孤兒圖裡（沒有文章用到）。這裡照 spec 的媒體章節搬了，所以是 769 張。其餘沒搬的：資料庫裡 48 個沒人用的圖片附件；94 張裡另外 44 張根本沒有附件紀錄（Envira 自己產生的 `-320x240_c` 裁切圖與另一張 header 裁切圖）。
- 網站圖示 `cropped-night.png` 沒搬：spec 說 favicon 放 `public/`，留給 14 或 15 號。
- 不搬的另外幾類自然排除：只複製 WordPress 實際提供的那個檔案（`_wp_attached_file`），所以 `-WxH` 縮圖、超過 2560px 的相機原圖都不會進來；LiteSpeed 的 webp 與 `.bk` 備份在資料庫裡根本沒有紀錄。用 sharp 檢查過：769 張最長邊都不超過 2560px，沒有縮圖、`.bk`、`-scaled` 檔名。
- 程式：`scripts/wordpress-converter/media-library.ts` 是整個媒體庫的模型：哪些圖搬、搬到哪、任何形式的舊網址對應到哪張圖。

### 放在哪裡

- `src/assets/images/<第一篇用到它的文章 slug>/<檔名>`，「第一篇」依發布時間。檔名是 WordPress 實際提供的那個檔名，去掉副檔名前的 `-scaled`（`cropped-akiba07-scaled-3.jpg` 的 scaled 在中間，不是 WordPress 縮小時加的，保留）。
- **共用圖的放法**：有 9 張圖被兩篇以上的文章用到，sitemap 快照多出來的 11 筆就是它們（快照共 772 筆、761 個不同網址；規劃時記的「11 張圖」其實是 11 筆）：8 張同時出現在 Day 4 與 Day 8（Day 8 重用了 Day 4 的圖），1 張 48px 的小圖示出現在 Day 1、2、3、8。規則是**放在最早用到它的那篇**（Day 4、Day 1），其他文章用相對路徑引用同一個檔案，不複製兩份，也不放進 `site/`：`site/` 只放全站設定用的圖。這 9 張剛好也都是當初上傳到那篇文章（附件的 `post_parent`），或沒有掛在任何文章下。
- 同一個資料夾裡檔名（不分大小寫）撞名時轉換器會直接停下；目前沒有。
- 有一個檔名含零寬空格（U+200B）：`travel-setonaikai-2025-day5/池田港​-2-Ave-Mujica.jpg`，照原樣保留，建置與轉址都正常。18 號可以決定要不要改名。

### 內文的轉換

| 來源 | 轉成 |
|---|---|
| `core/image`（93 個） | Markdown 圖片，指向統一圖片目錄裡的原圖，不是內文用的 `-1024x768` 縮圖 |
| 有圖說的 | `<figure>` 包住 Markdown 圖片，圖說是 `<figcaption>`（保留連結，用 05 號的 raw HTML，在 .md 與 .mdx 意思都一樣） |
| 舊式 block 的 `<div id="image-1">` | `<figure id="image-1">`，內文的 `#image-1` 連結仍然有效 |
| 文字裡的 `<img>`（6 個 48px 小圖示） | 行內的 Markdown 圖片 |
| frontmatter 的 `socialImage` | 圖片的相對路徑，schema 改成 `image()`，建置時會檢查檔案存在 |

- `<figure>` 與 Markdown 圖片之間要空一行：CommonMark 的 HTML 區塊到空行才結束，中間的圖片才會被當成 Markdown，交給 Astro 最佳化。測試用 Sätteri 渲染並編譯成 MDX 確認。
- WordPress 手動調過寬度的 13 個 block（例如 768px）沒有保留寬度，現在是「最寬到原圖寬度、不超過欄寬」。18 號逐篇檢查時再決定要不要調。
- alt 文字頭尾的空白去掉。
- 09、10 號轉相簿與對照滑桿時，用 `rules/images.ts` 的 `imageSource(url, context)` 取得圖片相對於內容檔的路徑；任何形式的舊網址都可以丟進去，不是要搬的圖會直接報錯。

### Astro 的輸出：webp 與響應式尺寸

- `astro.config.mjs` 設 `image: { layout: 'constrained' }`：每張圖輸出 webp，`srcset` 是 Astro 內建的寬度（640、750、828、1080、1280、1668、2048、2560）中不超過原圖寬度的那些，`sizes` 是 `(min-width: 原圖寬px) 原圖寬px, 100vw`。原始的 JPEG／PNG 不會出現在建置結果裡。
- 實測：用 Chrome 的 DevTools 裝置模擬（390×844，跟 iPhone 差不多寬）打開 Day 2 那篇，逐一捲到每張圖，看瀏覽器實際選的檔案：
  - DPR 2：每張 2560px 的照片都載入 828w 的 webp。
  - DPR 3：載入 1280w 的 webp。
  - 桌機 1920px：載入 1920w／2048w，因為 `sizes` 寫的是 `100vw`，但內文欄沒有那麼寬（量的時候是範本的 640px；15 號的新版型是 72rem 的頁面扣掉 17rem 的側欄，不到 880px）。**`sizes` 應該改成實際欄寬**，桌機才不會下載過大的圖；Markdown 圖片不能逐張設定，要用 rehype plugin 或改 Astro 的圖片設定，留給之後的版型調整（15 號已經合併）。
  - 所有請求都是 webp，沒有原圖。
  - 注意：直接用 `--window-size=390,844` 開 headless Chrome 不準，桌面版視窗有最小寬度，選到的圖會偏大，要用裝置模擬。
- 第一次建置要做 1,278 張 webp，約 2 分半；之後 Astro 從 `node_modules/.astro` 的快取拿，建置回到幾十秒。**04 號 CI 要快取 `node_modules/.astro`**。`tests/site-serving.test.ts` 的建置時限從 180 秒放寬到 600 秒。
- 建置結果的 `_astro/` 有 1,279 個檔案、392 MB（webp 對截圖類的 PNG 不一定比較小）。離 Workers 每個版本 20,000 個檔案、單檔 25 MiB 的限制都還很遠。

### 舊網址對應表

`src/data/old-url-map.json` 新增兩個 section：

- `images`：每張搬過去的圖一筆，`{ wordpressId, file, uploads, attachmentPage }`。`file` 是新檔案，`uploads` 與 `attachmentPage` 是 WordPress 上的舊網址。轉換器丟掉之後，建置時就是從這裡產生轉址規則。
- `unusedImages`：沒搬的 48 張，舊的檔案網址與附件頁都預期回 404（共 101 個網址）。
- `urls` 新增 1,639 個 `redirect`（不寫 `location`：新網址要建置後才知道，網址檢查確認轉到同站、回 200 的網址）與 101 個 `not-found`。

舊的 upload 路徑（共 1,333 個）：

- WordPress 實際提供的檔案。
- 被 WordPress 縮小過的 563 張（`-scaled`），還有原本的相機原圖網址。sitemap 快照列的是這個沒有 `-scaled` 的網址（AIOSEO 會把 `-scaled` 拿掉），而且這些網址在 WordPress 上真的回 200（2026-10-24 實測），所以兩個都轉。
- AIOSEO 的 image sitemap 列的網址：它的 `removeImageDimensions()`（看過備份裡外掛的原始碼）會把檔名任何位置的 `-數字x數字` 與 `-scaled` 拿掉。只有一張因此不同：`puru-1536x864-1.jpg` 在 sitemap 裡變成 `puru-1.jpg`，這個網址在 WordPress 上其實是 404，但 sitemap 列過，就一起轉。

附件頁：照 WordPress 的 `get_attachment_link()`，並在線上網站逐類實測過（2026-10-24）：

| 附件掛在 | 附件頁網址 | 數量 | 處理 |
|---|---|---|---|
| 已發布的文章 | `/<文章網址><附件 slug>/` | 292 | 301 到新圖片 |
| 同上，slug 是數字 | `/<文章網址>attachment/<slug>/` | 6 | 301 到新圖片 |
| 沒有掛在任何文章下（含 `night.png`、header 圖） | `/<附件 slug>/` | 8 | 301 到新圖片 |
| Envira 相簿 | 只有 `/?attachment_id=ID` | 463 | 記在 section 裡，**不在 `urls`** |

- 中文的附件 slug 與文章網址都解碼成 UTF-8，跟對應表其他網址的寫法一樣。
- **Envira 相簿裡的 463 張圖沒有漂亮的附件頁網址**：WordPress 給它們的是 `/?attachment_id=639`（`/<文章網址>/<slug>/` 也會先 301 到這個）。帶 query string 的網址由 Worker 處理，spec 的 Worker 只處理 `?p=` 與 `?page_id=`，所以這裡只把資料記進 `images` section，沒有加進預期清單。要不要讓 Worker 也處理 `?attachment_id=`（其實所有附件都有這個網址）是**留給 13 號或站長決定的問題**；這些網址不在 sitemap 裡，被外部連結的機會很低。
- 影片與 PDF 的附件頁和路徑是 07 號的，這裡只處理圖片。

### 建置時產生 `_redirects`

- 轉址目標是 Astro 輸出的帶 hash 網址，只有建置時才知道，所以由 integration 產生：`src/integrations/image-redirects.ts` 注入一個只在建置時存在的頁面（`image-redirect-rules.ts`），它讀對應表的 `images`，用 `src/lib/images.ts` 的 `imageUrl()` 取得每張圖的網址，輸出成規則；建置完成時 integration 把規則移進 `_redirects`，再刪掉那個暫存檔。
- 轉址目標是**原圖寬度的 webp**：也就是文章裡那張圖的 `src`，同時是 `srcset` 裡最大的那個。看過 Astro 的原始碼確認 hash 只跟來源、寬高、格式、品質等有關，跟 layout 無關，所以 `imageUrl()` 跟文章裡 Markdown 圖片得到的是同一個網址；測試也直接比對。12 號的 sitemap 圖片網址也用 `imageUrl()`，就會跟轉址目標一致。
- 規則的來源路徑用 `encodeURI` 寫成大寫的百分比編碼，跟 Cloudflare 正規化之後一樣，檔名有空白也不會壞。小寫編碼的請求一樣是先 307 到大寫（01、03 號記錄的現象，19 號在預覽網址確認）。
- **一律附加、不覆蓋**：把 01 號 integration 裡附加 `_redirects` 的那幾行抽成 `src/integrations/redirects-file.ts` 的 `appendRedirects()`，補斜線的規則和圖片規則都用它。07 號平行做的 `media-redirects.ts` 自己複製了同一段寫法，合併時也改成用它（行為不變）。13 號寫 `_redirects` 也請用它。
- **規則數量**：合併 07、08、11 號之後，補斜線 117 條（11 號的彙整頁）、影片與 PDF 18 條（07 號）、圖片 1,639 條（1,333 個 upload 路徑 + 306 個附件頁），共 **1,774 條靜態規則**。13 號再加約 10 條靜態規則與幾條動態規則，約 1,785 條，還在 2,000 以內，但只剩兩百條左右的空間。
- integrations 的順序：`expressiveCode`、`mdx`、`mediaRedirects`、`trailingSlashRedirects`、`imageRedirects`、`redirectsBudget`。寫 `_redirects` 的都在 `redirectsBudget` 前面；13 號的動態規則要加在所有靜態規則之後。

### 規則數量的上限：超過就建置失敗

- `src/integrations/redirects-budget.ts`：建置完成時讀最後的 `_redirects`，靜態規則超過 2,000 條或動態規則超過 100 條就讓建置失敗。它放在 integrations 的最後一個，檢查的是所有 integration 寫完之後的結果。
- 為什麼一定要擋：看了 wrangler 的 `parseRedirects()`，超過上限的規則只會印一行警告然後**被跳過**，部署照樣成功，舊網址就默默變成 404。計數方式照它的寫法：來源有 `*` 或 `:placeholder` 的是動態規則，**第一條動態規則之後的每一條都算動態**（03 號也記錄過這點）。

### 網址檢查與待完成清單

- sitemap 快照的 772 筆圖片網址（761 個不同網址）全部通過，從待完成清單移除。對應表新增的 1,639 個轉址與 101 個 404 也全部通過，建置輸出與 HTTP（`wrangler dev`）兩種模式都是。
- 待完成清單從 1,007 筆變成 246 筆，刪掉的剛好是 761 個 `/wp-content/` 網址，其他行沒動（`/wp-content/` 那一組原本的位置留下兩個空行，不影響檢查，也避免碰到 11、13 號會改的相鄰行）。合併 07、08、11 號之後是 156 筆。

### 測試

- `tests/wordpress-converter/content.test.ts`：圖片 block（圖說含連結、舊式 block 的 id、`-scaled`／Photon／縮圖／百分比編碼的網址都指向同一個檔案、alt 的跳脫）與文字裡的 `<img>`，用 Sätteri 渲染並編譯成 MDX。
- `tests/wordpress-converter/convert-wordpress.test.ts`：fixture 加了一個小型媒體庫（真實附件刪減而成）：要複製哪些圖、共用圖放第一篇、`site/` 資料夾、社群圖片、各種舊 upload 路徑與附件頁、沒人用的圖回 404、`images` section。
- `tests/redirects-budget.test.ts`：2,000 條靜態加 100 條動態通過；2,001 條靜態失敗；第一條動態規則之後都算動態。
- `tests/site-serving.test.ts`：對真正的建置結果，模擬瀏覽器依 `srcset`／`sizes` 選圖：390px 寬的手機（DPR 2）跟桌機選到不同的檔案、都是 webp、手機那張不到一半大；舊的 upload 路徑與附件頁 301 到文章裡那張圖的 `src`。

### 留給其他 issue 的發現

- 07：`media-redirects.ts` 改用 `appendRedirects()`。07 號的附件頁網址沒有處理數字 slug 的 `attachment/`（目前影片與 PDF 都不是數字 slug，所以沒影響），也跟這裡一樣不處理 `?attachment_id=`。
- 09、10：圖片已經搬好、轉址也做好了；用 `imageSource(url, context)` 取得路徑。轉址目標固定是原圖寬度的 webp，不管相簿用什麼尺寸顯示都不受影響。
- 12：sitemap 的圖片網址用 `src/lib/images.ts` 的 `imageAt(file)` 與 `imageUrl()`，跟轉址目標是同一個網址。
- 13：`?attachment_id=ID`（見上面）。
- 14：`socialImage` 現在是 `image()`；og:image 要決定輸出格式（webp 在社群平台的支援度要查）。`night.png` 在 `src/assets/images/site/night.png`。網站圖示還沒搬。
- 版型（15 號已合併，`figure`／`figcaption` 已有樣式）：圖片的 `sizes` 改成實際欄寬。合併後 15 號的 320px 不水平捲動測試在全部文章上通過。
- 18：手動調過寬度的圖；含零寬空格的檔名。
- 04：CI 快取 `node_modules/.astro`，否則每次部署都要多花 2 分半做 webp。

## 10：對照滑桿（2026-10-24）

### 來源：其實是 80 個滑桿

- 備份裡有 72 個 `jetpack/image-compare` block，另外還有 8 個是把滑桿的 markup 手動貼成「自訂 HTML」（`wp:html`）block。issue 寫「72 個（含 `wp:html`）」，實際是 72 + 8 = **80 個**，線上網站也是 80 個滑桿（4 篇有複本的文章也都有 block 版，Jetpack 的前端 script 會一起處理）。
- 各篇：Day 2 6 個、Day 3 9 個（7 + 2）、Day 4 13 個（11 + 2）、Day 5 19 個（17 + 2）、Day 6 12 個、Day 8 21 個（19 + 2）。
- **8 個 `core/html` 全部都是對照滑桿**：`<figure class="wp-block-jetpack-image-compare"><div class="juxtapose" data-mode="horizontal">` 加前後兩張圖與圖說，跟 block 存下來的 HTML 一模一樣。全站沒有其他自訂 HTML，所以不需要「安全的 HTML 直通」；不是滑桿的自訂 HTML（實際沒有）留下未轉換標記。
- 兩種的 HTML 結構相同：前圖 `image-compare__image-before`、後圖 `image-compare__image-after`、`<figcaption>`。80 個全部是水平方向、圖都沒有 alt、每個都有圖說。block 屬性裡的圖片網址有些是 Photon（`i0.wp.com`），HTML 裡則是原本的 upload 網址；轉換器只讀 HTML，兩種網址反正都會由 06 號的 `imageSource()` 對到搬好的檔案。
- Day 8 的「(重拍)」那幾個滑桿，有 8 張前圖跟 Day 4 是同一張；06 號把共用圖放在最早發布的文章（Day 4）的資料夾，import 路徑直接指過去。

### 轉換結果

`rules/compare.ts` 把兩種 block 都轉成 `<Compare>`：

```mdx
import Compare from '../../components/Compare.astro';
import compare1After from '../../assets/images/travel-setonaikai-2025-day2/pi_20250421_063159.jpg';
import compare1Before from '../../assets/images/travel-setonaikai-2025-day2/ydmk705.jpg';

<Compare before={compare1Before} after={compare1After}>[結城友奈は勇者である](https://yuyuyu.tv/season1/)中出現的公車站</Compare>
```

- 圖片用 import 傳給元件（Astro 在 MDX 裡使用本地圖片的標準做法）。名稱是 `compare<n>Before`／`compare<n>After`，用 `compare` 開頭以免跟 09 號相簿的 import 撞名。import 由轉換器統一排序，`compare10…` 會排在 `compare1…` 前面，不影響結果。
- 圖說是元件的內容，跟標籤寫在同一行，MDX 會把它當成行內 Markdown（不會多包一層 `<p>`）。連結轉成 Markdown 連結（拿掉 `target`、`rel` 與空的 `title`），`<ruby>` 照 05 號的規則保留 HTML。
- 圖說裡的 3 個 `<ruby>`（Day 5，「豊川」「三角」）原文寫成 `<ruby>豊川<br><rp>（<small>とがわ</small>）</rp></ruby>`，沒有 `<rt>`。支援 ruby 的瀏覽器會把 `<rp>` 藏起來，所以讀音在 WordPress 上本來就看不到。照原樣保留，留給 18 號人工檢查時決定要不要改成 `<rt>`。
- 6 篇文章因此變成 `.mdx`，對應表的 `file` 跟著改。

### 元件 `src/components/Compare.astro`

- 包裝 `img-comparison-slider` 8.0.7（web component，壓縮後約 11 kB，滑鼠、觸控、取得焦點後的方向鍵都能拖曳）。前圖放在 `slot="first"`（分隔線左邊），後圖放在 `slot="second"`，分隔線一開始在中間。
- 圖片用 Astro 的 `<Image>`：webp、多種寬度。`sizes` 是 `(min-width: 64rem) 728px, 100vw`，也就是 15 號版型的內文欄寬：有側欄時最寬 728px，窄螢幕時接近螢幕寬。實測 1440px 寬的桌機選到 750w，390px 寬的手機（DPR 1）選到 640w。
- **滑桿的形狀**：web component 的框由後圖決定，但 WordPress 用的 Juxtapose 是依前圖的長寬比。所以兩張圖都用前圖的長寬比、`object-fit: cover` 填滿同一個框。80 組裡有 79 組前後兩張圖的比例差不到 3%，看不出裁切；只有 Day 5「夜行巴士」那組（前圖 16:9、後圖 4:3）的後圖上下會被裁掉一些。
- 元件的 `<script>` 只有 `import 'img-comparison-slider'`。Astro 把它打包成 `/_astro/Compare.astro_astro_type_script_index_0_lang.*.js`，只出現在有滑桿的 6 篇文章。首頁與彙整頁只列摘要，沒有滑桿，也就不會載入。
- 套件附的 `styles.css` 沒有用：它會在 script 執行前把整個滑桿藏起來，沒有 JavaScript 就完全看不到圖。改用 `:not(:defined)` 讓 script 執行前的樣子跟執行後一樣（前圖左半、後圖右半，分隔線在中間），不會有版面位移，關掉 JavaScript 的讀者也看得到兩張圖各一半（截圖確認過）。

### 測試

- `tests/wordpress-converter/compare.test.ts`：block 版（圖說含連結，屬性裡是 Photon 網址）、`wp:html` 版、同一篇裡多個滑桿各自編號、圖說裡的 `<ruby>`、不是滑桿的自訂 HTML 留下標記，並確認輸出能編譯成 MDX。`content.test.ts` 的「留給後續 issue」清單拿掉這兩種。
- `tests/site-serving.test.ts`（共用同一次建置）：
  - `/converted/mdx/` 的 fixture 加一個 `<Compare>`：前圖在 first slot、後圖在 second slot，都是有多種寬度的 webp，圖說與連結都在。
  - 6 篇遊記建置後的滑桿數，等於備份裡 block 加 `wp:html` 的數量（共 80 個）。
  - 用 Playwright 實際操作：滑鼠從中間拖到四分之一寬，分隔線停在 25%；手機（390px、觸控）用 DevTools Protocol 送出 touch 事件，從中間拖到四分之三寬，分隔線停在 75%。
  - `customElements.get('img-comparison-slider')` 只在有滑桿的頁面有定義；Day 1、〈電子紙閱讀器使用心得〉、`/converted/md/` 都沒有。
- 15 號的 320px 不水平捲動測試在這 6 篇上也通過。
- 另外用截圖確認了桌機、手機與關掉 JavaScript 時的樣子。

### 留給其他 issue 的發現

- 09：相簿也會在這幾篇 `.mdx` 加 import，滑桿的 import 名稱都以 `compare` 開頭。內文圖片的 `sizes` 如果要改成實際欄寬，可以跟這裡的 `(min-width: 64rem) 728px, 100vw` 共用一個值。
- 12：全文 RSS 需要把 MDX（含 `<Compare>`）渲染成 HTML。feed 裡沒有 CSS 也沒有 JavaScript，滑桿會變成上下兩張圖加圖說，內容不會遺失。
- 18：圖說 `<ruby>` 的讀音（見上面）、Day 5「夜行巴士」那組的裁切。

### 未轉換標記

10 號負責的 `jetpack/image-compare`（72）與 `core/html`（8）全部處理掉。重跑轉換器後剩下的都屬於 09 號：

```text
core/gallery: 3 in 3 files
envira/envira-gallery: 83 in 10 files
```

## 09：相簿 `<Gallery>`（2026-10-24）

### 來源資料

- **Envira 相簿**：83 個，在 10 篇文章裡，共 509 張圖。ticket 指定圖片清單取自 block 的 JSON（`<!-- wp:envira/envira-gallery {…"images":[…]} -->`）；block 的 HTML 只有 `[envira-gallery id='…']` 這個 shortcode，線上網站其實是用相簿自己的 postmeta（`_eg_gallery_data`，PHP serialize）產生畫面。兩邊逐一比對過：83 個相簿的張數、順序、`src`、`title`、`alt` 完全一致，所以照 ticket 用 block JSON。
- 每張圖的 `title` 就是線上 lightbox 顯示的圖說（Envira 輸出成 `data-envira-caption`）。509 張**全部都有** `title`，而且都是站長寫的說明，沒有預設的檔名；`caption` 欄位全部是空的；`alt` 只有 acgn-museum-ssg 的 2 張有。相簿標題裡有 `&#8211;` 這種字元參照，一律解碼。
- Envira 的版面設定：`columns: "0"`（justified：依原圖比例排成等高的列）、列高 140／150／200px、間距 8px；acgn-museum-ssg 那一個是 `columns: "2"`。lightbox 是 base 主題，每個相簿各自一組（`rel="enviragallery572"`），可以左右切換。
- **Gutenberg 內建的 gallery block**：3 個，共 5 張圖：webpack 那篇（2 張，相簿下方有圖說）、前言（2 張 App 截圖，各自有圖說）、Day 1（1 張，相簿圖說含一個連結）。
- 合計 86 個相簿、514 張圖。

### 轉換器（`rules/gallery.ts`）

轉出來長這樣：

```mdx
import Gallery from '../../components/Gallery.astro';

<Gallery
	images={[
		{ src: import('../../assets/images/travel-setonaikai-2025-day2/20250421_081608666.jpg'), caption: '店家外面的照片' },
		{ src: import('../../assets/images/travel-setonaikai-2025-day2/20250421_081320309.jpg'), caption: '店家內部的照片，可以看到有 Summer Pockets 的週邊與繪圖' },
	]}
/>
```

- 圖片路徑用 06 號的 `imageSource()`，跟 Markdown 圖片一樣是相對於內容檔的路徑；共用的圖會指到它所在的那篇文章的資料夾。
- **為什麼用 `import('…')`，而不是檔案開頭的 `import x from '…'`**（10 號的滑桿是後者）：Day 7 有 175 張相簿圖，寫成頂端 import 會有一百多行 import，內文只剩 `image37` 這種名字，逐篇人工檢查時看不出是哪張圖。`src` 直接寫 `import('…')` 是 Astro 文件裡的寫法（`getImage()` 會自己 await），路徑就在圖說旁邊，路徑打錯一樣在建置時失敗，也不會跟 10 號的 `compare<n>Before` 撞名。
- `alt` 只在有寫、而且跟圖說不同時才寫出來；沒寫時元件用圖說當替代文字（線上 Envira 縮圖的 `alt` 是空的，只有 `title`）。
- core gallery：每張圖的 `alt` 與圖說取自裡面的 `core/image` block；整個相簿的圖說寫在 `<Gallery>` 標籤中間，是 Markdown，連結保留下來。
- 含相簿的文章全部是 `.mdx`（合併 10 號之後，這次新改成 MDX 的是 Day 1、Day 7、koebitai、acgn-museum-ssg、webpack 那篇）。
- **未轉換標記全部清空**：重跑轉換器後沒有任何 `wp-unconverted` 標記。`[envira-gallery]` shortcode 單獨出現在文字裡的情況備份裡沒有，那條規則維持輸出標記。`content.test.ts` 的「留給之後的 ticket」清單只剩一個例子（沒有規則處理的 `core/quote`），改名成「沒有規則處理的 block」。

### `<Gallery>` 元件（`src/components/Gallery.astro`）

- **排版**：照 Envira 的 justified 版面，只用 CSS，不需要 JS。每張圖是一個 flex 項目：`flex: <寬高比> 1 calc(<寬高比> × 列高)`，同一列的圖分配剩下的寬度時跟寬高比成正比，所以同一列的圖一樣高、剛好填滿欄寬，**不裁切**。最後一列用一個 `flex-grow: 1000` 的 `::after` 吃掉剩下的空間，不會把最後兩三張拉得很大（Envira 用的 justifiedGallery 預設也是最後一列不拉齊）。列高桌機 9rem、手機（40rem 以下）6.5rem。Envira 各相簿各自的列高與那個 `columns: "2"` 沒有沿用，全部用同一種版面。
- **縮圖**：每張用 Astro 的 `fixed` layout 做 1x、2x 兩種寬度（以 192px 高為準：最低列高 144px，再加上整列撐開的空間），不是原圖。
- **lightbox**：PhotoSwipe 5.4.4（`photoswipe`）。每個相簿一組，可用箭頭按鈕、滑動、方向鍵切換，Esc 關閉，可以放大。核心程式在點下第一張時才載入（`pswpModule: () => import('photoswipe')`），頁面一開始只載入很小的 lightbox 程式。按鈕的說明文字改成中文；圖說是 PhotoSwipe 的自訂 UI 元素（`.pswp__caption`），顯示在畫面下方。
- lightbox 的大圖是 `srcset`：1280px 寬一張（給手機）加上原圖寬度的 webp。**原圖寬度那張就是 06 號舊圖片網址的轉址目標**（`imageUrl()`），沒有多出一份全尺寸的檔案；沒有 JS 時，縮圖連結也是連到它。
- **JS 只在有相簿的頁面載入**：Astro 只把元件的 `<script>` 放進有用到這個元件的頁面；列表頁只顯示摘要，不渲染內文。PhotoSwipe 的 CSS 也只在這些頁面。
- 圖說只在 lightbox 裡顯示（跟 Envira 一樣），縮圖下方不顯示。core gallery 原本在頁面上就看得到的「每張圖的圖說」（前言的 2 張 App 截圖）現在也只在 lightbox 裡；整個相簿的圖說（Day 1、webpack 那篇）顯示在相簿下方。
- 建置結果：12 篇文章、86 個相簿、514 張縮圖，每個相簿的張數都跟備份一致（測試逐篇比對）。
- 截圖確認過桌機（1440px）與手機（390px）的相簿與 lightbox（不放進 repo）。

### 內文圖片的 `sizes`（06 號留下的問題）

- 06 號用 `image.layout: 'constrained'`，Astro 給的 `sizes` 是 `(min-width: 2560px) 2560px, 100vw`：螢幕比原圖窄時，瀏覽器以為圖片跟螢幕一樣寬，1920px 的桌機就下載 1920～2048px 寬的檔案，但內文欄最寬只有 728px。
- 改法：`src/lib/image-sizes.ts` 的 `CONTENT_IMAGE_SIZES` 照 `global.css` 的版面寫出主欄寬度：`(max-width: 40rem) calc(100vw - 2rem), (max-width: 64rem) calc(100vw - 6.5rem), (max-width: 72rem) calc(100vw - 26.5rem), 45.5rem`（手機的左右留白；平板的外距加留白；側欄旁邊的留白、間距與側欄；紙面最寬 72rem）。**版面改了要一起改**，檔案的註解有寫。
- 套用方式：一個 Sätteri 的 hast plugin（`contentImageSizes`，加在 `astro.config.mjs` 的 `satteri({ hastPlugins })`），在 Astro 處理圖片之前替 Markdown 的 `<img>` 加上 `sizes`。看過原始碼確認：使用者的 hast plugin 排在 Astro 的圖片處理之前；`.md` 的圖片屬性原封不動交給 `getImage()`，MDX 的變成 `<Image>` 的 props；`getImage()` 只在沒有 `sizes` 時才用預設值（`sizes ||= …`）。`sizes` 不算進檔名的 hash，所以轉址目標不變，也沒有多產生檔案。
- 10 號的滑桿原本自己寫 `(min-width: 64rem) 728px, 100vw`；合併後改成同一個常數（在 64rem 以下它會高估：平板 820px 寬時欄寬其實是 716px）。
- 效果：用建置結果的 `srcset` 與檔案大小、照 Chromium 的選圖規則，算全部 22 篇文章的 99 張內文圖一次載入的量：1920px 桌機 24.5 MB → 5.1 MB（少 79%）、1440px 桌機 18.7 MB → 5.1 MB（少 73%）、1280px 2x 筆電 32.0 MB → 12.5 MB（少 61%）、820px 2x 平板 18.7 MB → 12.5 MB（少 33%）；390px 3x 手機不變（本來就差不多是欄寬）。

### MDX 文章裡的 Markdown 圖片：同一張圖被做了兩份

- 改成 MDX 之後發現：MDX 裡的 Markdown 圖片由 Astro 的 `<Image>` 元件產生，它會自動加上 `fit: 'cover'` 與 `position: 'center'`，這兩個值會算進檔名的 hash。所以同一張圖在 `.mdx` 裡跟 `.md` 裡的檔名不同：每張內文圖多做一整套 webp（含全尺寸），而且**文章裡顯示的那張不是舊網址轉址過去的那張**（06 號的前提是兩者相同）。08 號的前言從那時就是這樣，10 號與這裡把另外 11 篇改成 MDX 後影響變大。
- 改法：`src/components/MarkdownImage.astro` 用跟 `.md` 一樣的方式呼叫 `getImage()`，文章頁用 `<Content components={{ img: MarkdownImage }} />` 交給 MDX。現在 `.md` 與 `.mdx` 的內文圖片檔名一致，轉址目標就是文章裡的那張；測試加了一篇 MDX 文章的檢查（改之前是失敗的）。
- 10 號的 `<Compare>` 直接用 `<Image>`，滑桿的圖一樣有 `fit`／`position`，所以滑桿顯示的檔案跟那兩張圖的轉址目標不同（轉址仍然正常，只是多一份檔案）。要不要統一留給 18 號或之後決定。

### 測試

- `tests/wordpress-converter/gallery.test.ts`：Envira block（取自備份的相簿 572 與 1877）轉成 `<Gallery>`：順序、圖說、`-scaled` 的檔名、`alt`；core gallery：每張的圖說與 `alt`、整個相簿的圖說（含連結）、共用圖指到前一篇的資料夾；輸出能編譯成 MDX。
- `tests/site-serving.test.ts`（共用同一次建置）：
  - 12 篇文章逐篇比對每個相簿的張數（期望值是備份裡的數字，共 514）；縮圖連到原圖寬度的 webp，也就是舊網址轉址的目標。
  - Playwright 點開 Day 2 的第一張：lightbox 顯示這張照片與圖說，方向鍵右／左切到下一張／上一張（圖說跟著變），Esc 關閉。
  - Day 2 載入的 JS 有 PhotoSwipe，〈Vue Router - Named Views〉沒有。
  - 縮圖：1440px 1x 與 390px 3x 載入的檔案寬度在顯示寬度的 0.6～2 倍之間（不是 2560px 的原圖）。
  - 內文圖片：06 號模擬選圖的測試改成在 Chromium 裡實際載入，6 種螢幕（1920、1440 的 1x；1280、820、360 的 2x；390 的 3x）載入的檔案寬度都在實際顯示寬度的 0.8～1.25 倍之間（或已經是最大／最小的那張）。改之前 1920px 與 1440px 會載入 1280px 寬的原圖。
  - 舊網址轉到「文章裡顯示的那張圖」：原本的 `.md` 文章，再加一篇 `.mdx`（Day 2）。
  - 用瀏覽器的測試逾時設成 60 秒（vitest 預設 5 秒，機器忙的時候不夠）。

### 建置

- 每張相簿圖多 3 個 webp：縮圖 1x、2x 共 1,028 個，lightbox 的 1280px 版 501 個（13 張原圖本來就不到 1280px 寬），合計 1,529 個；全尺寸那張是 06 號已經有的。建置輸出現在有 3,753 個 webp，離 Cloudflare 每次部署 20,000 個檔案的上限還很遠。
- 時間：這台機器（16 執行緒）第一次產生這約 1,500 個檔案多花約 2 分半，之後從 `node_modules/.astro` 快取拿。04 號的 CI 更需要快取這個資料夾。`tests/site-serving.test.ts` 建置的逾時（600 秒）沒有改，完全沒有快取時要留意。

### 留給其他 issue 的發現

- 12：全文 RSS 若用 `render()` 渲染 MDX，記得傳 `components={{ img: MarkdownImage }}`，否則內文圖又會多做一份。feed 裡沒有 JS，相簿會是一串連到大圖的縮圖。
- 13：Envira 的 463 張圖只有 `/?attachment_id=ID`（06 號記錄的），這次沒動。
- 18：人工檢查時看一下相簿的版面與圖說位置；前言 2 張 App 截圖的圖說從頁面上移到 lightbox 裡。
- 04：見上面的建置時間。

## 16：搜尋、相關文章、分享按鈕與 giscus 留言（2026-10-24）

### 搜尋：Pagefind

- `pagefind` 1.5.2（npm），放在 `dependencies`（建置時要用）。npm 套件依平台另外裝 `@pagefind/<平台>`，Windows 版裡只有 `pagefind_extended.exe`：**extended 版才會斷中文詞**，npm 預設就是它。`package-lock.json` 列了所有平台，CI 的 Linux 也裝得到；沒有 install script，npm 11 的封鎖不影響。
- 建索引寫成 Astro 整合 `src/integrations/pagefind.ts`：在 `astro:build:done` 用 Pagefind 的 Node API（`createIndex` → `addDirectory` → `writeFiles`）把索引寫到 `/pagefind/`。不在 npm script 裡另外跑 CLI，是因為測試的建置（`tests/support/build-site.mjs` 直接呼叫 Astro 的 `build()`）也要有索引。放在 `redirectsBudget()` 前面（它要維持最後一個）。
- 語言：`forceLanguage: 'zh-TW'`，全站一個繁中索引（`pagefind-entry.json` 的語言是 `zh-TW`）。不設的話 Pagefind 讀 `<html lang="zh-TW">`，結果一樣（只是寫成小寫 `zh-tw`）。Pagefind 對中文不做詞幹處理，只斷詞。
- **只索引內文**：文章與頁面的 `<article>` 加 `data-pagefind-body`。沒加時 Pagefind 索引每頁的整個 `<body>`：119 頁全部進索引，首頁、分頁、分類、標籤、日期彙整都因為列出文章標題與摘要而被搜到，而且每筆結果的摘要開頭都是「跳到主要內容 TsukiStudio 生活點滴紀錄…」。加了之後是 27 頁（22 篇文章＋5 個頁面）。分享、相關文章、留言都放在 `<article>` 外面，所以也不在索引裡（不然每篇文章都會因為相關文章裡的標題被搜到）。
- 中文斷詞實測：「電磁筆」只出現在〈電子紙閱讀器使用心得〉內文的句子中間，搜得到而且排第一；後面還會列出 Day 1、Day 2，因為 Pagefind 也比對詞的開頭（「筆記型電腦」「筆直」）。
- 搜尋框用 Pagefind 1.5 的 Component UI（`<pagefind-searchbox>`；舊的 `pagefind-ui.js` 官方已列為 legacy），放在側欄最上面、15 號預留的位置，標題「搜尋」（`src/components/Search.astro`）。邊打字邊在下拉選單顯示結果（標題＋摘要，關鍵字用網站的螢光筆色）。顏色、字型、圓角用 `--pf-*` 變數接上 `global.css` 的色票。
  - 介面文字依 `<html lang>` 用 Pagefind 內建的繁中翻譯（「找不到 X 的相關結果」等），不用自己翻。例外是下拉選單底部的鍵盤提示（navigate／select／close）：不管索引語言寫大寫或小寫都是英文，所以用 `show-keyboard-hints="false"` 拿掉；Ctrl+K 快捷鍵的標示也拿掉（`hide-shortcut`）。
  - 載入時機（實測）：每頁只載入 `pagefind-component-ui.js`（175 KB，gzip 39 KB）與 CSS（gzip 7 KB）；搜尋引擎、wasm（gzip 68 KB）與索引中繼資料等點進搜尋框才載入，索引分塊與內容片段在搜尋時才載入。
  - 索引只在建置時產生，`astro dev` 底下搜尋框沒有作用，要看效果用 `npm run preview`。沒有 JavaScript 時搜尋框不會出現。WordPress 的 `/?s=` 搜尋網址不沿用（不在 sitemap 裡，也沒有其他 issue 要求）。

### 分享按鈕

- 純連結（`src/components/ShareLinks.astro`），頁面上沒有任何平台的 script 或 iframe，點下去才在新分頁打開該平台自己的分享頁。平台、順序與標題「分享此文」都照線上 Jetpack 的分享按鈕：

  | 平台 | 網址 | 帶的參數 |
  | --- | --- | --- |
  | Threads | `https://www.threads.com/intent/post` | `url`、`text`（標題） |
  | Facebook | `https://www.facebook.com/sharer/sharer.php` | `u` |
  | X | `https://x.com/intent/tweet` | `url`、`text` |
  | Mastodon | `https://share.joinmastodon.org/#text=…` | 標題＋網址 |
  | LinkedIn | `https://www.linkedin.com/sharing/share-offsite/` | `url` |
  | Reddit | `https://www.reddit.com/submit` | `url`、`title` |
  | Tumblr | `https://www.tumblr.com/widgets/share/tool` | `posttype=link`、`canonicalUrl`、`content`、`title` |
  | Pinterest | `https://www.pinterest.com/pin/create/button/` | `url`、`description`、有自訂社群圖片時加 `media` |
  | Telegram | `https://t.me/share/url` | `url`、`text` |
  | WhatsApp | `https://wa.me/` | `text`（標題＋網址） |

- 網址參數依各平台官方文件（Threads、X、Tumblr 的 web intent 文件；Mastodon 官方分享頁的原始碼）。分享的網址是文章的正式網址（canonical，中文 slug 是大寫百分比編碼）。
- **Mastodon** 沒有中央的分享網址，Jetpack 是跳出視窗問讀者的站台（要 JavaScript）。改用 Mastodon 官方的分享頁 `share.joinmastodon.org`：它會問讀者在哪個站台再轉過去；內容放在 `#text=` 片段裡，不會送到它的伺服器。
- **Pinterest** 要一張圖。有 AIOSEO 自訂社群圖片的 11 篇帶 `media`（圖片的 webp 網址）；其他文章不帶，Pinterest 那邊的行為沒辦法在本機確認。
- 驗證：每個分享網址都用 curl／headless Chrome 打開過，都有回應（Threads、X、LinkedIn、Tumblr 轉到登入頁；Facebook 用 curl 是 400，用瀏覽器是 200）。實際發文需要各平台帳號，沒有測。

### 相關文章

- 建置時計算（`src/lib/related-posts.ts`），每篇 3 篇（跟 Jetpack 一樣）：共同標籤多的優先；一樣多時共同分類多的優先；再一樣就新的優先。Jetpack 的相關文章是 WordPress.com 伺服器上的內容分析，無法重現，所以照 spec 用標籤。
- 共同標籤不夠 3 篇時，用同分類的文章補，例如〈第一篇文章〉的標籤 `murmur` 沒有其他文章用，就列出「閒聊」的另外 3 篇。
- 顯示標題與發布日期，三欄卡片（窄螢幕變一欄），標題「相關文章」（Jetpack 寫「相關」）。

### giscus 留言

- `src/components/Comments.astro`，只放在文章（頁面沒有留言區）。設定：

  | 屬性 | 值 |
  | --- | --- |
  | `data-repo` | `erase2004/blog` |
  | `data-repo-id` | `R_kgDOVVonIg` |
  | `data-category` | `Comments` |
  | `data-category-id` | `DIC_kwDOVVonIs4DJfJF` |
  | `data-mapping` | `specific` |
  | `data-term` | 文章路徑去掉開頭的 `/`，例如 `2021/11/30/電子紙閱讀器使用心得/` |
  | `data-strict` | `1` |
  | `data-lang` | `zh-TW` |
  | `data-theme` | `light`（網站沒有深色模式） |
  | `data-loading` | `lazy` |

  另外 `data-reactions-enabled="1"`、`data-input-position="bottom"`。repo ID 與分類 ID 用 giscus 的 API（`/api/discussions/categories?repo=erase2004/blog`）核對過。
- **對應方式（跟 issue 寫法的差異）**：issue 寫「依網址 pathname 對應 discussion」。giscus 的 `pathname` 模式取的是瀏覽器的 `location.pathname`，中文 slug 會是百分比編碼，而且編碼的大小寫跟著讀者請求的網址走：WordPress 的 canonical 與 Google 索引的都是小寫編碼，如果正式站對小寫編碼的網址直接回 200（01 號在本機看到的是 307 轉到大寫，正式站要到 19 號才確認），同一篇文章就會對應到兩個 discussion。所以改用 `specific`，在建置時把路徑寫進 `data-term`：一樣是「依路徑對應」，但不受編碼影響，GitHub 上 discussion 的標題也是看得懂的中文。
- `data-strict="1"`：giscus 用 term 的 SHA-1 找 discussion，不靠 GitHub 的標題模糊搜尋（不嚴格時 giscus 直接取搜尋結果的第一筆，Day 1～Day 8 的路徑只差一個字元，容易對錯）。
- 沒有 JavaScript 時顯示「留言區需要 JavaScript。」
- **本機驗證**：在本機建置的文章頁打開 giscus（允許外部請求）：iframe 載入 `giscus.app/zh-TW/widget`，介面是中文（「0 個反應」「0 則留言」「用 GitHub 登入」），找 discussion 的 API 回 404，就是「這篇還沒有 discussion」的正常情況。**實際發表留言與回覆沒有測**：要用 GitHub 帳號登入，而且 discussion 在第一則留言時才建立；上線（或預覽網址）後要實測。

### 測試

`tests/site-serving.test.ts`：

- `search`：用 Chromium 打開建置結果的首頁。索引部分直接呼叫 Pagefind 的 JS API：索引語言是 zh-TW；「電磁筆」第一筆是電子紙那篇；「遊記」剛好找到 9 篇遊記，沒有任何列表頁或其他文章（驗證只索引內文）。搜尋框部分：在側欄的搜尋框輸入「電磁筆」會列出那篇；找不到時顯示中文訊息，而且框裡沒有英文字。
- `after a post`：分享連結（電子紙那篇的 10 個連結，逐一比對平台網址與參數；沒有 script、iframe；有社群圖片的文章 Pinterest 帶的 `media` 是 aniya.moe 上存在的 webp）；giscus 的設定；相關文章（Day 3：Day 4、Day 2、Day 5；〈第一篇文章〉：閒聊的另外 3 篇）。期望值是照各篇的標籤與分類手算的。
- `layout`：8 種頁面的側欄第一個區塊都是搜尋框。
- 踩到的坑：傳給 Playwright `page.evaluate()` 的函式會先經過 Vitest（Vite）轉換，裡面的 `import()` 被改成 `__vite_ssr_dynamic_import__`，送到瀏覽器就是 ReferenceError；改用 `new Function('return import("/pagefind/pagefind.js")')()`。
- 一開始的「只有文章」測試用搜尋框檢查，結果拿掉 `data-pagefind-body` 也會過：搜尋框只顯示前幾筆，文章排在列表頁前面。改用 Pagefind 的 API 拿全部結果才抓得到。

### 留給其他 issue 的發現

- 17：404 頁透過 `BaseLayout` 已經有側欄的搜尋框。若主欄也要一個，第二個 `<pagefind-searchbox>` 要給不同的 `instance`，否則兩個框共用同一組狀態。404 頁沒有 `data-pagefind-body`，不會被搜到。
- 04：索引在 `astro build` 裡產生，CI 不用多一個步驟。搜尋與手機寬度的測試都需要 Playwright 的 Chromium（15 號已記）。
- 14：Pinterest 的 `media` 目前只用自訂社群圖片；14 號做好 og:image 的備援（文章第一張圖 → `night.png`）後，把同一張圖傳給 `ShareLinks` 的 `image`。14 號若決定社群圖片不用 webp，這裡也一起改。
- 19：在預覽網址用 GitHub 帳號實際留言、回覆，確認 discussion 建在 `Comments` 分類、標題是中文路徑。giscus 建議用「Announcement」格式的分類（只有維護者和 giscus 能開新 discussion），站長可以到 repo 的 Discussions 設定確認 `Comments` 的格式。可以再加 `giscus.json` 限制只有 `aniya.moe`（與預覽網址）能嵌入留言，這次沒加（repo 還沒推送，預覽網址的網域也還不確定）。

## 22：回到頂部按鈕（2026-10-24）

站長核可 15 號版型時追加的需求。

### 行為

- 共用版型（`src/layouts/BaseLayout.astro`）在側欄之後、頁尾之前放 `src/components/BackToTop.astro`，所以每一頁都有，Tab 順序上排在側欄最後一個連結之後。
- 往下捲超過一個畫面高度（`scrollY > innerHeight`）才出現；回到這個高度以內就隱藏。用 `hidden` 屬性切換，隱藏時不會被 Tab 到，螢幕閱讀器也讀不到。
- 點擊後平滑捲回頂部；系統設定 `prefers-reduced-motion: reduce` 時直接跳回（`behavior: 'instant'`）。
- **鍵盤焦點**：點下去的同時把焦點移到 `<body>`（暫時加 `tabindex="-1"`，離開時拿掉，`preventScroll` 不打斷平滑捲動），下一個 Tab 就是頁面開頭的「跳到主要內容」。Chromium 在按鈕隱藏時本來就會把焦點丟回 `<body>`，但這個「focus fixup」各瀏覽器的實作不一致（有的會把焦點留在已經隱藏的按鈕上；這裡只在 Chromium 驗證過），所以不能依賴；測試檢查的是「頁面開始捲動的那一刻，焦點已經不在按鈕上」。
- 沒有 JS 時不顯示：HTML 裡的按鈕本來就帶 `hidden`，由 JS 拿掉。JS 是 Astro 內嵌的一段 module script，壓縮後 497 bytes（gzip 316 bytes），不依賴任何框架。

### 外觀

- 真正的 `<button type="button" aria-label="回到頂部">`，箭頭是 `aria-hidden` 的 SVG。直徑 44px（WCAG 2.5.5 的觸控目標大小），固定在畫面右下角距邊 1rem。
- 沿用 15 號的配色：底色是外框色 `#1a1a1a`、白色箭頭，對比 17.4:1。寬螢幕上按鈕落在紙面旁的深色外框上，所以加一圈淡白色細框和陰影讓它看得出輪廓。滑過時底色換成連結藍 `#007acc`（白箭頭 4.6:1）。
- focus 樣式：3px 的 `#007acc` 外框、間隔 3px。對白色紙面 4.6:1、對深色外框 3.8:1，都超過 WCAG 對 focus 指示的 3:1。被按鈕移過去焦點的 `<body>` 不畫 focus 外框（不然整頁會框一圈藍線）。
- 列印時不印。

### 手機寬度不遮住內容

- 捲到頁尾時，按鈕下面沒有任何文字或連結：頁尾右側原本的 Mastodon 連結改成隱藏（見下面），頁尾只剩左邊的版權文字。
- 捲動途中，浮動按鈕難免會暫時蓋住它右下角的一小塊內文（截圖裡就是這樣），再捲一點就露出來，這是所有浮動按鈕的特性。
- **用 Tab 移動時不會被按鈕蓋住**（WCAG 2.2 的 2.4.11）：瀏覽器把獲得焦點的元素捲進畫面時，會貼著畫面底邊停下，剛好停在按鈕底下。實測在 320px 寬 Tab 過整篇文章，有 5 個標籤雲連結被蓋住。在 `html` 加 `scroll-padding-bottom: 4.25rem`（按鈕高度加上距離），瀏覽器就會把它們停在按鈕上方。這條規則寫在元件的 `<style>` 裡（`:global(html)`），拿掉元件就跟著拿掉。
- 16 號的留言區（giscus）在文章最後面，手機上後面還有整個側欄，所以捲到底時不會在按鈕底下；捲動途中的情況同上。

### 頁尾的 Mastodon 連結改成隱藏

- 站長決定：15 號放在頁尾、看得到的 `<a rel="me" href="https://g0v.social/@erase2004">Mastodon</a>` 改回 WordPress 時的做法，留在 HTML 裡但不顯示。加上 `hidden` 屬性：不顯示、不能 Tab 到、螢幕閱讀器不讀；Mastodon 驗證個人檔案連結時是解析 HTML 找 `rel="me"`，不受影響。頁尾已經沒有看得到的連結，連結的樣式也一起拿掉。15 號的頁尾測試改成檢查這個連結有 `rel="me"` 而且帶 `hidden`。這是獨立的 commit（`fix: hide the Mastodon rel=me link`）。

### 測試

`tests/site-serving.test.ts` 的 `layout`：

- 8 種頁面都有一個 `type="button"`、名稱是「回到頂部」的按鈕。
- `the 回到頂部 button`：用 Playwright（Chromium）開一篇長文章：
  - 在頂端與往下捲半個畫面時看不到，捲過 1.5 個畫面看得到，捲回頂端又看不到。以無障礙名稱找按鈕（`getByRole('button', { name: '回到頂部' })`），名稱也一起驗證。
  - 關掉 JS 時捲到下面也看不到。
  - 位置在右下角、至少 44px，底色 `rgb(26, 26, 26)`、箭頭 `rgb(255, 255, 255)`，對比用 WCAG 公式算，至少 4.5:1。
  - 從側欄最後一個連結按 Tab 會到按鈕；focus 外框是實線、至少 2px，對白色與 `#1a1a1a` 都至少 3:1；按 Enter 會回到頂端。
  - 點擊後的捲動過程有中間位置（平滑）；`reducedMotion: 'reduce'` 時只有一次捲動事件、直接到 0。
  - 用鍵盤按下後，頁面開始捲動時焦點已經在 `<body>`；回到頂端後按 Tab 是「跳到主要內容」。
  - 320px 寬：捲到最底時按鈕下沒有文字或連結、沒有水平捲動；從頁首一路 Tab 到按鈕，沒有任何獲得焦點的元素被按鈕蓋住。
- **Headless Chromium 預設不做平滑捲動**（`behavior: 'smooth'` 會直接跳過去），這組測試的瀏覽器要加 `--enable-smooth-scrolling` 才測得出平滑捲動。另外關掉 JS 的頁面不會執行 `requestAnimationFrame` 與 timer，那個測試只能用同步的 `evaluate`。
- 確認過測試抓得到問題：把 Mastodon 連結的 `hidden` 暫時拿掉，「捲到最底時按鈕下沒有文字」就失敗並列出 `Mastodon`；拿掉 `scroll-padding-bottom` 時 Tab 測試列出那 5 個標籤連結。

### 外觀確認

手機（375px）與桌機（1366px）各一張文章頁捲到中段、按鈕出現的截圖交給站長（不放進 repo）。

## 14：SEO head 與 GA4（2026-10-24）

### 先抓下 WordPress 的 head

- 對 sitemap 快照裡的 88 個頁面（首頁、22 篇文章、5 個頁面、3 個分類、57 個標籤）逐一抓線上網站的 HTML（2026-10-24），把 `<title>`、meta description、og:type、og:image、`article:published_time`／`modified_time` 存成 `tests/fixtures/wordpress-head-2026-10-24/heads.json`。WordPress 下線後就拿不到，所以跟 sitemap 快照一樣提交進 repo、不再改。測試直接拿它比對。
- 另外看過的頁面（不在 sitemap，沒存）：`/page/2/`、`/2025/05/`、`/2025/05/17/`、404 頁。

### 標題

- 格式照 AIOSEO：`<標題> - TsukiStudio`、首頁 `TsukiStudio - 生活點滴紀錄`、彙整頁是 11 號做的（`5 月, 2025 - TsukiStudio`、`… - Page 2`）。
- **WordPress 會把標題裡前後有空白的 `-` 換成 en dash `–`**（`wptexturize`）：資料庫裡是 `遊記 - 岡山 / 香川 / 德島八日遊 - Day 4`，線上顯示 `遊記 – 岡山 / 香川 / 德島八日遊 – Day 4 - TsukiStudio`（最後的 ` - TsukiStudio` 是 AIOSEO 的分隔符，不轉）。共 12 篇（9 篇遊記、2 篇 Vue Router、〈專案開發遇到的問題整理 – 2022/05/05〉）。
  - frontmatter 照原樣不改，在輸出時轉：`src/lib/content.ts` 的 `displayTitle()`。用在 `<title>`、og:title、JSON-LD 的 headline 與麵包屑、文章與頁面的 h1、列表頁的標題、相關文章（16 號）與分享連結的標題（16 號）。WordPress 在這些地方也都是 en dash，所以整站一致。
  - 只做了「前後有空白的 `-`」這一條。`wptexturize` 還會換引號、`--`、`...` 等，目前的標題都用不到，就沒做。
- **issue 的「1 篇有 AIOSEO 自訂標題的文章」不適用**：05 號就發現 post 352 的 AIOSEO `title` 欄位是 `#post_title #separator_sa #site_title`，就是預設的格式，輸出跟其他文章一樣。沒有真正的自訂標題。

### 逐篇比對的結果

建置結果與線上 WordPress 的 head 比對（88 頁）：

| 項目 | 結果 |
| --- | --- |
| `<title>` | 88／88 相同 |
| meta description | WordPress 有的 28 頁（首頁、5 個頁面、22 篇文章）全部相同。分類、標籤彙整頁 WordPress 沒有 description，新的是 11 號寫的 |
| canonical | 88／88 指向同一個網址（解碼後比對；WordPress 用小寫百分比編碼，新的是大寫，見下面「留給其他 issue」） |
| `article:published_time` | 22 篇文章全部相同 |
| `article:modified_time` | 19 篇相同；3 篇排程發布的遊記（前言、Day 1、Day 7）刻意改成發布時間，見下面 |
| og:image | 11 篇有自訂社群圖片的：同一張圖；8 篇原本是 `night.png` 的改成文章第一張圖（spec 的決定）；其餘（3 篇沒有圖的文章、頁面、首頁）仍是 `night.png` |

### Open Graph 與其他 meta

| 標籤 | 內容 |
| --- | --- |
| `og:type` | 文章、頁面 `article`（同 WordPress），其他 `website` |
| `og:url` | 等於 canonical |
| `og:site_name` | `TsukiStudio - 生活點滴紀錄`（同 WordPress） |
| `og:locale` | `zh_TW`；`<html lang="zh-TW">` 15 號就有了 |
| `article:published_time` | 文章的發布時間 |
| `article:modified_time` | 文章用 `postUpdated()`（發布與更新取較晚的，跟頁面上顯示的最後更新一致）；頁面用 `updated` |
| `article:tag` | 文章的每個標籤名稱 |
| `fediverse:creator` | `@erase2004@g0v.social`，每頁都有（同 WordPress） |
| `author` | `Tsuki`，文章與頁面 |
| `robots` | 一頁一個：預設 `max-image-preview:large`；首頁與彙整的第 2 頁以後 `noindex, nofollow, max-image-preview:large`；404 頁 `noindex`。都跟 AIOSEO 一樣。原本 11 號、404 頁各自在 head slot 加的 robots 標籤改成 `BaseLayout` 的 `robots` |
| `twitter:card` | `summary`（同 WordPress）。標題、描述、圖片 X 會用 Open Graph 的，不另外輸出 `twitter:*` |

跟 WordPress 不一樣的地方：

- **排程發布的 3 篇遊記**：WordPress 的 `article:modified_time` 比發布時間早（前一晚改完、隔天早上自動發布）。照協調者的決定改用 `postUpdated()`，JSON-LD 的 `dateModified` 也一樣。
- **頁面沒有 `article:published_time`**：WordPress 的頁面有，但 spec 的頁面 frontmatter 沒有發布時間，就不輸出（`modified_time` 5 頁都相同）。要補的話得在轉換器與 schema 加 `published`。
- **`article:tag`**：WordPress 只有 1 篇（post 419，AIOSEO 手動填的 `og_article_tags`，輸出時變小寫 `next.js`），其他文章沒有。新的是每篇都輸出自己的標籤（419 那篇的值相同，只是大小寫照標籤名稱）。
- **`author`**：WordPress 只在文章輸出，新的頁面也有。
- 彙整頁（分類、標籤、日期、分頁）在 WordPress 上完全沒有 Open Graph，新的跟其他頁一樣都有，og:image 是 `night.png`。
- 沒有沿用：`og:image:secure_url`（og:image 本來就是 https）、`twitter:title`／`description`／`image`、AIOSEO 與 WordPress 的 `generator`、`rel="profile"`／`pingback`、oEmbed 與 `wp-json` 的 `<link>`、dns-prefetch。

### og:image

- 依序 fallback（`src/lib/seo.ts` 的 `socialImage()`）：frontmatter 的 `socialImage`（AIOSEO 的自訂社群圖片）→ 文章第一張圖 → `src/assets/images/site/night.png`。頁面、首頁、彙整頁直接用 `night.png`。
- **「第一張圖」**：`src/lib/images.ts` 的 `firstImage()` 在文章原始檔（Markdown／MDX）裡找第一個指向統一圖片目錄的相對路徑，Markdown 圖片、`<img>`、09 號相簿的 `import('…')` 都算。MDX 檔開頭的 `import` 也算，所以如果一篇 MDX 先用了 `<Compare>`（它的圖在檔案開頭 import）、後面才有 Markdown 圖片，會取到對照滑桿的圖，不一定是讀者看到的第一張。目前用到 `<Compare>` 的文章都有自訂社群圖片，不受影響；測試對 WordPress 上是 `night.png` 的 11 篇逐一確認 og:image 就是頁面上第一個 `<img>` 的同一張圖（沒有圖的 3 篇是 `night.png`）。
- **格式與大小**：不用 webp（照協調者的決定，社群平台不一定支援），JPEG，PNG 原圖維持 PNG（截圖、透明背景），寬度最多 1200px（Facebook 與 X 顯示預覽的寬度），由 Astro 的 `getImage()` 產生（`socialImageFile()`）。`night.png` 是原本的 512×512。同時輸出 `og:image:type`、`og:image:width`、`og:image:height`。
- 共多出 20 個檔案、約 6 MB。最大的是 acgn-museum-ssg 的 `heroimage.png`：1200×800 的 PNG 有 2.4 MB（原圖是插畫風的 PNG）。在 Facebook（8 MB）與 X（5 MB）的上限內（WordPress 原本給的是 1536px 的原圖），就沒有特別處理；18 號檢查時若想縮小，可以把那張圖改存成 JPEG。
- 16 號的分享按鈕裡 Pinterest 的 `media` 改成同一張圖（原本只有自訂社群圖片的 11 篇有，而且是 webp）。

### 結構化資料（JSON-LD）

每頁一個 `<script type="application/ld+json">`，一個 `@graph`（`structuredData()`）：

- `WebSite`（每頁）：站名、標語、`zh-TW`，publisher 指向 Person。
- `Person`（每頁）：`Tsuki`，`url` 是 `/about/`（WordPress 的作者頁 `/author/erase2004/` 轉到那裡），`sameAs` 是 Mastodon 帳號。
- `BreadcrumbList`（首頁以外）：`首頁` → 文章的第一個分類 → 文章；`首頁` → 關於我 → 聯絡方式；`首頁` → 彙整頁。
- `BlogPosting`（文章）：headline、description、url、image（＝og:image）、datePublished、dateModified（`postUpdated()`）、author／publisher、articleSection（分類）、keywords（標籤）。

跟 AIOSEO 不一樣的地方：沒有 `Organization`（個人網站，publisher 用 Person）、`WebPage`／`CollectionPage`；麵包屑第一層叫「首頁」不是「Home」；日期彙整的麵包屑是一層（`2025 年 5 月`），AIOSEO 是年、月兩層；BlogPosting 的 image 跟 og:image 同一張（AIOSEO 是內文第一張圖，跟 og:image 不一定一樣）；Person 沒有 Gravatar 頭像。JSON 裡的 `<` 寫成 `<`，標題或描述裡的文字不會提早結束 `<script>`。

### GA4

- 直接嵌入 Google 的 gtag.js 程式碼，屬性 `G-NWNYVH87N4`（`src/consts.ts` 的 `GA4_MEASUREMENT_ID`），每頁都有。`gtag()` 是全域函式，17 號的 404 事件可以直接呼叫 `gtag('event', …)`。
- **只在正式建置（`import.meta.env.PROD`）輸出**，`astro dev` 沒有：站長在本機寫文章、預覽時不會被算成造訪。預覽網址的部署是正式建置，會送資料到同一個屬性；要排除的話在 GA4 用主機名稱篩選。
- MonsterInsights 額外做的（`link_attribution`、`forceSSL`、退出追蹤的 cookie、舊 analytics.js 的相容層）沒有沿用。Jetpack Stats、MonsterInsights 本身照 spec 不搬。
- **踩到的坑**：測試用 Vitest 跑，Vitest 會把自己的 `import.meta.env` 放進環境變數（`NODE_ENV`、`MODE` 是 `test`，`PROD` 是空字串，`DEV` 是 `1`），`tests/support/build-site.mjs` 啟動的建置程序繼承之後，Astro 把它們當成網站的設定，結果測試建出來的網站 `PROD` 是 false、GA 不見。`build-site.mjs` 現在先刪掉這些變數，測試的建置跟 `astro build` 一樣（這也影響 `draft: true` 的文章：以前測試建置會包含草稿，現在跟正式建置一樣排除；目前沒有草稿）。

### 網站圖示

- WordPress 的網站圖示是 `cropped-night.png`（512px），WordPress 另外產生了幾個尺寸。把它實際提供的檔案從備份的 uploads（只讀）複製到 `public/`，換成慣用的檔名：

  | 用途 | WordPress | 新的 |
  | --- | --- | --- |
  | `<link rel="icon" sizes="32x32">` | `cropped-night-32x32.png` | `/favicon-32x32.png` |
  | `<link rel="icon" sizes="192x192">` | `cropped-night-192x192.png` | `/favicon-192x192.png` |
  | `<link rel="apple-touch-icon">` | `cropped-night-180x180.png` | `/apple-touch-icon.png`（iOS 預設會找這個路徑） |
  | `<meta name="msapplication-TileImage">` | `cropped-night-270x270.png` | `/mstile-270x270.png` |
  | `/favicon.ico` | 302 到 32px 的 PNG | 32px 的 PNG 包成 ICO（ICO 格式可以直接放 PNG 資料，6 bytes 檔頭＋16 bytes 目錄＋PNG），用一次性的小腳本產生 |

- `/favicon.ico` 留著是因為不看 `<link>` 的程式（不少 RSS 閱讀器、舊瀏覽器）會直接找它。原本 `public/` 裡的 `favicon.ico` 與 `favicon.svg` 是 Astro 範本的 Astro 標誌，已換掉／刪掉。
- 舊網址 `/wp-content/uploads/2021/09/cropped-night*.png` 照 06 號的對應表維持 404（`-WxH` 縮圖不轉址；原圖沒有被內容引用）。

### 網址檢查

`scripts/url-checker/check.ts` 的 head 抽驗（每個預期是頁面的網址都會跑）新增兩項：

- **標題格式**：`<名稱> - TsukiStudio` 或 `TsukiStudio - 生活點滴紀錄`，後面可以接 ` - Page N`（`settings.ts` 的 `TITLE_FORMAT`）。
- **og:image**：要有，要是 `https://aniya.moe` 上的完整網址，副檔名是 JPEG 或 PNG，而且對檢查的目標（建置結果或預覽網址）請求那個路徑回 200。

待完成清單沒有變（全部通過，沒有新增）。

### 測試

- `tests/url-checker/check-urls.test.ts`：建置結果與 HTTP 兩種模式都測：三種正確的標題格式通過、格式不對的失敗；沒有 og:image、og:image 回 404、是 webp、不是完整網址的各自失敗。
- `tests/site-serving.test.ts` 的 `SEO head`：
  - sitemap 快照的 88 頁標題全部等於 WordPress 的；WordPress 有 description 的 28 頁全部相同。
  - 22 篇文章的 `og:type` 與發布、更新時間等於 WordPress 的（排程的 3 篇是發布時間）；5 個頁面的更新時間。
  - 標籤與作者；8 種頁面的語言、`og:locale`、`og:site_name`、`fediverse:creator`；`twitter:card`；每種頁面只有一個 robots 標籤、內容跟 AIOSEO 一樣。
  - og:image：自訂社群圖片、第一張圖（含 WordPress 上是 `night.png` 的 11 篇逐一比對）、PNG 維持 PNG、沒有圖的頁面是 `night.png`；實際下載圖片用 sharp 讀尺寸，確認宣告的 type、寬高與檔案一致、寬度不超過 1200。比對「是不是同一張圖」用 Astro 檔名裡來源檔的 hash（`<名稱>.<來源 hash>_<尺寸格式 hash>.<格式>`）。
  - JSON-LD：WebSite 與 Person、文章的 BlogPosting、文章／頁面／標籤彙整的麵包屑、首頁與頁面沒有 BlogPosting。
  - GA4：用 Chromium 打開 7 種頁面（外部請求攔下來回空的 script），確認每頁都向 gtag.js 送出 `config G-NWNYVH87N4`，而且請求了 gtag.js。
  - 網站圖示：4 種頁面的圖示連結都存在、回 200、是該尺寸的 PNG；`/favicon.ico` 是 32×32 的 ICO（Workers 給的 Content-Type 是 `image/vnd.microsoft.icon`）。
- 16 號的 Pinterest 測試改成「`media` 等於 og:image」（自訂社群圖片、第一張圖、`night.png` 三種文章各一篇）。

### 留給其他 issue 的發現

- 12：feed 的文章標題也用 `displayTitle()`（WordPress 的 feed 標題同樣經過 `wptexturize`，是 en dash）。feed 的 `<link rel="alternate">` 加在 `src/components/BaseHead.astro`，它現在依序是：全站 meta 與圖示、canonical、title／description／robots、作者、Open Graph、X、JSON-LD、GA4。sitemap 的圖片網址照 06 號用 `imageUrl()`，跟 og:image 不同檔沒關係。
- 17：`gtag()` 是全域的，404 事件直接 `gtag('event', '…', { page_location: location.href })`；dev 底下沒有 GA，呼叫前要確認 `typeof gtag === 'function'`。404 頁現在有 `canonical` 指向 `https://aniya.moe/404/`（`Astro.url` 是 `/404/`），WordPress 的 404 頁沒有 canonical，17 號可以考慮拿掉（`BaseHead` 目前沒有這個選項）。404 頁的 robots 用 `BaseLayout` 的 `robots="noindex"`。
- 18：`heroimage.png` 的 og:image 有 2.4 MB；標題的 en dash 只在輸出時轉，frontmatter 仍是 ` - `。
- 19：canonical、og:url、JSON-LD 裡的中文網址是大寫百分比編碼，WordPress 是小寫（Google 已索引的是小寫）。兩者是同一個網址，但小寫的請求在本機會先 307 到大寫，跟 01、03 號記的是同一個問題，在預覽網址確認。og:image 是 `https://aniya.moe/_astro/…`，**切換 DNS 之前在預覽網址用 Facebook 分享偵錯工具之類的工具看不到圖**（指向的正式網域還是 WordPress）；切換後再用 Facebook 的分享偵錯工具重新抓幾篇，確認卡片的圖。
- 20／21：GA4 屬性沿用，切換後在 GA4 的即時報表確認有資料進來；預覽網址的造訪也會進同一個屬性。

## 12：Feed、sitemap、robots.txt、llms.txt（2026-10-24）

### 產生的檔案

| 網址 | 來源 | Content-Type |
|---|---|---|
| `/feed/` | `src/pages/feed/index.html.ts` → `src/lib/feeds.ts` 的 `rssFeed()` | `application/rss+xml; charset=utf-8` |
| `/feed/atom/` | `src/pages/feed/atom/index.html.ts` → `atomFeed()` | `application/atom+xml; charset=utf-8` |
| `/sitemap.xml` | `src/pages/sitemap.xml.ts` → `src/lib/sitemap.ts` | 依副檔名（`application/xml`） |
| `/robots.txt` | `src/pages/robots.txt.ts` | 依副檔名（`text/plain`） |
| `/llms.txt` | `src/pages/llms.txt.ts` | 依副檔名（`text/plain`） |

- **feed 為什麼寫成 `index.html`**：Workers static assets 只會用 `<路徑>/index.html` 回應有結尾斜線的網址，沒有辦法讓 `/feed/` 對應到 `feed.xml`（`_redirects` 的 200 改寫，網址檢查與 Workers 都不支援）。所以 endpoint 檔名取成 `index.html.ts`，輸出 `dist/feed/index.html`，再用 `public/_headers` 把這兩個網址的 Content-Type 改成 RSS／Atom。看過 asset worker 的原始碼（`attachCustomHeaders()` 用 `headers.set()`），`_headers` 會蓋掉依副檔名決定的 Content-Type；`wrangler dev` 實測也是。正式環境在 19 號的預覽網址再確認一次。
- 跟 WordPress 一樣（2026-10-24 對照線上網站）：feed 回 `X-Robots-Tag: noindex, follow`（也寫在 `_headers`）；`/feed`、`/feed/atom` 301 到有斜線的網址。後者原本會是 `html_handling` 的 307：endpoint 不在 Astro 交給 `astro:build:done` 的頁面清單裡，所以把 01 號的 `trailing-slash-redirects.ts` 改成直接掃建置結果裡所有 `<路徑>/index.html`。補斜線規則 117 → 119 條，`_redirects` 共 1,776 條靜態規則。

### 全文 feed

- 最新 10 篇（WordPress 的 `posts_per_rss`），全文。用 Astro 的 container API（`experimental_AstroContainer`）在建置時把文章的 `Content` 渲染成 HTML：MDX 要載入 MDX 的 container renderer，而且要跟文章頁一樣傳 `components: { img: MarkdownImage }`（09 號的發現），不然 feed 裡的圖會是另一組檔案。測試逐篇比對 feed 與文章頁的文字和圖片檔案。
- `src/lib/feed-html.ts` 的 `feedHtml()` 把渲染結果整理成閱讀器能直接顯示的 HTML（閱讀器不跑網站的 JS、不載入網站的 CSS，常常一頁顯示好幾篇）：
  - 拿掉 `<script>`、`<style>`、`<link>`、`<button>`、`<template>`（Expressive Code 在第一個程式碼區塊放了 CSS 與 JS，還有複製按鈕）。
  - 拿掉所有 `data-*` 屬性（PhotoSwipe、Astro 的 scoped CSS 用的，占 feed 大小的四分之一）與 `style` 屬性（只是在設網站 CSS 的變數，例如相簿的 `--ratio`、程式碼的顏色）。
  - 自訂元素（web component，例如 10 號的 `<img-comparison-slider>`）沒有 JS 就沒有作用，換成它裡面的內容：對照滑桿變成上下兩張圖加圖說。相簿是一串連到原圖寬度 webp 的縮圖。YouTube 是連到影片的縮圖。
  - 所有連結與圖片網址（`href`、`src`、`srcset`、`poster`）改成絕對網址。**腳註連結也是**：`#user-content-fn-1` 變成 `https://aniya.moe/<文章網址>#user-content-fn-1`，連到文章頁上的那個腳註。WordPress 的腳註是只有 `#…` 的連結，但閱讀器解析這種連結的方式不一（RSS 沒有 base URL，有的用 feed 網址、有的用文章網址、有的不處理），W3C Feed Validator 也會警告；連到文章頁的絕對網址在每個閱讀器都有效。代價是有支援「同一篇內跳轉」的閱讀器，現在會開到網站上。
  - 所有 `id` 加上每篇不同的前綴（`post-<文章 ID 的 SHA-256 前 8 碼>-`，中文 slug 也只用 ASCII），`aria-describedby` 跟著改。08 號記錄的問題：每篇的腳註都叫 `user-content-fn-1`，閱讀器把好幾篇放在同一頁時 ID 會重複；現在 10 篇之間沒有重複的 ID。
  - node-html-parser 改寫屬性時不會跳脫 `&`，網址裡的 `&` 要自己寫成 `&amp;`（不然 validator 會說是壞掉的 entity）。
- **保留 WordPress 的 GUID**：RSS 的 `<guid isPermaLink="false">` 與 Atom 的 `<id>` 都是 `https://aniya.moe/?p=<文章 ID>`，跟 WordPress 一樣。閱讀器靠這個判斷是不是新文章，換掉的話訂閱者會看到 10 篇「新」文章。之後新寫、沒有 `wordpressId` 的文章用文章網址。
- 標題用 14 號的 `displayTitle()`：WordPress 的 feed 標題也經過 `wptexturize`，` - ` 是 en dash（`遊記 – 岡山 / 香川 / 德島八日遊 – Day 8`）。`llms.txt` 的標題也是（AIOSEO 的 `llms.txt` 用的是原本的 ` - `，這裡跟頁面上顯示的一致）。
- 其他欄位照 WordPress：`pubDate`（`Fri, 23 Jan 2026 10:00:00 +0000` 格式）、`dc:creator`（Tsuki）、分類與標籤名稱（`<category>`，先分類後標籤）、`lastBuildDate`／Atom 的 `<updated>` 是所有文章裡最後一次更新的時間、`language` zh-TW、`atom:link rel="self"`；Atom 的作者 `uri` 是 `/about/`、`content` 有 `xml:base`。`<description>`／`<summary>` 用 meta description（WordPress 是內文開頭加「閱讀全文」）。
- 沒有照搬的：連結上 MonsterInsights 加的 `utm_*` 參數（spec 排除 MonsterInsights）、留言相關的 `<comments>`、`wfw:commentRss`、`slash:comments`、`thr:` 連結（沒有舊留言，留言改用 giscus）、`sy:update*`、`generator`，以及頻道圖示（網站圖示還沒搬，14 號）。
- 大小：RSS 約 569 KB、Atom 約 570 KB（WordPress 的 RSS 是 308 KB：它的 Envira 相簿在 feed 裡只放第一張圖）。
- **驗證**：建置結果直接貼給 W3C Feed Validator（`validator.w3.org/feed/check.cgi`，`rawdata`），RSS 與 Atom 都是 valid、0 個錯誤，唯一的警告是 `SelfDoesntMatchLocation`（貼原始內容驗證時 `rel="self"` 本來就對不上，部署後用網址驗證就不會有）。

### sitemap

- 一份 `urlset`，不再是 sitemap index：首頁、22 篇文章、5 個頁面、3 個分類、57 個標籤，共 88 個網址，跟 WordPress 的 5 個子 sitemap 加起來完全相同；不列日期彙整與分頁。網址用 `new URL()` 的大寫百分比編碼，跟 canonical 一樣（WordPress 的 sitemap 是未編碼的 UTF-8）。
- `lastmod`：文章是 `postUpdated()`、頁面是 `updated`；首頁、分類、標籤是裡面最後更新的那篇（WordPress 的分類與標籤寫 1970-01-01）。不寫 `changefreq`、`priority`（Google 不看）。
- **圖片**：`src/lib/images.ts` 的 `imagesIn(entry)` 從文章原始檔找出它引用的圖片：Markdown 圖片、MDX 的 `import` 與 `import()`（09 號相簿的寫法）都是相對於檔案的 `../../assets/images/<slug>/<檔名>`，解析到統一圖片目錄裡真的有的檔案（程式碼區塊裡剛好出現的路徑不算）。網址用 `imageUrl()`，就是舊圖片網址轉址過去的那張。不從渲染結果找，是因為相簿顯示的是縮圖，對不回原圖。
- 跟快照比對（測試把快照的每個舊圖片網址照 `_redirects` 轉成新網址，逐頁比對）：**771 筆，WordPress 是 772 筆**，每篇文章的圖片完全一致（包括同時列在兩篇的 11 張）。少的那 1 筆是前言的 `highlight.jpg`：它是前言的精選圖片（全站唯一的 `_thumbnail_id`），Twenty Sixteen 會把精選圖片顯示在文章上方，AIOSEO 因此列進 sitemap；新版型不顯示精選圖片，它現在只是前言的 `socialImage`（og:image），所以不列。其他 AIOSEO 自訂社群圖片本來就不在 WordPress 的 sitemap 裡（例如 ACGN 那篇的 `heroimage.png`）。舊網址照樣轉到新圖片。

### robots.txt 與 llms.txt

- `robots.txt`：`User-agent: *`、`Allow: /`、`Sitemap: https://aniya.moe/sitemap.xml`。WordPress 的 `Disallow: /wp-admin/` 與 `Allow: /wp-admin/admin-ajax.php` 拿掉（那些網址現在本來就是 404）。
- `llms.txt`：WordPress 上其實有一份（AIOSEO 每天產生，2026-10-24 在線上網站看到：`# TsukiStudio`、標語、Sitemaps、文章 22、頁面 5、分類 3、標籤 57）。新的照 llmstxt.org 的格式：H1 站名、`>` 標語、`## Sitemaps`、`## 文章`、`## 頁面`、`## 分類`、`## 標籤`，每項是 `- [標題](網址): 說明`（文章與頁面附 meta description）。因為是舊網站就有的網址，轉換器加了 `url-map/llms-txt.ts`，對應表多一筆 `/llms.txt` → `file`，網址檢查會檢查它。

### head 裡的 feed 連結

- `src/components/FeedLinks.astro`：RSS（標題沿用 WordPress 的「訂閱《TsukiStudio》» 資訊提供」）與 Atom 的 `<link rel="alternate">`。放在 `BaseLayout.astro` 的 `<BaseHead>` 後面一行，沒有動 `BaseHead.astro`（14 號平行在改）。WordPress 另外有留言 feed 的連結，留言 feed 已經不存在（13 號轉址），不放。

### 待完成清單

`/feed/`、`/feed/atom/`、`/sitemap.xml`、`/robots.txt` 通過，從清單移除：156 筆 → 152 筆（空行照 06 號的做法留著）。新加的 `/llms.txt` 直接通過，沒有進清單。

### 測試

- `tests/site-serving.test.ts`（共用同一次建置）：
  - `feeds`：RSS 2.0 與 Atom 的 Content-Type、頻道資訊、最新 10 篇與順序、WordPress 的 GUID／日期／分類（期望值取自 2026-10-24 線上的 feed）；每篇全文的文字與文章頁相同、圖片檔案與文章頁相同；所有網址都是絕對網址而且站內的都回 200；10 篇之間沒有重複的 ID，腳註連結連到文章頁上存在的腳註；沒有 script／style／link／button 與 `data-*`；Atom 的內文與 RSS 相同；`X-Robots-Tag` 與無斜線 301；七種頁面的 head 都有兩個 feed 連結。
  - 只有測試建置才有的 `/converted/feed-item/`（`tests/fixtures/converted-feed-item.ts`）：把轉換器的 MDX fixture 照 feed 的方式渲染，確認 YouTube、程式碼區塊、腳註、對照滑桿在 feed 裡是純 HTML。
  - `sitemap`：網址跟快照的 88 個相同、沒有日期彙整與分頁；每頁的圖片等於快照的圖片轉址後的新網址（扣掉前言的精選圖片）。
  - `robots.txt`、`llms.txt`：內容與每個連結都回 200。
- `tests/feed-html.test.ts`：網站文章還沒有、但要處理的寫法：自訂元素換成內容、網址裡的 `&`、inline style。
- `tests/wordpress-converter/convert-wordpress.test.ts`：對應表有 `/llms.txt`。
- 套件：`node-html-parser` 從 devDependencies 移到 dependencies（建置網站時要用）；新增 devDependency `fast-xml-parser`（測試用獨立的 XML parser 解析 feed 與 sitemap，也檢查是不是 well-formed）。

### 留給其他 issue 的發現

- 13：`/feed`、`/feed/atom` 的無斜線 301 已經有了。單篇、分類、標籤、頁面的 `…/feed/` 動態規則與 `/comments/feed/`、子 sitemap 的轉址還是 13 號的；`_redirects` 現在 1,776 條靜態規則，剩 224 條空間。
- 14（已合併）：14 號的 `firstImage()` 跟這裡的 `imagesIn()` 用同一種方法找原始檔裡的圖片，合併後 `firstImage()` 改成取 `imagesIn()` 的第一張，只留一份比對規則（採用 14 號較嚴格的寫法：相對路徑、要有圖片副檔名、先 `decodeURI`）；差別只在原始檔提到不存在的圖片時，現在是跳過而不是建置失敗。feed 的頻道圖示（WordPress 用 `cropped-night-32x32.png`）還沒加，網站圖示 14 號已經搬好，之後可以補。作者名稱「Tsuki」寫在 `src/lib/feeds.ts`。14 號建議把 feed 連結放進 `BaseHead.astro`；這裡放在 `BaseLayout.astro` 裡緊接著 `<BaseHead>` 的那一行，輸出位置一樣（`BaseHead` 只有 `BaseLayout` 在用），就沒有再搬。
- 18：頁面的 meta description 有幾個是截斷的內文（例如 `/about/` 是「我的故事 聯絡方式」），也原樣出現在 `llms.txt`。
- 19：在預覽網址確認 `_headers` 的 Content-Type 與 `X-Robots-Tag`，並用網址（不是貼內容）再跑一次 W3C Feed Validator。

## 17：404 頁面（2026-10-24）

### 頁面內容

- `src/pages/404.astro`，建成 `dist/404.html`。Workers static assets（`not_found_handling: "404-page"`）對每個沒有檔案的網址回這一頁，HTTP 404。
- 共用版型本來就有的：頁首的導覽列（6 個連結）、側欄（搜尋、分類、年份、標籤）、回到頂部按鈕。
- 主欄：標題「找不到頁面」、一句說明、搜尋框（標題「搜尋文章」）、最新 5 篇文章（標題＋發布日期，新到舊；取 `getPosts()` 的前 5 篇，跟首頁一樣不含草稿）、「回到首頁」連結。
- **主欄自己的搜尋框**：手機上側欄排在主欄下面，要捲過整個主欄才看得到側欄的搜尋框，所以主欄另外放一個。`src/components/Search.astro` 新增 `instance` 屬性，404 頁的框是 `instance="not-found"`，側欄的是 Pagefind 預設的 `default`。同一個 instance 的框共用查詢和結果，不分開的話在一個框打字，兩個框都會跳出結果。外層是 `role="search"` 的 `<section>`，用各自的標題跟側欄的搜尋區塊區分。
- `noindex` 沿用 14 號的設定；WordPress 的 404 頁也是 `noindex`。
- 標題維持「找不到頁面 - TsukiStudio」。WordPress 是「找不到符合條件的頁面 – TsukiStudio」，但新站全站都是 ` - TsukiStudio`，而且 404 頁不會被索引，標題不影響 SEO。

### 沒有 canonical

- WordPress 的 404 頁沒有 canonical，也沒有任何 `og:` 標籤（2026-10-24 請求一個不存在的網址確認，回 404）。
- 14 號時 404 頁的 canonical 是 `https://aniya.moe/404/`（建置時的 `Astro.url` 是 `/404/`），但這一頁是回給所有不存在的網址的，說它的正式網址是 `/404/` 不對。`BaseHead`／`BaseLayout` 新增 `canonical` 屬性（預設 `true`），404 頁傳 `canonical={false}`：不輸出 `<link rel="canonical">` 與 `og:url`。其他 `og:` 標籤與 JSON-LD（WebSite、Person）保留。

### `/404/` 也回 404

- 01 號記下的問題：`html_handling: "force-trailing-slash"` 把 `X.html` 當成 `/X/` 這一頁，所以 `404.html` 在 `/404/` 也是一頁，回 HTTP **200**（`/404`、`/404.html` 則 307 到 `/404/`）。等於多一份 404 頁的副本，回 200 的錯誤頁正是 spec 要避免的 soft 404；`noindex` 只是最低限度的保護。
- Workers 的設定沒有辦法排除它：`not_found_handling` 一定找 `404.html` 這個檔名，用 `.assetsignore` 排除的話 404 頁也一起沒了；`_redirects` 也不能指定 404 狀態碼（只有 200、301、302、303、307、308）。
- 做法：`_redirects` 的 **proxy（200）規則**。`_redirects` 比 `html_handling` 先套用；狀態碼 200 的規則不轉址，而是改用另一個路徑去找檔案。`src/integrations/not-found-page.ts` 加一條 `/404/ /404/no-such-page/ 200`：`/404/no-such-page/` 沒有檔案，於是照 `not_found_handling` 回 `404.html`、HTTP 404，跟其他不存在的網址一樣。
  - 流程對照過 wrangler 內建的 asset worker 原始碼（`node_modules/miniflare/dist/src/workers/assets/assets.worker.js` 的 `handleRedirects`、`getResponseOrAssetIntent`），`wrangler dev` 實測：`/404/` 直接回 404 與 404 頁；`/404`、`/404.html` 先 307 到 `/404/`，最後也是 404。
  - 純靜態檔案的請求，不經過 Worker（13 號的 Worker 只在首頁執行），不佔免費額度。多一條 static 規則：跟 12 號合併後 `_redirects` 是 1,777 條 static、0 條 dynamic。
  - **19 號要在預覽網址確認**：官方文件（developers.cloudflare.com/workers/static-assets/redirects/，2026-10-24 讀）列出 Workers static assets 的 `_redirects` 支援 Proxying（200，只能指向同一個網站的相對路徑），不支援的是其他狀態碼的改寫（例如 `404`）；但本機的 workerd 可能跟正式環境不同。12 號日誌說「`_redirects` 的 200 改寫，網址檢查與 Workers 都不支援」，照文件 Workers 是支援的，網址檢查的建置模式現在也支援；12 號 feed 的做法不受影響。網址檢查的預期清單有 `/404/`（見下面），在預覽網址跑 HTTP 模式就會檢查到。

### GA4

- **只在 aniya.moe 上送資料**（新決定）：14 號是正式建置就載入 gtag.js，所以預覽網址的部署（也是正式建置）和本機的 `npm run preview` 也會送資料進同一個 GA4 屬性。現在 `src/components/BaseHead.astro` 的 GA 程式碼先檢查 `location.hostname === 'aniya.moe'`（主機名稱取自 `astro.config.mjs` 的 `site`），符合才定義 `gtag()`、送 `js` 與 `config`、插入 gtag.js 的 `<script async>`；其他主機什麼都不做，`gtag` 也不存在。`astro dev` 仍然沒有這段程式碼（`import.meta.env.PROD`）。14 號說的「預覽網址的造訪也會進同一個屬性，要排除就在 GA4 用主機名稱篩選」已經不成立。
- gtag.js 原本寫在 HTML 的 `<script async src>`，現在由這段程式碼插入，一樣是 async 載入，只是瀏覽器的 preload scanner 不會提早下載它。
- **404 事件**（`src/pages/404.astro` 裡的一段內嵌 script）：
  - 事件名稱 **`page_not_found`**。
  - 參數：**`page_location`** 是被請求的完整網址（`location.href`，含查詢字串，中文是百分比編碼）；**`page_referrer`** 是連過來的頁面（`document.referrer`，有才送；直接輸入網址或從書籤開就沒有）。站內連結壞掉時 referrer 是完整網址，可以直接找到是哪一篇的連結；從其他網站連過來時，瀏覽器預設（`strict-origin-when-cross-origin`）只給網域，例如 `https://www.google.com/`。
  - 只在 `typeof gtag === 'function'` 時送，所以只有 aniya.moe 上會送，其他主機上不會出錯。
  - 為什麼用 GA4 內建的參數名稱，不自訂（例如 `requested_path`）：自訂參數的值最多 100 個字元，而且 GA 以**編碼後的網址長度**計算，一個中文字算 9 個字元（`%E9%9B%BB`），中文 slug 的網址很容易超過；內建的 `page_location` 上限 1,000、`page_referrer` 上限 420。自訂參數還要先在 GA4 註冊成自訂維度才能在報表用，而且只對註冊之後收到的資料有效；內建參數對應的維度直接就能用。（限制見 GA4 說明「Collection and configuration limits」，support.google.com/analytics/answer/9267744，2026-10-24 讀。）
- **21 號在 GA4 怎麼看**（以下用英文介面的名稱，中文介面是對應的翻譯）：
  - Reports → Engagement → Events → `page_not_found`：每天的次數。
  - 哪些網址：Explore → Free form，維度加 `Page path + query string`（或完整網址 `Page location`）與 `Page referrer`，指標 `Event count`，篩選 `Event name` 完全符合 `page_not_found`。表格裡的網址就是要補轉址規則的舊網址；referrer 是站內頁面的話，順便修那篇的連結。
  - 剛切換時用 Realtime 報表或 DebugView 確認事件有進來。

### 網址檢查

- 預期 `not-found` 的網址，現在除了 HTTP 404，內容也要是 404 頁：`<title>` 是「找不到頁面 - TsukiStudio」（`scripts/url-checker/settings.ts` 的 `NOT_FOUND_PAGE_TITLE`），而且 robots 有 `noindex`。不是的話報 `expected the 404 page, titled "…"; got "…"` 或 `the 404 page is not noindex`。spec 的「不存在的網址回 404，而且內容是 404 頁」就是這一項。對應表的 109 個 `not-found` 網址都通過（2 個帶查詢字串的 `/?p=1887`、`/?page_id=1887` 在建置模式跳過，HTTP 模式仍在待完成清單上，等 13 號）。
- 建置模式支援 `_redirects` 的 proxy（200）規則（以前遇到就丟錯）：照 asset worker 的做法，換成規則指定的路徑再套 `html_handling` 找檔案，找不到就照 `not_found_handling` 回 404 頁。指向其他網站的 proxy 規則 wrangler 會略過，這裡也略過。
- 預期清單多一筆 `/404/` → `not-found`（`NOT_FOUND_PAGE_URL`，跟原本的 `/url-checker/no-such-page/` 一樣是網址檢查自己加的），所以預覽網址與正式網域的檢查也會確認 `/404/` 不是一個回 200 的頁面。
- 待完成清單沒有變。

### 測試

- `tests/url-checker/check-urls.test.ts`（建置與 HTTP 兩種模式）：回 404 而且是 404 頁才通過；fixture 在子資料夾另外放 `404.html`（Workers 用路徑往上最近的 `404.html`），分別測標題不對與沒有 `noindex` 會失敗；proxy 規則指向存在的頁面時回 200、指向不存在的路徑時回 404 頁。
- `tests/url-checker/expected-urls.test.ts`：預期 404 的是 `/url-checker/no-such-page/` 與 `/404/`。
- `tests/site-serving.test.ts`：
  - `unknown URLs`：`/404/`、`/404`、`/404.html` 最後都是 HTTP 404，內容是 `dist/404.html`。
  - `the 404 page`：最新 5 篇的標題、網址與順序（對照 frontmatter 寫死的值）；只有一個回首頁的連結；用 Playwright 在主欄的搜尋框打「電磁筆」，第一筆是〈電子紙閱讀器使用心得〉，側欄的搜尋框維持空白、沒有結果。
  - `SEO head`：兩個不存在的網址都沒有 canonical 與 `og:url`。
  - `SEO head` › `GA4`：Playwright 把 `https://aniya.moe` 的請求交給本機的 `wrangler dev` 回答（`route.fetch`），頁面就像在 aniya.moe 上執行：
    - 7 種頁面都送 `config G-NWNYVH87N4`、請求 gtag.js（14 號原本的測試，改成在 aniya.moe 上跑）。
    - 在預覽網址（`https://aniya-moe.example.workers.dev`）與本機網址上，首頁、文章、404 頁都沒有 `dataLayer`、沒有請求 Google 的網域、沒有 JS 錯誤（少了 `typeof gtag` 的檢查，404 頁在這裡會丟 `ReferenceError`）。
    - 404 頁送一個 `page_not_found`：中文網址加查詢字串、從文章連過來，`page_location` 與 `page_referrer` 都對；直接開的沒有 `page_referrer`；文章頁不送。
  - 原有的測試已經涵蓋：8 種頁面（含 404 頁）的導覽列與側欄搜尋框、404 頁的 robots 是 `noindex`、手機 320px 寬不會水平捲動。
- 桌機 1280px、手機 375px 與主欄搜尋框有結果時的截圖自己看過，沒有交給站長、不放進 repo。

### 留給其他 issue 的發現

- 13：Worker 對找不到的 `?p=ID`／`?page_id=ID` 要回 404 頁的內容與 HTTP 404，網址檢查現在會比對標題與 `noindex`（例如向 `env.ASSETS` 要一個不存在的路徑，拿到的應該就是 404 頁和 404；要實測）。新增的 dynamic `_redirects` 規則照舊放在所有 static 規則之後，包括 `/404/` 這一條。
- 19：在預覽網址確認 `/404/` 回 404（網址檢查 HTTP 模式）、404 頁的兩個搜尋框都能用。預覽網址上 GA4 不會送資料，GA 的即時報表看不到預覽網址的造訪，這是預期的。
- 20／21：切換後在 aniya.moe 開一個不存在的網址，在 GA4 的 Realtime 或 DebugView 確認 `page_not_found` 有進來；之後每週照上面的 Explore 設定看 404 網址。

## 13：其餘舊網址轉址與查詢字串 Worker（2026-10-24）

### 轉址一覽

| 舊網址 | 新網站的回應 | 由誰回答 |
|---|---|---|
| `/?p=ID`、`/?page_id=ID`（27 篇文章與頁面） | 301 到該文章或頁面 | Worker |
| `/?attachment_id=ID`（826 個附件） | 搬過的圖片 301 到原尺寸的新圖片；影片與 PDF 301 到 R2；沒搬的孤兒圖回 404 頁 | Worker |
| WordPress 沒發過的 ID（`/?p=1887` 等三種） | 404 頁、HTTP 404 | Worker |
| `/author/erase2004/` | 301 到 `/about/` | 靜態規則 |
| `/wp-sitemap.xml` 與 AIOSEO 的 5 個子 sitemap | 301 到 `/sitemap.xml` | 靜態規則 |
| `/comments/feed/` | 301 到 `/feed/` | 靜態規則 |
| 舊 slug `/2026/01/23/從-ssr-到-ssg：acgn-股市歷史博物館-7-萬頁靜態化的實戰轉型/` | 301 到 `/2026/01/23/acgn-museum-ssg/` | 靜態規則 |
| 文章、頁面、分類、標籤的 `…/feed/`（87 個） | 301 到該頁本身 | 1 條動態規則 |
| `/wp-admin/`、`/wp-login.php`、`/xmlrpc.php`、`/wp-json/` | 404 頁 | 原本就是（沒有檔案） |

### Worker

- `src/worker.ts`，`wrangler.jsonc` 加上 `main`、`assets.binding: "ASSETS"` 與 `assets.run_worker_first: ["/"]`。
- **只在首頁網址執行**：`run_worker_first` 用陣列（static routing）指定 `/`，比對的是路徑，所以 `/` 帶任何查詢字串都會進 Worker，其他路徑一律是免費的靜態檔案請求。看過 router worker 與 asset worker 的原始碼（miniflare 內建的 `router.worker.js`、`assets.worker.js`）才知道陣列形式是必要的：有 Worker 但沒有 static routing 時，asset worker 判斷「能不能回答」會把 `not_found_handling` 當成 `none`，**所有找不到檔案、也沒有 `_redirects` 規則的網址（錯字網址、`/wp-admin/` 等）都會進 Worker**、算進每天 10 萬次的免費額度；用了 static routing 才保留 `404-page`，由 asset worker 自己回 404 頁。測試實際驗證過（見下面「測試」）。
- **`?p=`／`?page_id=`**：用對應表 `content` 段的 WordPress ID 查網址。`Location` 是完整網址、用請求本身的網域（在預覽網址上也會轉到預覽網址；WordPress 送的是 `https://aniya.moe/…`），中文路徑是大寫百分比編碼。
- **`?attachment_id=`**：新圖片的網址帶 hash，建置之後才知道，Worker 程式裡沒有。所以 Worker 用對應表（`images`、`unusedImages`、`media` 段）查出附件在 WordPress 上的檔案網址（`/wp-content/uploads/…`），向 `env.ASSETS` 要那個網址（`redirect: 'manual'`），原樣回傳：`_redirects` 已經有舊檔案網址 → 新圖片／R2 的規則，所以是一次 301 直接到原尺寸的新圖片（相簿連結的那張）或 R2；孤兒圖的舊檔案網址沒有規則，就是 404 頁。Worker 不需要建置時產生的資料，跟 `_redirects` 也不會對不上。Envira 相簿的 463 張照片只有這種附件頁網址，現在也都有轉址。
- **找不到的 ID**：向 `env.ASSETS` 要 `/404/`（17 號的 proxy 規則讓它本身就回 404），再把狀態碼設成 404 回傳，內容就是 `dist/404.html`，跟其他不存在的網址一樣（17 號的網址檢查會比對標題與 `noindex`）。`?p=` 有值但查不到、或不是數字，都算找不到。
- 首頁沒有這三個參數時（包括 `?utm_source=…` 之類），照舊交給靜態檔案。WordPress 的搜尋網址 `/?s=…` 現在也是首頁（不在 spec 範圍）。
- 對應表用 named import（`import { content, images, media, unusedImages } from './data/old-url-map.json'`），esbuild 會把用不到的 `urls` 段丟掉：`wrangler deploy --dry-run` 的 Worker 是 223 KiB（gzip 20 KiB）。

### 對應表

- 每個附件都加上 `/?attachment_id=ID`（WordPress 會把它轉到附件頁，附件頁再轉到檔案）：搬過的 769 張是 `redirect`（不寫 `location`，跟附件頁一樣，轉到回 200 的站內網址就算通過）、影片與 PDF 9 個是 `redirect` 到 R2、沒搬的 48 張是 `not-found`，再加一個沒發過的 `/?attachment_id=1887`，共 827 筆。寫在 `url-map/images.ts`、`url-map/media.ts`、`url-map/query-ids.ts`。
- `url-map/sitemaps.ts` 加上 AIOSEO 的子 sitemap（`addl`、`post`、`page`、`category`、`post_tag`，取自 sitemap 快照的索引）與 `/sitemap.xml` 本身。以前只在快照的預期清單裡；spec 說轉址規則只從對應表產生，所以寫進對應表。
- 對應表共 2,865 個網址（原本 2,032）。

### `_redirects`

- `src/integrations/old-url-redirects.ts`：對應表裡所有「`redirect` 到站內固定網址、沒有查詢字串」的網址，各寫一條靜態規則（作者頁、comments feed、`/wp-sitemap.xml` 與 5 個子 sitemap、舊 slug，共 9 條）；`<網址>feed/` → `<網址>` 的 87 個 feed 不寫靜態規則，改用一條動態規則 `/*/feed/ /:splat/ 301`，寫在最後。`/feed/` 本身不符合（`*` 前後要有兩個 `/`），`/feed/atom/` 也不符合。之後對應表多了轉到站內網址的舊網址，規則會自動產生。
- 放在 astro.config.mjs 裡所有寫靜態規則的 integration（包括 17 號的 `notFoundPage()`）之後、`redirectsBudget()` 之前：Cloudflare 把第一條動態規則之後的規則都當成動態規則算，順序錯了建置會因為超過 100 條動態規則而失敗。
- 動態規則的副作用：任何 `<路徑>/feed/` 都會 301 到 `<路徑>/`，那頁不存在的話接著是 404（WordPress 是直接 404）。日期彙整的 feed（`/2025/05/feed/`）、作者頁的 feed 也因此轉到有意義的頁面。
- 目前 `_redirects`：**1,786 條靜態規則、1 條動態規則**（上限 2,000／100），靜態規則剩 214 條空間。

### 改過日期的文章

ticket 寫「1 個舊 slug 與 3 篇改過日期的文章」，但備份裡的 3 筆 `_wp_old_date` 都不是已發布的文章：2 筆是 post 48（選單項目），1 筆是 post 655（Envira 相簿「在高松市區亂逛」）。05 號就發現了。所以只有 1 條舊 slug 規則，沒有舊日期規則；`url-map/old-slugs.ts` 照樣會處理舊日期，只是這份備份沒有。

### 網址檢查與待完成清單

- 待完成清單 152 筆 → **0 筆**（56 個 `?p=`／`?page_id=`、9 個靜態規則、87 個 feed），只剩檔頭的註解。沒有只能在正式網域檢查的項目（`www` 轉址不在預期清單裡，20 號在正式網域另外確認）。
- 建置模式：1,985 個通過，883 個帶查詢字串的網址跳過。HTTP 模式（`wrangler dev`）：連同 883 個查詢字串網址全部通過。

### 測試

- `tests/site-serving.test.ts`：
  - `WordPress query-string URLs`：`?p=`／`?page_id=` 轉到的網址（期望值取自 WordPress 的 ID，例如 30 是〈第一篇文章〉、86 是 `/about/`），而且在測試伺服器的網域上；沒發過的 ID 回 404 與 `dist/404.html`；`?attachment_id=639`（Day 2 相簿的照片）轉到 Day 2 頁面上相簿連結的那張原尺寸圖片、影片轉到 R2、孤兒圖與沒發過的 ID 回 404 頁；`/` 與 `/?utm_source=…` 是首頁。
  - `the Worker`：用 `tests/fixtures/marking-worker.ts`（自己回答所有請求、加一個 header）取代網站的 Worker，搭配真正的 `wrangler.jsonc` 跑第二個 `wrangler dev`（`tests/support/wrangler-dev.ts` 多了 `script` 參數，對應 `wrangler dev <script>`）：`/` 加各種查詢字串會進 Worker；頁面、無斜線網址、`/index.html`、feed、sitemap、favicon、`_redirects` 的靜態與動態規則、不存在的網址、`/404/`、子路徑帶 `?p=` 都不會。拿掉 `run_worker_first` 試過，有 10 個測試失敗（`/` 不進 Worker，不存在的網址反而進 Worker；當時 feed 與作者頁還沒有規則，也是不存在的網址），確認測試抓得到。
  - `the URL checker`：建置與 HTTP 兩種模式，待完成清單是空的。
- `tests/wordpress-converter/convert-wordpress.test.ts`、`media.test.ts`：`?attachment_id=` 的預期（搬過、孤兒、沒發過的 ID、影片與 PDF 到 R2），AIOSEO 的子 sitemap。

### 留給其他 issue 的發現

- 04：`wrangler deploy` 現在會打包 `src/worker.ts`（它讀的是 repo 裡的對應表，不是 `dist`）；部署後的 HTTP 網址檢查會一起檢查 Worker。
- 19：在預覽網址跑 HTTP 模式的網址檢查（883 個查詢字串網址），並確認正式環境的 `run_worker_first` 一樣只讓 `/` 進 Worker（Workers 的指標裡請求數應該只跟首頁的請求數相當）；動態規則對百分比編碼中文路徑（大寫與小寫）的比對也一起看。
- 21：Worker 的請求數只來自首頁網址；如果接近每天 10 萬次的免費額度，要看是不是被大量打首頁。GA4 的 404 事件會記到 `/?p=…` 這類找不到的 ID。

## Code review 修正

2026-10-25，修正 code review 的 15 項發現，一項一個 commit。標題後面的數字是 review 的編號。

### 對照滑桿的圖片就是舊網址轉過去的檔案（1）

- `<Compare>` 原本用 Astro 的 `<Image>`。設定了 `image.layout: 'constrained'` 時，`<Image>` 會加上 `fit` 與 `position`，檔名的 hash 就跟著變：151 張滑桿圖片都另外做了一份，跟舊網址 301 過去的原寬 webp 不是同一個檔案（例如 Day 2 的 `ydmk705`：頁面上是 `…_13v1WJ.webp`，舊網址轉到 `…_Z1pdkmM.webp`），sitemap 列的則是頁面上沒有用到的檔案。09 號記過這個問題。
- 改成跟 `MarkdownImage.astro` 一樣用 `getImage()`。151 張圖的原寬檔案現在就是轉址目標；`dist/_astro/` 少了 946 個、多了 795 個檔案（`fit`／`position` 那一份換成跟 Markdown 圖片一樣的各種寬度）。
- 新測試（`tests/site/converted-content.test.ts`）：每張滑桿圖片 `srcset` 裡最寬的就是它的 `src`，而且是某個舊網址的轉址目標。原本的測試只比對 Markdown 圖片。

### og:image 取讀者看到的第一張圖（4）

- `firstImage()` 取原始檔裡出現的第一個圖片路徑。MDX 把滑桿的圖片 import 在檔案最前面，而且依名稱排序（`compare1After` 在 `compare1Before` 前面），所以文章的第一張圖是滑桿時，取到的會是分隔線右邊那張。
- 現在依閱讀順序：import 的圖片算在元件用到它的位置（`before={compare1Before}`），Markdown 圖片與相簿的 `import('…')` 算在寫的位置。讀原始檔的部分移到 `src/lib/image-references.ts`（不依賴 Astro，測試可以直接載入）；`imagesIn()` 再濾掉不存在的圖片。
- 目前沒有文章的 og:image 因此改變：有滑桿的文章都有自己的社群圖片。sitemap 列的圖片不變，只是有滑桿的文章裡，圖片改成閱讀順序。
- 測試：`tests/image-references.test.ts`，fixture 是滑桿在 Markdown 圖片前面的 MDX（`tests/fixtures/compare-before-image.mdx`）。

### 網址檢查對正式網域也檢查 www 與 HSTS（2）

- HTTP 模式的 base 是 `https://aniya.moe` 時（`scripts/url-checker/settings.ts` 的 `PRODUCTION`），另外檢查：
  - `https://www.aniya.moe/`、深層路徑 `/2021/09/30/第一篇文章/` 與 `/?p=30`，都要 301 到 aniya.moe 上的同一個網址（路徑與查詢字串都保留）。結果用完整網址列在報告裡，也可以放進待完成清單。
  - 每個預期網址的回應都要有 `Strict-Transport-Security`，而且符合 HSTS preload 清單的要求：`max-age` 至少 31536000、`includeSubDomains`、`preload`（hstspreload.org）。aniya.moe 現在（WordPress，2026-10-25 查）送的是 `max-age=31536000; includeSubDomains; preload`，www 的轉址與 404 也有。
- 其他 base（預覽網址、`wrangler dev`）不檢查這兩項。
- 拿現在的 aniya.moe（還是 WordPress）試跑：HSTS、www 的 `/` 與深層路徑都通過；`https://www.aniya.moe/?p=30` 則直接 301 到文章（WordPress 自己處理 www），不是 `https://aniya.moe/?p=30`，所以不通過。**20 號建立 www 的 Redirect Rule 時要勾選保留查詢字串**，切換後就會通過。
- 測試（`tests/url-checker/check-urls.test.ts`）：用兩個本機 HTTP server 代替 aniya.moe 與 www。轉址正確時通過；轉到首頁或用 302 時失敗；沒有 HSTS、少了 `preload` 或 `includeSubDomains`、`max-age` 太短都失敗；其他網址不檢查。

### 少了結尾斜線的舊網址也轉址（3）

- 靜態規則只比對完全相同的網址，所以作者頁、舊 slug、各頁的 `…/feed` 少了結尾斜線就是 404；WordPress 是先 301 補上斜線，再轉到目標。
- `page-redirects.ts`（見下面的改名）為每個轉到站內固定網址的舊網址，多寫一條少斜線版本的靜態規則，直接轉到同一個目標（作者頁、`/comments/feed`、舊 slug，共 3 條）；feed 多一條動態規則 `/*/feed /:splat/ 301`，一樣在所有靜態規則之後。`/comments/feed` 有自己的靜態規則，不會被動態規則轉到不存在的 `/comments/`。
- 網址檢查：轉到站內固定網址的舊網址（`location` 是站內路徑），少斜線的版本也要 301 到同一個 `location`，跟頁面一樣。對應表裡有 90 個（87 個 feed、作者頁、comments feed、舊 slug）。
- **附件頁不做**：附件頁少了斜線仍然是 404。圖片的附件頁 306 個、影片與 PDF 9 個，共要 315 條靜態規則，但只剩 211 條的空間。網址檢查也不要求附件頁的少斜線版本（它們的 `location` 是建置後才知道的圖片，或 R2 上的檔案）。
- `_redirects` 現在是 **1,789 條靜態規則、2 條動態規則**（上限 2,000／100）。

### 測試的穩定性（5、6、7）

- 回到頂部按鈕的 reduced-motion 測試（22、12 號都記過偶爾失敗）有兩種失敗方式：`waitForFunction()` 在頁面跳到頂端後馬上返回，跳轉的 scroll 事件還沒觸發，記錄是空的；或是往下捲之後頁面還在微調（例如圖片載入），點擊前就多記了一筆（這次實際遇到 `[2161, 0]`）。現在從點擊開始記錄（capture 階段的 click listener，比按鈕自己的處理早），回到頂端後再等下一個 frame 才讀記錄。
- `wrangler dev` 的 port：原本先找一個空的 port、關掉，再交給 wrangler，同時啟動的測試檔可能拿到同一個。現在 server 與 inspector 都用 port 0，由系統在綁定時分配，再從 wrangler 的「Ready on」那一行讀出 port。同時啟動三個實測過，各自拿到不同的 port。
- 轉換器 fixture 的 `meta_id` 原本是模組層級的計數器，值取決於之前的測試建立過幾筆；現在是那一筆內容（文章、key、值）的 hash，打亂測試順序也一樣。

### 重構（8–12、15）

- **`termPath()`**：分類與標籤的網址，放在 `postPath()`、`pagePath()` 旁邊；文章頁、彙整列表、彙整本身都用它。分類與標籤的彙整帶著自己的 ID，路由直接拿來當參數，不再從網址切出來。
- **重複的只留一份**：feed 的作者用 `SITE_AUTHOR.name`；`SITE_ORIGIN` 放在 `src/consts.ts`，`astro.config.mjs` 的 `site`、網址檢查與轉換器的設定都從這裡拿；最後更新時間用 `lastUpdated()`（feed 的 `lastBuildDate`、sitemap 的彙整頁）；文章、頁面與 404 頁的 h1 共用 `global.css` 的 `.page-title`（頁面與 404 頁加 `.ruled` 的粗線）；分類與標籤的路由改成 `/category/[slug]/`、`/tag/[slug]/`，共用 `termArchiveRoutes()`；側欄的分類與年份清單合併成 `ArchiveList`（傳入彙整），刪掉 `CategoryList`、`YearList`。CSS 搬動後，在 Chromium 1280px 與 375px 寬比對過標題、側欄與內文的 computed style，都跟原本一樣。
- **對應表只在一個地方讀**：`src/lib/old-url-map.ts` 用 `import … with { type: 'json' }` 讀進對應表（Node、Vite 與 wrangler 的 esbuild 都接受，Worker 也能用），提供各段的型別，以及 `expectedUrls()`、`mediaFiles()`（照舊檢查格式）、`oldUrlsOf()`、`permalinks()`、`attachmentFiles()`。三個寫 `_redirects` 的 integration、Worker、網址檢查與 R2 的上傳、檢查腳本都用它，`src/` 不再 import `scripts/` 的程式。`scripts/r2-media/media-table.ts` 刪除；對應表的路徑 `MAPPING_TABLE_FILE` 移到轉換器的 `convert.ts`（只有轉換器寫這個檔案）。網址檢查的 `loadExpectedUrls()` 改成直接收對應表，測試直接傳小的表。
  - 代價：Worker 打包後從 223 KiB（gzip 20 KiB）變成 455 KiB（gzip 37 KiB）。13 號用 named import，esbuild 會丟掉用不到的 `urls` 段；預設 import 整份 JSON 就丟不掉，而 Node 不能 named import JSON。離 Workers 的大小上限還很遠。
- **`_redirects` 的規則有型別**：`appendRedirects()` 收 `{ from, to, status }`（UTF-8 的路徑），自己用 `encodeURI()` 編碼；五個寫 `_redirects` 的 integration 都改成交規則物件。圖片規則的暫存頁改輸出 JSON；Astro 給的圖片網址已經編碼過，先 `decodeURI()` 再交出去。
  - review 問到 `trailing-slash-redirects.ts` 沒用 `encodeURI()`、中文路徑寫成 UTF-8 是不是錯的：**不是**。Cloudflare 讀 `_redirects` 時，UTF-8 與百分比編碼都會正規化成大寫的編碼（03 號記錄的 asset worker 行為），網址檢查的建置模式（移植自那段程式）與 `wrangler dev` 都讓中文頁面少斜線的網址 301。現在這 33 條也寫成編碼的形式，跟其他規則一致；`_redirects` 其他的行一個字也沒變，兩種模式的網址檢查結果相同。`tests/redirects-file.test.ts` 用中文路徑測編碼。
- **改名**：`oldUrlRedirects` → `pageRedirects`（`src/integrations/page-redirects.ts`）。每個寫 `_redirects` 的 integration 都在轉舊網址；這個負責的是對應表轉到站內頁面（或 feed、sitemap）的那些：舊 slug、作者頁、comments feed、舊 sitemap、各頁的 feed。圖片與影片、PDF 各有自己的 integration。
- 刪掉 Astro 範本留下的註解（`src/consts.ts`、`BaseHead.astro` 開頭，以及每頁 HTML 裡的 `<!-- Global Metadata -->`）；`canonicalURL` 照檔案裡的命名改成 `canonicalUrl`；整理 `BaseLayout.astro` 的 import 順序。

### 測試的結構（13、14）

- 瀏覽器測試共用一個 Chromium（啟動時加 `--enable-smooth-scrolling`，回到頂部按鈕的測試要看捲動的過程），開頁面都用 `openPage()`（可以傳任何 context 選項，例如視窗大小、reduced motion、觸控、關掉 JavaScript），不再各自複製一份擋外站請求的 `context.route()`。GA4 的測試要讓 `https://aniya.moe` 由本機回答，保留自己的 route，但也用同一個瀏覽器。
- `tests/site-serving.test.ts`（2,432 行、20 個 describe）依功能拆成 `tests/site/` 底下 10 個檔案：serving、404 頁、圖片、彙整、版型、搜尋、文章之後、轉換內容、feed 與 sitemap、SEO head。
  - 同一個專案的兩次 Astro 建置同時跑會互相破壞（08 號記錄的坑），所以拆開後仍然只建置一次：`vitest.config.ts` 分成兩個 Vitest project。`site` project 的 `globalSetup`（`tests/site/global-setup.ts`）建置網站，啟動一個 `wrangler dev` 與一個 Chromium（`launchServer()`），用 `provide()` 交給各檔案；`tests/site/site.ts` 提供 `siteUrl`、`outDir`、`get()`、`openPage()`。只跑 `unit` project 的測試（例如 `npx vitest run tests/url-checker`）不會建置網站。
  - `site` 的檔案一次跑一個（`fileParallelism: false`，Vitest 把它們排在其他測試之後）：它們共用同一個 server，網址檢查的上萬個請求會拖慢其他檔案有時間限制的檢查，回到頂部按鈕與滑桿的瀏覽器測試也對時間敏感。跟拆開前同一個檔案裡的跑法一樣。
  - 代價：建置不再跟其他測試同時進行，整套測試從約 85 秒變成約 100 秒。
  - 之後要用建置結果的測試：放進 `tests/site/` 的檔案、用 `site.ts`，不要自己再建置一次。

### 數字

- 測試：27 個檔案、414 個測試（原本 16 個檔案、402 個）。
- `_redirects`：1,789 條靜態規則、2 條動態規則。
- 待完成清單仍然是空的。網址檢查的建置模式 1,985 個通過、883 個查詢字串網址跳過；HTTP 模式（`npm run preview`）2,868 個全部通過。
