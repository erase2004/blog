# 02: 帳號與外部服務設定

**What to build:** 建立後續 issue 需要的帳號、權限與外部服務。這些步驟都要由站長登入各服務操作，agent 無法代勞。

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] 在 GitHub 建立公開 repo，把現有 commit 推上去（2026-10-25 推上 `main` 與 `feature/wordpress-migration`）
- [x] 開啟 repo 的 Discussions，建立 `Comments` 分類
- [x] 安裝 giscus GitHub App，授權這個 repo
- [x] 建立 Cloudflare API token，權限涵蓋 Workers 部署與 R2 寫入；token 和 account ID 存進 GitHub Secrets
- [x] 建立 R2 bucket，綁定自訂網域 `media.aniya.moe`
- [x] 確認 Google Search Console 有 `aniya.moe` 的「網域」資源；沒有就用 DNS TXT 驗證，開始累積切換前的基準數據
- [x] WordPress 備份另存一份到別的地方（雲端硬碟或外接硬碟），不要只放在一顆硬碟上
- [x] 在搬遷日誌記下完成日期與遇到的問題，不要記任何 token 或密碼
