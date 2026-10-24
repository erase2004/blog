---
title: "Next.js App Route 與 Cloud CDN cache 設定"
slug: "next-js-app-route-and-cloud-cdn-cache"
published: 2025-03-25T21:17:38+08:00
updated: 2025-03-26T00:42:18+08:00
categories: ["技術"]
tags: ["app-route", "cloud-cdn", "next-js"]
excerpt: "文章分享了筆者進行大量查找後，得出目前適用於 Next.js App Route 與 Cloud CDN 的 cache 設定"
draft: false
wordpressId: 419
---

## 前言

Next.js 在 App Route 上不少的改動，導致傳統在 Page Route 上的 Cloud CDN cache 設定無法適用，因此撰寫這篇文章，分享目前適用於 App Route 的設定策略，供所有開發人員參考。

## 本文

筆者將針對 Next.js App Route 環境下，需要讓 CDN Cache 正確運作的運作的設定，分成以下幾個部份來分別說明。

### 在 Cloud CDN 上的設定

Next.js 在 App Route 時，response 會帶含有數值為 *RSC*、*Next-Router-State-Tree*、*Next-Router-Prefetch 和 Next-Url* 的 Vary header `wp-unconverted: <sup data-fn="90e39d4c-b413-460c-b74c-1f9e33ba2f0f" class="fn"><a id="90e39d4c-b413-460c-b74c-1f9e33ba2f0f-link" href="#90e39d4c-b413-460c-b74c-1f9e33ba2f0f">1</a></sup>`，由於這幾個數值並非 Cloud CDN 預設可被作為 cache key 的 header `wp-unconverted: <sup data-fn="d50384b6-d8ee-4ab3-bd7a-dfe7fafccd0e" class="fn"><a id="d50384b6-d8ee-4ab3-bd7a-dfe7fafccd0e-link" href="#d50384b6-d8ee-4ab3-bd7a-dfe7fafccd0e">2</a></sup>`，導致 response 無法被 CDN 給 cache，幸好，Cloud CDN 提供設定 custom cache key 的方式 `wp-unconverted: <sup data-fn="c07f144e-e7cf-413d-964b-cc1b4d41b5f4" class="fn"><a id="c07f144e-e7cf-413d-964b-cc1b4d41b5f4-link" href="#c07f144e-e7cf-413d-964b-cc1b4d41b5f4">3</a></sup>`，大家可以藉由將 *RSC*、*Next-Router-State-Tree*、*Next-Router-Prefetch* 和 *Next-Url* 增加至 custom cache header，來使 response 可以被 cache，設定如下圖所示

```html title="wp-unconverted: core/image"
<!-- wp:image {"id":422,"sizeSlug":"full","linkDestination":"none","align":"center"} -->
<figure class="wp-block-image aligncenter size-full"><img src="https://aniya.moe/wp-content/uploads/2025/03/Snipaste_2025-03-25_15-59-21.png" alt="" class="wp-image-422"/><figcaption class="wp-element-caption">在 CDN 項目中，增加相關 header 至 cache key components 底下的設定</figcaption></figure>
<!-- /wp:image -->
```

而在 CDN cache mode 選擇上，則是設定 <mark>USE_ORIGIN_HEADERS</mark> 的方式，將 cache 設定的主導權交給 Next.js server 而非 CDN，這麼做的原因主要是避免新的版本部屬後，舊有版本的 CDN cache 依舊存在，使得使用者藉由舊版本的頁面，存取到存在於舊版本，但不存在於新版的資源，進而導致頁面發生錯誤的情況。`wp-unconverted: <sup data-fn="f0353324-050b-403c-b3f6-b3ef3898df2a" class="fn"><a id="f0353324-050b-403c-b3f6-b3ef3898df2a-link" href="#f0353324-050b-403c-b3f6-b3ef3898df2a">4</a></sup>`

```html title="wp-unconverted: core/image"
<!-- wp:image {"id":423,"sizeSlug":"full","linkDestination":"none"} -->
<figure class="wp-block-image size-full"><img src="https://aniya.moe/wp-content/uploads/2025/03/Snipaste_2025-03-25_16-12-54.png" alt="" class="wp-image-423"/><figcaption class="wp-element-caption">在 CDN 項目中 cache mode 的選擇</figcaption></figure>
<!-- /wp:image -->
```

---

### **在 Next.js server 上的設定**

由於 cache 設定的主導權下放到 server，因此，server 端需要在 response 時，帶有適當的 Cache-Control header`wp-unconverted: <sup data-fn="fa2decc9-a116-492d-bf8e-32ee6ba77f55" class="fn"><a id="fa2decc9-a116-492d-bf8e-32ee6ba77f55-link" href="#fa2decc9-a116-492d-bf8e-32ee6ba77f55">5</a></sup>`，當 response 經由 CDN 回傳給使用者時，才會被 CDN 給 cache 住。為了達成這樣的目標，須先確保 Next.js 版本在 14.2.13 以上`wp-unconverted: <sup data-fn="b3e954e0-8cc4-4cc6-82e4-468a19fe5571" class="fn"><a id="b3e954e0-8cc4-4cc6-82e4-468a19fe5571-link" href="#b3e954e0-8cc4-4cc6-82e4-468a19fe5571">6</a></sup>`，接著，依照官方文件的教學`wp-unconverted: <sup data-fn="c0be3696-a04d-4145-bc43-bebc6934636f" class="fn"><a id="c0be3696-a04d-4145-bc43-bebc6934636f-link" href="#c0be3696-a04d-4145-bc43-bebc6934636f">7</a></sup>`，在 next config 中設定輸出的 header 資訊。

```html title="wp-unconverted: core/image"
<!-- wp:image {"id":426,"sizeSlug":"full","linkDestination":"none"} -->
<figure class="wp-block-image size-full"><img src="https://aniya.moe/wp-content/uploads/2025/03/Snipaste_2025-03-25_16-53-09.png" alt="" class="wp-image-426"/><figcaption class="wp-element-caption">首頁 cache 5 分鐘，並給予一分鐘的更新緩衝時間</figcaption></figure>
<!-- /wp:image -->
```

除了 Cache-Control header，也需要增加 ETag header`wp-unconverted: <sup data-fn="a297f12e-c3ef-4216-82a5-ca0aa6cdcd7c" class="fn"><a href="#a297f12e-c3ef-4216-82a5-ca0aa6cdcd7c" id="a297f12e-c3ef-4216-82a5-ca0aa6cdcd7c-link">8</a></sup>`，讓 server 版本更新後，CDN 可以藉由 ETag 資訊的變動，來更新既有 cache 的內容`wp-unconverted: <sup data-fn="f957d511-6d13-4485-8599-3bb686dbecdb" class="fn"><a href="#f957d511-6d13-4485-8599-3bb686dbecdb" id="f957d511-6d13-4485-8599-3bb686dbecdb-link">9</a></sup>`。順道一題，Next.js 雖然預設會輸出 ETag header，但在 dynamic route 的情況下，卻不會輸出 ETag header`wp-unconverted: <sup data-fn="46f68751-140c-4567-87e9-0f84522e4490" class="fn"><a href="#46f68751-140c-4567-87e9-0f84522e4490" id="46f68751-140c-4567-87e9-0f84522e4490-link">10</a></sup>`，為了讓所有路徑都能夠輸出 ETag 資訊，在 next config 中，使用 git commit hash 資訊，來設定 ETag header 到所有的路徑上，設定如下圖所示：

```html title="wp-unconverted: core/image"
<!-- wp:image {"id":427,"sizeSlug":"full","linkDestination":"none"} -->
<figure class="wp-block-image size-full"><img src="https://aniya.moe/wp-content/uploads/2025/03/Snipaste_2025-03-25_16-52-55.png" alt="" class="wp-image-427"/><figcaption class="wp-element-caption">在所有路徑上，使用 git commit hash 為數值，來設定 ETag header</figcaption></figure>
<!-- /wp:image -->
```

以上設定妥善後，便可得到 CDN cache 頁面的結果，同時，在新的版本部屬後，也能避免發生 version skew 的情況。

```html title="wp-unconverted: core/image"
<!-- wp:image {"id":428,"sizeSlug":"full","linkDestination":"none","align":"center"} -->
<figure class="wp-block-image aligncenter size-full"><img src="https://aniya.moe/wp-content/uploads/2025/03/Snipaste_2025-03-25_17-12-20-2.png" alt="" class="wp-image-428"/><figcaption class="wp-element-caption">首頁被 CDN cache 住的情況</figcaption></figure>
<!-- /wp:image -->
```

## 結語

Next.js 在 App Route 之後，逐漸與開發者兼雲端服務商 Vercel 的環境綁定，導致在其環境之外要進行 self hosting 時，需要進行許多額外的設定，這導致 [OpenNext](https://opennext.js.org/) 這樣的專案誕生，然而， OpenNext 目前支援的 Cloud Provider 並不包含 GCP，因此，筆者僅能藉由自行查找網路資訊，盡可能歸納出適用於 GCP 上的設定。

## 額外補充

前面有提到，Next.js Vary Header 有三個特殊的數值，關於它們的實際用途，可以從官方的回答`wp-unconverted: <sup data-fn="be17c0dc-9700-482a-914f-44e5f217dd77" class="fn"><a id="be17c0dc-9700-482a-914f-44e5f217dd77-link" href="#be17c0dc-9700-482a-914f-44e5f217dd77">11</a></sup>`，或者 stackoverflow 上的討論`wp-unconverted: <sup data-fn="042a0781-4e89-4cf7-b05f-53e7cc0aa848" class="fn"><a id="042a0781-4e89-4cf7-b05f-53e7cc0aa848-link" href="#042a0781-4e89-4cf7-b05f-53e7cc0aa848">12</a></sup>`，歸納出以下資訊：

- *Next-URL* 會作為在 Intercepting Routes`wp-unconverted: <sup data-fn="a7805dd0-74e1-4b06-83df-fc66858a6a2c" class="fn"><a id="a7805dd0-74e1-4b06-83df-fc66858a6a2c-link" href="#a7805dd0-74e1-4b06-83df-fc66858a6a2c">13</a></sup>` 情境下，server 用來決定要回傳的內容使用。
- *Next-Router-State-Tree* 會作為 Partial Rendering`wp-unconverted: <sup data-fn="414a9e62-eee4-4c53-975c-0d543a2e2422" class="fn"><a id="414a9e62-eee4-4c53-975c-0d543a2e2422-link" href="#414a9e62-eee4-4c53-975c-0d543a2e2422">14</a></sup>` 情境下，server 決定要回傳的渲染範圍使用
- *Next-Router-Prefetch* 用來辨別該 request 是不是來自 prefetch 的情況

```html title="wp-unconverted: core/footnotes"
<!-- wp:footnotes /-->
<ol class="wp-block-footnotes"><li id="90e39d4c-b413-460c-b74c-1f9e33ba2f0f">Vary header 的數值，代表會作為 content negotiation 機制所示的 header key，更多可以參考 <a href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Vary" target="_blank" rel="noopener nofollow" title="">Vary - HTTP | MDN</a></li><li id="d50384b6-d8ee-4ab3-bd7a-dfe7fafccd0e"><a href="https://cloud.google.com/cdn/docs/caching#non-cacheable_content" target="_blank" rel="noopener nofollow" title="">Non-cacheable content base on origin headers | Cloud CDN</a></li><li id="c07f144e-e7cf-413d-964b-cc1b4d41b5f4"><a href="https://cloud.google.com/cdn/docs/caching#http-headers-cookies" target="_blank" rel="noopener nofollow" title="">Including request headers | Cloud CDN</a></li><li id="f0353324-050b-403c-b3f6-b3ef3898df2a"><a href="https://vercel.com/blog/version-skew-protection" target="_blank" rel="noopener nofollow" title="">Introducing Skew Protection | Vercel</a></li><li id="fa2decc9-a116-492d-bf8e-32ee6ba77f55"><a href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control#response_directives" target="_blank" rel="noopener nofollow" title="Response Directives | Cache-Control - HTTP | MDN">Response Directives | Cache-Control - HTTP | MDN</a></li><li id="b3e954e0-8cc4-4cc6-82e4-468a19fe5571"><a href="https://github.com/vercel/next.js/issues/70213#issuecomment-2362507714" target="_blank" rel="noopener nofollow" title="">Comment | Cache-Control is not appended to Dynamic Routing in Next.js 14.2.12 | GitHub</a> </li><li id="c0be3696-a04d-4145-bc43-bebc6934636f"><a href="https://nextjs.org/docs/14/pages/api-reference/next-config-js/headers" target="_blank" rel="noopener nofollow" title="">next.config.js Options: headers | Next.js</a></li><li id="a297f12e-c3ef-4216-82a5-ca0aa6cdcd7c"><a href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/ETag" target="_blank" rel="noopener nofollow" title="">ETag - HTTP | MDN</a></li><li id="f957d511-6d13-4485-8599-3bb686dbecdb"><a href="https://cloud.google.com/cdn/docs/caching#response-headers-validate" target="_blank" rel="noopener nofollow" title="">Use conditional requests for validation | Cloud CDN</a></li><li id="46f68751-140c-4567-87e9-0f84522e4490"><a href="https://github.com/vercel/next.js/discussions/74915#discussioncomment-11982685" target="_blank" rel="noopener nofollow" title="">Comment | ETags in Next.js App Router | GitHub</a></li><li id="be17c0dc-9700-482a-914f-44e5f217dd77"><a href="https://github.com/vercel/next.js/issues/65335#issuecomment-2121343642" target="_blank" rel="noopener nofollow" title="">Comment | RSC and CDN interaction makes next.js inefficient for highload projects | GitHub</a> </li><li id="042a0781-4e89-4cf7-b05f-53e7cc0aa848"><a href="https://stackoverflow.com/a/76313026" target="_blank" rel="noopener nofollow" title="">Answer | How to identify Nextjs prefetch request in the middleware | stack overflow</a> </li><li id="a7805dd0-74e1-4b06-83df-fc66858a6a2c"><a href="https://nextjs.org/docs/app/building-your-application/routing/intercepting-routes" target="_blank" rel="noopener nofollow" title="">Routing: Intercepting Routes | Next.js</a></li><li id="414a9e62-eee4-4c53-975c-0d543a2e2422"><a href="https://nextjs.org/docs/app/building-your-application/routing/linking-and-navigating#4-partial-rendering" target="_blank" rel="noopener nofollow" title="">Partial Rendering | Next.js</a></li></ol>
```
