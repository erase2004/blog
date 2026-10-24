---
title: "讓Android手機畫面顯示在Windows電腦上"
slug: "讓android手機畫面顯示在windows電腦上"
published: 2022-03-09T16:27:15+08:00
updated: 2022-04-06T13:45:08+08:00
categories: ["技術"]
tags: ["adb", "android", "scrcpy", "windows"]
excerpt: "使用 scrcpy 軟體，讓 Android 手機上的畫面能夠即時顯示在 Windows 系統上，並可以從 Windows 系統對 Android 手機進行操作，藉此讓使用者在 Windows 系統上，同時體驗 Android App 的操作和系統較大的螢幕。"
draft: false
wordpressId: 189
---

有些平台或者服務是App限定，又或者App上操作體驗比較好，但通常手機的畫面都不大，長時間使用手機的情況下，觀看體驗不佳，這時候，在希望能兼顧App的操作體驗與電腦大螢幕的良好觀看體驗下，我開始尋找可以讓Android手機畫面投影到電腦螢幕上的解決方案。

[6 Methods To Mirror Android Screen To PC (No Root Apps) In 2020](https://fossbytes.com/android-screen-mirroring-apps-pc/)

從上面文章中，我找到目前正在使用中的方法，那就是 [scrcpy](https://github.com/Genymobile/scrcpy)，這個軟體是開源且不少使用者數，系統支援是Android 5+ (API 21+)，設定上也不是很困難，使用者可以在手機上對手機畫面操作，也可以在電腦上對手機畫面操作，基本上滿足的我的需求。

在Windows系統上，你可以直接從Github上的Release頁底下，去下載底下的壓縮包，或者依照Github上的[教學](https://github.com/Genymobile/scrcpy/blob/master/README.zh-Hant.md#%E4%B8%8B%E8%BC%89%E7%8D%B2%E5%8F%96%E8%BB%9F%E9%AB%94)，使用 [Chocolatey](https://chocolatey.org/) 或 [Scoop](https://scoop.sh) 來安裝。安裝完畢後，在使用前，請先開啟手機的 [adb 偵錯 (通常位於開發者模式內)](https://developer.android.com/studio/command-line/adb.html#Enabling) ，然後，將手機和電腦用usb連接，接著，在開啟scrcpy的程式，這時候，便會開啟一個程式，程式畫面顯示是手機畫面，你就可以在這個程式畫面看到即時的手機畫面變動，也可以在電腦上，對這程式畫面操作來影響手機畫面。

如果手機Android版本是11以上，可以藉由將手機與電腦連到同一個無線AP底下，且手機開啟無線adb偵錯的情況下進行連接，這樣就不需要使用到usb線了。

```html title="wp-unconverted: core/image"
<!-- wp:image {"align":"center","id":215,"sizeSlug":"full","linkDestination":"none"} -->
<div class="wp-block-image"><figure class="aligncenter size-full"><img src="https://aniya.moe/wp-content/uploads/2022/03/Snipaste_2022-03-09_16-23-42.png" alt="scrcpy視窗裡的手機畫面" class="wp-image-215"/><figcaption>scrcpy視窗裡的手機畫面</figcaption></figure></div>
<!-- /wp:image -->
```
