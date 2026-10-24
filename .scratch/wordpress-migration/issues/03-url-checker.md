# 03: 網址檢查腳本

**What to build:** 一支網址檢查腳本，作為整個搬遷的主要測試 seam。它以 WordPress sitemap 快照和舊網址對應表為預期清單，可以檢查建置輸出，也可以對任何 base URL 實際發 HTTP request。之後每張 issue 都靠它證明自己完成了。

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] 預期清單讀入 sitemap 快照的 88 個網址；舊網址對應表存在時一併讀入（從 05 號開始逐步產生）
- [ ] 建置輸出模式：每個預期網址都對應到輸出裡的一個檔案，或對應到 `_redirects` 的一條規則與正確的目標
- [ ] HTTP 模式：對指定的 base URL 發 request，不自動跟隨轉址，檢查狀態碼與 `Location`
- [ ] 中文 slug 同時用百分比編碼和 UTF-8 兩種寫法檢查
- [ ] 檢查一個不存在的網址會回 404
- [ ] 抽驗 HTML head：canonical 等於自身網址，有 `<title>` 與 meta description（標題格式的檢查在 14 號加上）
- [ ] 「待完成清單」ratchet：清單內的網址允許失敗；清單外的網址失敗，或清單內的網址已經通過，檢查都會失敗，並提示要更新清單
- [ ] 初始的待完成清單包含目前所有尚未實作的網址
- [ ] 腳本本身有測試，用小型 fixture 驗證上述每一種判斷
- [ ] 更新搬遷日誌
