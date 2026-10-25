# 14: SEO head 與 GA4

**What to build:** 每一頁輸出與搬遷前一致的 SEO 標籤，讓搜尋引擎的索引內容不因搬遷而改變；沒有自訂社群圖片的文章，分享時改用文章第一張圖。GA4 直接嵌入，沿用同一個屬性，讓搬遷前後的流量可以比較。

**Blocked by:** 06

**Status:** resolved

- [x] 標題格式：文章與頁面是 `<標題> - TsukiStudio`，首頁是 `TsukiStudio - 生活點滴紀錄`
- [x] 1 篇有 AIOSEO 自訂標題的文章，沿用它的自訂標題
- [x] meta description：有 AIOSEO 自訂描述的用自訂描述，否則用摘要
- [x] 每頁輸出指向自身正式網址的 canonical
- [x] og:image 依序 fallback：AIOSEO 的自訂社群圖片 → 文章第一張圖 → `night.png`
- [x] 輸出 `article:published_time`、`article:modified_time`、`article:tag`、`fediverse:creator`（`@erase2004@g0v.social`）
- [x] `html lang="zh-TW"`、`og:locale` 為 `zh_TW`
- [x] JSON-LD 輸出 BlogPosting、BreadcrumbList、WebSite、Person
- [x] 直接嵌入 GA4 gtag，屬性 ID `G-NWNYVH87N4`
- [x] 網址檢查的 head 抽驗加上標題格式與 og:image 檢查
- [x] 逐篇比對 title 與 description，與 WordPress 版一致
- [x] 更新搬遷日誌
