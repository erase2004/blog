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
