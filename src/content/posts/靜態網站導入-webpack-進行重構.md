---
title: "靜態網站導入 webpack 進行重構"
slug: "靜態網站導入-webpack-進行重構"
published: 2022-03-30T18:30:06+08:00
updated: 2022-04-06T13:31:17+08:00
categories: ["技術"]
tags: ["a-b-testing", "flowbite", "lazy-loading", "postcss", "tailwind-css", "webpack"]
excerpt: "對靜態網頁使用 webpack、Tailwind CSS 等工具，以及圖片延遲載入技術，來進行網頁的重構，以提昇網頁的可維護性、初次載入速度和使用者操作體驗。"
draft: false
wordpressId: 265
---

這次將 ACGN股市歷史博物館[^1] 的頁面，從原先只有單純的 HTML、CSS和JavaScript，逐一導入 webpack 和 loader 套件，鋪設基礎建設後，使其更利於未來的開發與維護。

```html title="wp-unconverted: core/image"
<!-- wp:image {"align":"center","id":266,"width":768,"height":217,"sizeSlug":"large","linkDestination":"none"} -->
<div class="wp-block-image"><figure class="aligncenter size-large is-resized"><img src="https://aniya.moe/wp-content/uploads/2022/03/Snipaste_2022-03-30_15-20-47-1024x289.png" alt="導入前的專案目錄截圖" class="wp-image-266" width="768" height="217"/><figcaption>導入前的專案目錄截圖，<a href="https://github.com/erase2004/museum-landmark/tree/ef6284d0e6e99def41456fcc0b87a53a28f9a3b2" data-type="URL" data-id="https://github.com/erase2004/museum-landmark/tree/ef6284d0e6e99def41456fcc0b87a53a28f9a3b2" target="_blank" rel="noreferrer noopener">commit 連結</a></figcaption></figure></div>
<!-- /wp:image -->
```

這次執行過程，主要是受到這篇文章[^2]的啟發，同時，也參考該篇文章的操作流程，進行專案導入 webpack 的處理，也藉由操作的過程，更加熟悉 webpack 生態系。以下，將依序介紹這次導入的相關工具，以及他們的使用場景。

### Yarn

專案套件管理的基礎，在後續處理專案安全漏洞問題時，使用 Yarn 提供的 Selective dependency resolutions[^3] 功能，在 package.json 檔裡設定 resolution，有限地解決部份安全漏洞。

### webpack 5

專案打包工具，將專案依照設定，打包成滿足特定情境需求的版本，由於 webpack 5 有提供 Asset Modules[^4] 的功能，不用再像以往，需要使用 raw-loader, url-loader 和 file-loader 之類。

#### ．babel-loader

將 ES6+ 的 JavaScript 原始碼轉譯成 ES5

#### ．css-loader、mini-css-extract-plugin

前者是處理在 JavaScript 檔案中，import CSS 檔案的載入處理。後者是將載入後的 CSS 內容，輸出成獨立的檔案。

#### ．html-webpack-plugin

將初始的 index.html 轉為輸出成目標 HTML 的模板使用，該 plugin 預設使用 EJS 的模板語言，藉由在模板中撰寫模板語法，減少在重複 DOM 元素上的重複作業，提昇開發效率。

#### ．favicon-webpack-plugin

使用該 plugin 來處理 favicon 的產生與插入到目標 HTML 的任務。

#### ．Asset Modules

這次是用 asset/resource 來處理 JavaScript 檔案中，動態載入的圖片，確保輸出的結果能夠確實存取到這些圖片。

#### ．webpack-dev-server

供專案開發時使用的網頁伺服器，並利用其 HMR ([^5]) 特性，讓程式碼在被修改後，能夠立即在網頁上呈現，進而提昇開發效率。

## browserlist

使用該套件統一管理專案中，需要使用目標瀏覽器資訊套件的設定。

### PostCSS

將輸入的 CSS 檔案，按照設定的任務依序處理，輸出處理後的 CSS 內容。

#### ．autoprefixer

依照 package.json 內的 browserlist 設定，對 CSS style 加上瀏覽器專有的 prefix。

#### ．PurgeCSS

讀取專案原始碼並進行分析，移除未被使用的 CSS style，以達成對 CSS 的瘦身。

#### ．CSSNANO

對 CSS 進行壓縮，以達成最後輸出的 CSS 檔案大小最小化。

### ESLint、babel-eslint

依照設定的規則，檢查 JavaScript 原始碼的程式語法，並提出修改建議，以達成程式碼美化與風格上的統一。規劃未來將 babel-eslint 替換成 @babel/eslint-parser[^6]。

## Stylelint

針對 CSS 的原始碼程式語法與風格檢查工具。

```html title="wp-unconverted: core/image"
<!-- wp:image {"align":"center","id":278,"width":768,"height":497,"sizeSlug":"large","linkDestination":"none"} -->
<div class="wp-block-image"><figure class="aligncenter size-large is-resized"><img src="https://aniya.moe/wp-content/uploads/2022/03/Snipaste_2022-03-30_17-28-07-1024x662.png" alt="導入後的專案目錄截圖" class="wp-image-278" width="768" height="497"/><figcaption>導入後的專案目錄截圖，<a href="https://github.com/erase2004/museum-landmark/tree/00c2315699819402ec33edc0d68ff3c5955f3c9f" data-type="URL" data-id="https://github.com/erase2004/museum-landmark/tree/00c2315699819402ec33edc0d68ff3c5955f3c9f" target="_blank" rel="noreferrer noopener">commit 連結</a></figcaption></figure></div>
<!-- /wp:image -->
```

原先根目錄底下的 index.html 搬移到 src 目錄底下管理，同時，assets 目錄底下的 JavaScript 和 CSS 的程式碼，以及 favicon 檔案都也搬移到 src 目錄底下管理。又 images 底下的圖片檔也搬移到 src 目錄底下管理。專案根目錄多了 public 和 dist 目錄，前者用作開發時 devServer 使用，後者用作部屬版本的輸出目錄使用。

新版本的專案要部屬前，先在正式環境上，參考教學[^7][^8]來修改 NGINX 設定，使其能夠同時服務新舊兩個版本，以利做 A/B 測試做對照。

```html title="wp-unconverted: core/image"
<!-- wp:image {"align":"center","id":281,"width":768,"height":115,"sizeSlug":"large","linkDestination":"none"} -->
<div class="wp-block-image"><figure class="aligncenter size-large is-resized"><img src="https://aniya.moe/wp-content/uploads/2022/03/Snipaste_2022-03-30_17-41-44-1024x153.png" alt="舊版本的測試結果 (WebPageTest)" class="wp-image-281" width="768" height="115"/><figcaption>舊版本的測試結果，<a href="https://www.webpagetest.org/result/220328_AiDc9T_CXP/" data-type="URL" data-id="https://www.webpagetest.org/result/220328_AiDc9T_CXP/" target="_blank" rel="noreferrer noopener">詳細資訊</a></figcaption></figure></div>
<!-- /wp:image -->
```

```html title="wp-unconverted: core/image"
<!-- wp:image {"align":"center","id":280,"width":768,"height":114,"sizeSlug":"large","linkDestination":"none"} -->
<div class="wp-block-image"><figure class="aligncenter size-large is-resized"><img src="https://aniya.moe/wp-content/uploads/2022/03/Snipaste_2022-03-30_17-41-40-1024x152.png" alt="新版本的測試結果 (WebPageTest)" class="wp-image-280" width="768" height="114"/><figcaption>新版本的測試結果，<a href="https://www.webpagetest.org/result/220328_AiDcPF_CMY/" data-type="URL" data-id="https://www.webpagetest.org/result/220328_AiDcPF_CMY/" target="_blank" rel="noreferrer noopener">詳細資訊</a></figcaption></figure></div>
<!-- /wp:image -->
```

```html title="wp-unconverted: core/image"
<!-- wp:image {"align":"center","id":283,"width":768,"height":101,"sizeSlug":"large","linkDestination":"none"} -->
<div class="wp-block-image"><figure class="aligncenter size-large is-resized"><img src="https://aniya.moe/wp-content/uploads/2022/03/Snipaste_2022-03-30_17-45-43-1024x135.png" alt="舊版本的測試結果 (GTmetrix)" class="wp-image-283" width="768" height="101"/><figcaption>舊版本的測試結果，<a href="https://gtmetrix.com/reports/museum.acgn-stock.com/UBovCjwE/" data-type="URL" data-id="https://gtmetrix.com/reports/museum.acgn-stock.com/UBovCjwE/" target="_blank" rel="noreferrer noopener">詳細資訊</a></figcaption></figure></div>
<!-- /wp:image -->
```

```html title="wp-unconverted: core/image"
<!-- wp:image {"align":"center","id":282,"width":768,"height":99,"sizeSlug":"large","linkDestination":"none"} -->
<div class="wp-block-image"><figure class="aligncenter size-large is-resized"><img src="https://aniya.moe/wp-content/uploads/2022/03/Snipaste_2022-03-30_17-45-34-1024x132.png" alt="新版本的測試結果 (GTmetrix)" class="wp-image-282" width="768" height="99"/><figcaption>新版本的測試結果，<a href="https://gtmetrix.com/reports/museum.acgn-stock.com/PqmQATlN/" data-type="URL" data-id="https://gtmetrix.com/reports/museum.acgn-stock.com/PqmQATlN/" target="_blank" rel="noreferrer noopener">詳細資訊</a></figcaption></figure></div>
<!-- /wp:image -->
```

基本上網頁在載入的表現上差異不大，符合預期。

---

第一階段的工作基本上到這邊就結束了，接下來建立在這個基礎建設上，對網站進行重構，使其呈現效果與使用者操作上更加友好。

首先，導入 image-webpack-loader，來處理以往圖片壓縮處理人工操作的部份，在輸入檔案總共 62 MB 的情況下，原先人工操作的部份可以壓縮到 24 MB，使用該 plugin 來處理的話，則會壓縮到 32 MB，考量到自動化以及圖片並非全部一次載入，plugin 帶來的優劣還是可以接受的。

接著，導入 Tailwind CSS[^9] 與 Flowbite[^10]，讓 CSS style 在撰寫與管理上更加清楚明瞭，並善用 html-webpack-loader 與 EJS[^11] 語法對 index.html 進行重構，最後，參考教學[^12]撰寫 image lazy-loading 處理。

重構完成後的網站，帶來以下好處：

- 由於網站清單和圖片清單資料都抽出來獨立成檔案來管理，未來在新增對應資訊上的處理更加便捷。
- 網站清單的呈現與操作在桌面端與移動端上更加友好。
- 圖片可以完整的呈現，點擊圖片也能開啟對應賽季公司的詳細資訊頁。
- 圖片顯示區塊有要載入圖片的**主要顏色**[^13]作墊底顯示。
- 圖片顯示區塊有載入動畫，能讓使用者更清楚圖片正在載入狀態。

```html title="wp-unconverted: core/image"
<!-- wp:image {"align":"center","id":267,"width":768,"height":526,"sizeSlug":"large","linkDestination":"none"} -->
<div class="wp-block-image"><figure class="aligncenter size-large is-resized"><img src="https://aniya.moe/wp-content/uploads/2022/03/Snipaste_2022-03-30_15-21-06-1024x701.png" alt="最終的專案目錄截圖" class="wp-image-267" width="768" height="526"/><figcaption>最終的專案目錄截圖</figcaption></figure></div>
<!-- /wp:image -->
```

```html title="wp-unconverted: core/gallery"
<!-- wp:gallery {"linkTo":"none"} -->
<figure class="wp-block-gallery has-nested-images columns-default is-cropped"><!-- wp:image {"id":288,"sizeSlug":"medium","linkDestination":"none"} -->
<figure class="wp-block-image size-medium"><img src="https://aniya.moe/wp-content/uploads/2022/03/Snipaste_2022-03-30_18-20-37-300x188.png" alt="PageSpeed Insight 的分析結果 (行動裝置)" class="wp-image-288"/></figure>
<!-- /wp:image -->

<!-- wp:image {"id":289,"sizeSlug":"medium","linkDestination":"none"} -->
<figure class="wp-block-image size-medium"><img src="https://aniya.moe/wp-content/uploads/2022/03/Snipaste_2022-03-30_18-20-48-300x190.png" alt="PageSpeed Insight 的分析結果 (電腦)" class="wp-image-289"/></figure>
<!-- /wp:image --><figcaption class="blocks-gallery-caption">PageSpeed Insight 的分析結果</figcaption></figure>
<!-- /wp:gallery -->
```

[^1]: [ACGN股市歷史博物館](https://museum.acgn-stock.com/)
[^2]: [How to Bundle a Simple Static Site Using Webpack](https://www.sitepoint.com/bundle-static-site-webpack/)
[^3]: [Selective dependency resolutions | Yarn](https://classic.yarnpkg.com/lang/en/docs/selective-version-resolutions/)
[^4]: [Asset Modules](https://webpack.js.org/guides/asset-modules/)
[^5]: [Hot Module Replacement | webpack](https://webpack.js.org/concepts/hot-module-replacement/)
[^6]: [The State of babel-eslint | BABEL](https://babeljs.io/blog/2020/07/13/the-state-of-babel-eslint)
[^7]: [A/B testing with NGINX in under 40 lines of code | freeCodeCamp](https://www.freecodecamp.org/news/a-b-testing-with-nginx-in-40-lines-of-code-d4f94397130a/)
[^8]: [Performing A/B Testing with NGINX and NGINX Plus](https://www.nginx.com/blog/performing-a-b-testing-nginx-plus/)
[^9]: [Tailwind CSS](https://tailwindcss.com/)
[^10]: [Flowbite](https://flowbite.com/)
[^11]: [EJS](https://ejs.co/#promo)
[^12]: [The Complete Guide to Lazy Loading&nbsp;Images | CSS-TRICKS](https://css-tricks.com/the-complete-guide-to-lazy-loading-images/#aa-method-1-trigger-the-image-load-using-javascript-events)
[^13]: [主要顏色的分析工具](https://onlinejpgtools.com/find-dominant-jpg-colors)
