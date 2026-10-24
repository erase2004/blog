# 10: 對照滑桿 `<Compare>`

**What to build:** 讀者可以拖曳滑桿比較前後對照的兩張圖，例如聖地巡禮的實景與動畫畫面。轉換器把 Jetpack image-compare 轉成 `<Compare>` 元件。

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] 72 個對照滑桿轉成 `<Compare>`，包括 block 版與手動寫成 `wp:html` 的版本
- [ ] 含對照滑桿的文章改成 MDX
- [ ] `<Compare>` 包裝 `img-comparison-slider` web component，滑鼠與觸控都能拖曳
- [ ] 對照滑桿的 JS 只在有對照滑桿的頁面載入
- [ ] 轉換後的滑桿數量與原文一致
- [ ] 兩種來源各有 fixture 測試
- [ ] 更新搬遷日誌
