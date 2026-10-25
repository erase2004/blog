# 05: 轉換器與文章、頁面的文字內容

**What to build:** 一支一次性的 Node 轉換腳本，直接解析 WordPress 的 SQL 備份，轉出 22 篇文章和 5 個頁面，並產生舊網址對應表。網站這邊建立內容 schema，以及文章與頁面的路由，讓所有文章和頁面都能用原網址開啟。圖片、相簿、對照滑桿等元素留給後續 issue。

**Blocked by:** 01, 03

**Status:** resolved

- [x] 直接解析 SQL 備份，不匯入資料庫，也不使用 WXR 匯出檔
- [x] 建立「文章」與「頁面」兩個 content collection，frontmatter 欄位照 spec，建置時驗證
- [x] 帶入 AIOSEO 的 meta description 與社群圖片設定，以及手動摘要
- [x] 發布時間以 Asia/Taipei 時區解讀；文章網址 `/YYYY/MM/DD/<slug>/` 與 WordPress 完全一致，包括 2025-05-17 同一天的 8 篇遊記
- [x] 頁面保留階層：`/about/contact/`、`/about/autobiography/`
- [x] 文字類 block 的轉換：段落、標題、清單、表格、分隔線、按鈕、欄位
- [x] `<ruby>` 保留 HTML；`<mark style=…>` 統一成一種螢光筆樣式
- [x] 站內的絕對網址 `https://aniya.moe/...` 改成相對路徑
- [x] 移除 `[lmt-post-modified-info]` 與 `<!-- more -->`
- [x] 這個階段一律輸出 `.md`；需要元件的文章由 09、10 號改成 MDX
- [x] 尚未支援的元素（圖片、相簿、對照滑桿、程式碼、腳註、YouTube、影片）用明顯的標記保留，不可靜默丟失
- [x] 舊網址對應表 commit 進 repo，內容包括 WordPress 文章與頁面的 ID、現在的網址、舊 slug、舊日期
- [x] 每條轉換規則都有 fixture 測試
- [x] 網址檢查：sitemap 快照中的 22 篇文章與 5 個頁面通過，並從待完成清單移除
- [x] 更新搬遷日誌
