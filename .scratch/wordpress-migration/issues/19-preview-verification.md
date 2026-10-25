# 19: 預覽網址驗證（第二段）

**What to build:** 對預覽網址實際發 HTTP request，確認所有舊網址在 Cloudflare 上的行為和本機一致，並實測官方文件沒寫明的行為。這一段通過，才能進入切換上線。

**Blocked by:** 04, 13, 17, 18

**Status:** resolved

- [x] 以 HTTP 模式對預覽網址跑網址檢查，全部通過
- [x] 待完成清單只剩下必須在正式網域上才能驗證的項目（`www` 轉址、HSTS）
- [x] 實測中文路徑：百分比編碼與 UTF-8 兩種寫法都能開到正確的頁面（WordPress canonical 用的小寫編碼原本 307，已加規則改成 301）
- [x] 實測 `force-trailing-slash`：缺斜線的網址 301 到有斜線的版本，而且不會形成轉址迴圈
- [x] 實測不存在的網址回 404 狀態碼與 404 頁
- [x] 實測影片的 range request 回 206，進度條可以拖曳
- [x] 實測 giscus：登入 GitHub 後可以發表留言與回覆，discussion 依文章路徑建立（16 號移過來）
- [x] 實測 Worker 只在首頁執行，其他頁面不消耗 Worker 請求額度
- [x] 發現的問題都修正，並在搬遷日誌記下實測結果
