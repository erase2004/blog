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
- 再加上全站設定用到的 **2 張**：AIOSEO 的預設社群圖片 `night.png`（og:image 的最後 fallback），和佈景主題的 header 圖 `cropped-akiba07-scaled-3.jpg`。spec 指定它們放 `site/`。
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
- WordPress 手動調過寬度的 13 個 block（例如 768px）沒有保留寬度，現在是「最寬到原圖寬度、不超過欄寬」。15、18 號看版面再決定。
- alt 文字頭尾的空白去掉。
- 09、10 號轉相簿與對照滑桿時，用 `rules/images.ts` 的 `imageSource(url, context)` 取得圖片相對於內容檔的路徑；任何形式的舊網址都可以丟進去，不是要搬的圖會直接報錯。

### Astro 的輸出：webp 與響應式尺寸

- `astro.config.mjs` 設 `image: { layout: 'constrained' }`：每張圖輸出 webp，`srcset` 是 Astro 內建的寬度（640、750、828、1080、1280、1668、2048、2560）中不超過原圖寬度的那些，`sizes` 是 `(min-width: 原圖寬px) 原圖寬px, 100vw`。原始的 JPEG／PNG 不會出現在建置結果裡。
- 實測：用 Chrome 的 DevTools 裝置模擬（390×844，跟 iPhone 差不多寬）打開 Day 2 那篇，逐一捲到每張圖，看瀏覽器實際選的檔案：
  - DPR 2：每張 2560px 的照片都載入 828w 的 webp。
  - DPR 3：載入 1280w 的 webp。
  - 桌機 1920px：載入 1920w／2048w，因為 `sizes` 寫的是 `100vw`，但範本的內文欄只有 640px。**15 號做版型時要把 `sizes` 改成實際欄寬**，桌機才不會下載過大的圖。
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
- **一律附加、不覆蓋**：把 01 號 integration 裡附加 `_redirects` 的那幾行抽成 `src/integrations/redirects-file.ts` 的 `appendRedirects()`，補斜線的規則和圖片規則都用它。之後 07、13 號寫 `_redirects` 也請用它。
- **規則數量**：圖片 1,639 條（1,333 個 upload 路徑 + 306 個附件頁）加上目前 27 條補斜線，共 **1,666 條靜態規則**。估計網站做完：11 號再多約 89 個頁面的補斜線規則、07 號約 18 條、13 號約 10 條靜態加幾條動態，合計約 1,780 條，還在 2,000 以內，但剩下的空間不多。

### 規則數量的上限：超過就建置失敗

- `src/integrations/redirects-budget.ts`：建置完成時讀最後的 `_redirects`，靜態規則超過 2,000 條或動態規則超過 100 條就讓建置失敗。它放在 integrations 的最後一個，檢查的是所有 integration 寫完之後的結果。
- 為什麼一定要擋：看了 wrangler 的 `parseRedirects()`，超過上限的規則只會印一行警告然後**被跳過**，部署照樣成功，舊網址就默默變成 404。計數方式照它的寫法：來源有 `*` 或 `:placeholder` 的是動態規則，**第一條動態規則之後的每一條都算動態**（03 號也記錄過這點）。

### 網址檢查與待完成清單

- sitemap 快照的 772 筆圖片網址（761 個不同網址）全部通過，從待完成清單移除。對應表新增的 1,639 個轉址與 101 個 404 也全部通過，建置輸出與 HTTP（`wrangler dev`）兩種模式都是。
- 待完成清單從 1,007 筆變成 246 筆，刪掉的剛好是 761 個 `/wp-content/` 網址，其他行沒動（`/wp-content/` 那一組原本的位置留下兩個空行，不影響檢查，也避免碰到 11、13 號會改的相鄰行）。

### 測試

- `tests/wordpress-converter/content.test.ts`：圖片 block（圖說含連結、舊式 block 的 id、`-scaled`／Photon／縮圖／百分比編碼的網址都指向同一個檔案、alt 的跳脫）與文字裡的 `<img>`，用 Sätteri 渲染並編譯成 MDX。
- `tests/wordpress-converter/convert-wordpress.test.ts`：fixture 加了一個小型媒體庫（真實附件刪減而成）：要複製哪些圖、共用圖放第一篇、`site/` 資料夾、社群圖片、各種舊 upload 路徑與附件頁、沒人用的圖回 404、`images` section。
- `tests/redirects-budget.test.ts`：2,000 條靜態加 100 條動態通過；2,001 條靜態失敗；第一條動態規則之後都算動態。
- `tests/site-serving.test.ts`：對真正的建置結果，模擬瀏覽器依 `srcset`／`sizes` 選圖：390px 寬的手機（DPR 2）跟桌機選到不同的檔案、都是 webp、手機那張不到一半大；舊的 upload 路徑與附件頁 301 到文章裡那張圖的 `src`。

### 留給其他 issue 的發現

- 07：`appendRedirects()` 寫 `_redirects`；規則數量會被 `redirects-budget` 檢查。影片與 PDF 的 upload 網址目前沒有任何預期（不在 sitemap 裡），由 07 號自己加。
- 09、10：圖片已經搬好、轉址也做好了；用 `imageSource(url, context)` 取得路徑。轉址目標固定是原圖寬度的 webp，不管相簿用什麼尺寸顯示都不受影響。
- 12：sitemap 的圖片網址用 `src/lib/images.ts` 的 `imageAt(file)` 與 `imageUrl()`，跟轉址目標是同一個網址。
- 13：`?attachment_id=ID`（見上面）。
- 14：`socialImage` 現在是 `image()`；og:image 要決定輸出格式（webp 在社群平台的支援度要查）。`night.png` 在 `src/assets/images/site/night.png`。網站圖示還沒搬。
- 15：`sizes` 改成實際欄寬；`<figure>`／`<figcaption>` 的樣式；手動調過寬度的圖。
- 04：CI 快取 `node_modules/.astro`，否則每次部署都要多花 2 分半做 webp。
