# 07: 影片搬到 R2

**What to build:** 8 支 mp4 影片和 1 個 PDF 移到 R2，透過 `media.aniya.moe` 提供。影片能正常播放、拖曳進度條，舊路徑 301 到新網址。

**Blocked by:** 02, 05

**Status:** resolved

- [x] 8 支 mp4（共 179 MB）上傳到 R2，依文章 slug 分資料夾
- [x] 唯一的 PDF 也放到 R2，一樣依文章 slug 分資料夾
- [x] 內容裡的影片與 PDF 改用 `media.aniya.moe` 的網址
- [x] 影片可以播放並拖曳進度條；確認 R2 對 range request 回 206（`npm run verify-media` 確認 9 個檔案都回 206；在瀏覽器實際拖曳進度條留到 19 號實測）
- [x] 舊的影片與 PDF 路徑加入舊網址對應表，301 到新網址
- [x] 網址檢查：影片與 PDF 的轉址通過，並從待完成清單移除
- [x] 更新搬遷日誌
