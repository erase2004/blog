# 16: 搜尋、相關文章、分享按鈕與 giscus 留言

**What to build:** 讀者可以用中文搜尋全站，在文章結尾看到相關文章與分享按鈕，並用 GitHub 帳號留言。

**Blocked by:** 02, 15

**Status:** ready-for-agent

- [ ] 建置時產生 Pagefind 索引，語言設為 zh-TW；用中文關鍵字搜得到文章
- [ ] 搜尋框放進側欄 15 號預留的位置
- [ ] 文章結尾顯示 3 篇相關文章，依標籤重疊度計算
- [ ] 分享按鈕是純連結，不載入第三方 JS，平台沿用現在的：Facebook、X、LinkedIn、Mastodon、Threads、Telegram、WhatsApp、Reddit、Tumblr、Pinterest
- [ ] giscus 使用本 repo Discussions 的 `Comments` 分類，介面語言 zh-TW，依網址 pathname 對應 discussion
- [ ] 留言區可以發表留言與回覆
- [ ] 更新搬遷日誌
