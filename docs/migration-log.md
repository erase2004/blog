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
