# 09: 相簿 `<Gallery>`

**What to build:** 讀者在遊記裡看到網格排列的相簿，點圖片會用 lightbox 開啟，可以左右翻看。轉換器把 Envira 相簿轉成 `<Gallery>` 元件，以後新寫的文章也能用同一個元件。

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] 83 個 Envira 相簿轉成 `<Gallery>`，圖片清單取自 block 裡的 JSON；原本有圖說的保留圖說
- [ ] 3 個 Gutenberg 內建的 gallery block 也用 `<Gallery>` 呈現
- [ ] 含相簿的文章改成 MDX
- [ ] 相簿以網格排列；點圖片用 PhotoSwipe 開啟 lightbox，可以左右翻看與關閉
- [ ] 相簿的 JS 只在有相簿的頁面載入
- [ ] 轉換後的圖片總數與原相簿一致（約 509 張）
- [ ] 轉換規則有 fixture 測試
- [ ] 更新搬遷日誌
