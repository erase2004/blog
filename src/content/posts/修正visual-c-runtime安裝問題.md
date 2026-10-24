---
title: "修正Visual C++ Runtime安裝問題"
slug: "修正visual-c-runtime安裝問題"
published: 2021-10-20T17:47:41+08:00
updated: 2022-04-06T13:50:15+08:00
categories: ["技術"]
tags: ["visual-c-runtime", "windows"]
excerpt: "修正 Visual C++ Runtime 因未被正常安裝或移除，導致後續無法再進行安裝、更新或者移除的錯誤。"
draft: false
wordpressId: 120
---

在某一次操作後，電腦要安裝或更新Visual C++ Runtime時，就會出現因缺少某個版本的Visual C++ Runtime的依賴，而永遠得安裝失敗，情況如同這個問題：

[https://docs.microsoft.com/en-us/answers/questions/71632/visual-c-vc-runtimeminimum-x64msi-error.html](https://docs.microsoft.com/en-us/answers/questions/71632/visual-c-vc-runtimeminimum-x64msi-error.html)

由於Visual C++ Runtime未被正確得安裝或者移除，使得電腦的登錄檔仍有相關殘留，造成要再安裝新版本的Visual C++ Runtime時，會出現這種問題，又**程式與功能**清單裡面，沒有顯示出軟體的紀錄，無法藉由操作來導引到修復畫面解決這個問題`wp-unconverted: [ref]<a rel="noreferrer noopener" href="https://thegeekpage.com/visual-c-runtime-library-error/" target="_blank">Fix Microsoft Visual C++ Runtime Library Error in Windows 10/11</a>[/ref]`。幸好，最後找到這個解決方式`wp-unconverted: [ref]<a rel="noreferrer noopener" href="https://support.microsoft.com/en-us/topic/fix-problems-that-block-programs-from-being-installed-or-removed-cca7d1b6-65a9-3d98-426b-e9f927e1eb4d" data-type="URL" data-id="https://support.microsoft.com/en-us/topic/fix-problems-that-block-programs-from-being-installed-or-removed-cca7d1b6-65a9-3d98-426b-e9f927e1eb4d" target="_blank">Fix problems that block programs from being installed or removed</a>[/ref]`，下載並執行，開啟這個**疑難排除**，並在程式清單中，找到目標Visual C++ Runtime對其執行操作，以達成完整移除。

完整移除後，可以從這裡`wp-unconverted: [ref]<a href="https://www.techpowerup.com/download/visual-c-redistributable-runtime-package-all-in-one/" target="_blank" rel="noreferrer noopener">Visual C++ Redistributable Runtimes All-in-One (July 2021) Download | TechPowerUp</a>[/ref]`下載所有Visual C++ Runtime的整合包，下載完成後解壓縮並執行**install_all.bat**，即可給電腦安裝上所有的Visual C++ Runtime，由於bat裡的安裝檔執行指令有下參數，使得這些Runtime在安裝完畢後，電腦不用重新啟動。
