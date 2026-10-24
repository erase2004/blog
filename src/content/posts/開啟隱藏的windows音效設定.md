---
title: "開啟隱藏的Windows音效設定"
slug: "開啟隱藏的windows音效設定"
published: 2021-10-21T16:36:22+08:00
updated: 2022-04-06T13:48:54+08:00
categories: ["技術"]
tags: ["regedit", "windows"]
excerpt: "在 Windows 10 系統下，開啟隱藏的音效選項，使其能夠顯示在音效設定的使用者界面中。"
draft: false
wordpressId: 130
---

本來是要客製化Windows 10預載的**鬧鐘與時鐘**`wp-unconverted: [ref]<a rel="noreferrer noopener" href="https://www.microsoft.com/zh-tw/p/windows-%E9%AC%A7%E9%90%98%E8%88%87%E6%99%82%E9%90%98/9wzdncrfj3pr?activetab=pivot:overviewtab" target="_blank">Windows 鬧鐘與時鐘</a>[/ref]`軟體的通知音效，由於軟體裡面沒有提供可以使用自訂音效的選項，便朝修改系統設定的方向著手，開啟系統的音效設定，針對每一個程式事件的音效去測試，結果沒找到對應的音效，在網路上進一步搜尋資料，才發現一些程式事件的音效設定被隱藏了，修改登錄檔資訊後，便可使那些被隱藏的設定再次顯示。操作步驟如下：

點選畫面左下角的搜尋圖示，輸入**regedit**後，點選**登入編輯程式**並開啟，程式開啟後，前往以下目錄：

HKEY_CURRENT_USER\\AppEvents\\EventLabels\\

完成後的畫面應該如下圖所示。

```html title="wp-unconverted: core/image"
<!-- wp:image {"align":"center","id":137,"width":768,"height":539,"sizeSlug":"large","linkDestination":"none"} -->
<div class="wp-block-image"><figure class="aligncenter size-large is-resized"><img src="https://aniya.moe/wp-content/uploads/2021/10/Snipaste_2021-10-21_15-41-55-1024x718.png" alt="登錄編輯程式畫面" class="wp-image-137" width="768" height="539"/></figure></div>
<!-- /wp:image -->
```

在這目錄底下，有幾個子目錄含有ExcludeFromCPL的機碼，以這次目標要修改音效所使用的名稱**鬧鐘 9**為例，它所在的子目錄是Notification.Looping.Alarm9，底下就有這個機碼。機碼預設值是1，這使得該設定不會出現在系統的音效設定上，將機碼數值修改為0，便可使設定顯示，系統音效設定出現**鬧鐘 9**的畫面如下圖所示。

```html title="wp-unconverted: core/image"
<!-- wp:image {"align":"center","id":139,"width":593,"height":664,"sizeSlug":"full","linkDestination":"none"} -->
<div class="wp-block-image"><figure class="aligncenter size-full is-resized"><img src="https://aniya.moe/wp-content/uploads/2021/10/Snipaste_2021-10-21_16-08-01.png" alt="聲音設定畫面" class="wp-image-139" width="593" height="664"/></figure></div>
<!-- /wp:image -->
```

參考資料：[How to hack the Windows 10 registry to customize hidden system sounds](https://www.techrepublic.com/article/how-to-hack-the-windows-10-registry-to-customize-hidden-system-sounds/)
