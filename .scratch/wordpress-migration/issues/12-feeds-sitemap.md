# 12: Feed、sitemap、robots.txt、llms.txt

**What to build:** RSS 訂閱者不必重新訂閱，搜尋引擎在原本的路徑找到新的 sitemap。產生 RSS、Atom、sitemap、`robots.txt` 與 `llms.txt`。

**Blocked by:** 05, 06

**Status:** resolved

- [x] `/feed/` 輸出 RSS 2.0，`/feed/atom/` 輸出 Atom；兩者都是全文、最新 10 篇，Content-Type 正確
- [x] feed 裡的連結與圖片都是絕對網址
- [x] `/sitemap.xml` 列出首頁、文章、頁面、分類、標籤，附上圖片的新網址
- [x] `/sitemap.xml` 不列日期彙整與分頁
- [x] `robots.txt` 重新產生，保留 `Sitemap:` 那一行，拿掉 `/wp-admin/` 相關規則
- [x] 產生 `llms.txt`
- [x] 網址檢查：`/feed/`、`/feed/atom/`、`/sitemap.xml`、`/robots.txt` 通過，並從待完成清單移除
- [x] 更新搬遷日誌
