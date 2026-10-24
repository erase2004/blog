# 20: 切換上線

**What to build:** 把 `aniya.moe` 從 WordPress 切換到新網站。正式網域上的網址檢查全部通過之後，才關閉舊主機。

**Blocked by:** 19

**Status:** ready-for-human

- [ ] 關閉 Cloudflare 的 Rocket Loader
- [ ] 確認 HSTS header 的來源；如果是舊主機加的，改由 Cloudflare 的 Edge Certificates 設定，或寫進 `_headers`
- [ ] 建立 zone 層級的 Redirect Rule，把 `www.aniya.moe` 301 到 `aniya.moe`
- [ ] 刪除指向舊主機的 A record，把 `aniya.moe` 綁定成 Worker 的 Custom Domain
- [ ] 對正式網域跑網址檢查，全部通過，包括 `www` 轉址與 HSTS
- [ ] 確認 02 號的 WordPress 異地備份已完成
- [ ] 正式網域驗證通過後，才關閉舊主機
- [ ] 在 Google Search Console 重新提交 `/sitemap.xml`
- [ ] 在搬遷日誌記下切換時間與過程
- [ ] 若新網站出問題，用 `wrangler rollback` 回到上一個 Worker 版本
