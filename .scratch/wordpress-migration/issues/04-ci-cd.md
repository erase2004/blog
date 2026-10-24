# 04: CI/CD 部署管線

**What to build:** GitHub Actions 每次 push 都建置網站並跑網址檢查，通過才部署。推到 `main` 部署到正式 Worker，推到其他 branch 部署成預覽版本。此時 Worker 仍只在 workers.dev 上，尚未綁定 `aniya.moe`。

**Blocked by:** 01, 02, 03

**Status:** ready-for-agent

- [ ] 每次 push 都建置，並以建置輸出模式跑網址檢查；檢查失敗就不部署
- [ ] push 到 `main` 時部署到正式 Worker
- [ ] push 到其他 branch 時上傳成預覽版本，並在 workflow 的輸出顯示預覽網址
- [ ] 部署完成後，用 HTTP 模式對剛部署的網址再跑一次網址檢查
- [ ] 所有憑證只從 GitHub Secrets 讀取，不出現在 repo 或 log 裡
- [ ] 更新搬遷日誌
