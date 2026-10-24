# 08: 程式碼區塊、腳註與 YouTube

**What to build:** 轉換器處理程式碼區塊、兩套腳註與 YouTube 嵌入，網站端用對應的方式呈現：程式碼有高亮和檔名，腳註可以來回跳轉，YouTube 點了才載入。

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] 9 個程式碼區塊以 Expressive Code 顯示，保留語言標示
- [ ] 程式碼區塊的 `title` 屬性轉成檔名標題
- [ ] `[ref]…[/ref]` shortcode 轉成 GFM 腳註 `[^n]`
- [ ] Gutenberg 內建腳註（存在 postmeta 的 JSON）轉成 GFM 腳註
- [ ] 腳註編號與原文順序一致；點腳註編號會跳到註解，註解可以跳回原處
- [ ] 2 個 YouTube 嵌入改成輕量嵌入：先顯示縮圖，點了才載入 iframe
- [ ] 每條轉換規則都有 fixture 測試
- [ ] 05 號留下的對應標記全部處理掉
- [ ] 更新搬遷日誌
