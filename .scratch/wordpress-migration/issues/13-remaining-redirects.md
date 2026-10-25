# 13: 其餘舊網址轉址與 `?p=ID` Worker

**What to build:** 剩下的舊網址全部導到正確的位置：作者頁、子 sitemap、各種 feed 變體、改過的 slug 與日期，以及 `?p=ID` 這類帶 query string 的短網址。

**Blocked by:** 12

**Status:** resolved

- [x] 作者頁 `/author/erase2004/` 301 到 `/about/`
- [x] `/wp-sitemap.xml` 與 `post-sitemap.xml` 等五個子 sitemap 301 到 `/sitemap.xml`
- [x] `/comments/feed/` 301 到 `/feed/`
- [x] 單篇、分類、標籤的 `…/feed/` 301 回該頁本身，用動態規則
- [x] 1 個舊 slug 與 3 篇改過日期的文章，301 到現在的網址
- [x] Worker 程式只在首頁 `/` 執行；其他路徑不會觸發 Worker
- [x] `?p=ID` 與 `?page_id=ID` 依舊網址對應表 301 到對應的文章或頁面；不存在的 ID 回 404；沒有這些參數的請求交回靜態檔案
- [x] `/wp-admin/`、`/wp-login.php`、`/xmlrpc.php`、`/wp-json/` 回 404
- [x] 網址檢查：上述網址全部通過，並從待完成清單移除
- [x] 更新搬遷日誌
