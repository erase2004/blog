---
title: "ALPHA Camp推特專案開發紀錄"
slug: "alpha-camp推特專案開發紀錄"
published: 2022-03-11T17:12:15+08:00
updated: 2022-04-06T13:37:04+08:00
categories: ["閒聊"]
tags: ["alpha-camp", "scrum", "twitter"]
excerpt: "在 ALPHA Camp 第三學期期末，與其他學員組隊，在為期兩週的時間內，使用 Scrum 的方法，並採前後端分離的開發模式，進行 Simple Twitter 專案的開發。"
draft: false
wordpressId: 219
---

這是作為學期三最後的畢業專案，專案會是唯一一次採取團隊開發，且盡可能採用Scrum的方式進行。開發時間為14天左右，中間會有3次的sprint check-in作業繳交，作為小組開發狀況向AC團隊那邊回報的管道。在開發過程中，團隊須依照課程所給予的User Story，討論出團隊自己功能驗收的Acceptance Criteria，並且，前端開發人員依照課程所給予的頁面設計搞去刻劃出網頁頁面，後端開發人員依照課程已經給予的test case，去規劃並撰寫出後端API服務，在期限內完成指定規格與功能的交付。

```html title="wp-unconverted: core/image"
<!-- wp:image {"align":"center","id":220,"width":768,"height":640,"sizeSlug":"large","linkDestination":"none"} -->
<div class="wp-block-image"><figure class="aligncenter size-large is-resized"><img src="https://aniya.moe/wp-content/uploads/2022/03/01-1024x853.png" alt="推特專案成果預覽" class="wp-image-220" width="768" height="640"/><figcaption>推特專案成果預覽</figcaption></figure></div>
<!-- /wp:image -->
```

[專案最終成品 Demo](https://erase2004.github.io/ac-twitter/#/signin)

專案基本版Github Repository：[前端](https://github.com/yuanliif/ac-twitter)、[後端](https://github.com/martinchiu/twitter-api-2020)

專案最終版Github Repository：[前端](https://github.com/erase2004/ac-twitter)、[後端](https://github.com/HUANG-SIH-MAN/twitter-api-2020)

前端開發組員：Tsuki（我）、Tony、Alison

後端開發組員：鰻魚燒、Martin

---

團隊溝通使用的平台是Discord為主，Slack則作為和AC團隊和助教間聯絡使用。

第一次的團隊線上語音會議團隊達成了以下事項：

1. 瞭解彼此以及各自能夠投入開發的情況
2. 確立使用 [Notion](https://grey-dancer-26c.notion.site/c45728660f854f80aa182fe197eb4cdb)作為共同資訊的管理
3. 確立使用 [trello](https://trello.com/b/btjxVprp/%E6%8E%A8%E7%89%B9%E5%B0%88%E6%A1%88) 作為任務追蹤管理
4. 確立團隊角色分工
5. 確立團隊和助教的互動原則：
   1. 團隊成員會設一個問題卡關處理的停損點，問題在嘗試一天內無法解決時，才在Slack上向助教尋求協助
   2. 團隊成員每天上午9:30 - 10:00在Slack群組上進行工作狀況回報，回報下述內容：
      1. 昨天進度
      2. 今天要做的事情
      3. 遇到的困難
6. 發放作業，讓團隊成員各自參考既有的User Story，規劃出自己的Acceptance Criteria，並約下一次會議時，拿出來討論，形成團隊的Acceptance Criteria

會議結束後，團隊成員各自在Slack群組上做一個簡短的自我介紹，讓助教能夠瞭解團隊成員的背景，此外，我也安排團隊和助教kick-off meeting的時間，讓團隊和助教間能夠藉由線上會議的形式，更加認識彼此，以利後續的合作。

```html title="wp-unconverted: core/image"
<!-- wp:image {"align":"center","id":224,"width":768,"height":230,"sizeSlug":"large","linkDestination":"none"} -->
<div class="wp-block-image"><figure class="aligncenter size-large is-resized"><img src="https://aniya.moe/wp-content/uploads/2022/03/Snipaste_2022-03-11_12-58-38-1024x307.png" alt="團隊成員各自回報能夠投入開發的時間" class="wp-image-224" width="768" height="230"/><figcaption>團隊成員各自回報能夠投入開發的時間</figcaption></figure></div>
<!-- /wp:image -->
```

```html title="wp-unconverted: core/image"
<!-- wp:image {"align":"center","id":225,"sizeSlug":"full","linkDestination":"none"} -->
<div class="wp-block-image"><figure class="aligncenter size-full"><img src="https://aniya.moe/wp-content/uploads/2022/03/Snipaste_2022-03-11_13-16-14.png" alt="團隊角色分工" class="wp-image-225"/><figcaption>團隊角色分工</figcaption></figure></div>
<!-- /wp:image -->
```

---

在第一次會議後的隔天就第二次會議，這次會議達成了以下事項：

1. 參考彼此繳交的Acceptance Criteria，團隊逐項討論，完成團隊的Acceptance Criteria
2. 前後端分開討論開發任務的分配
3. 參考[資料](https://medium.com/doflowy/scrum%E8%A6%8F%E5%8A%83%E6%9C%83%E8%AD%B0-%E4%B8%89-%E9%80%B2%E8%A1%8Cstory-point%E7%9A%84%E8%A9%95%E5%88%86-de6c837ee6cc)，讓團隊成員對開發任務進行Story Point的評分

這次的會議過程十分冗長，主要花了很多時間在討論Acceptance Criteria上，而前後端分開討論開發任務分配時，也花了些時間在功能實作上的討論，以及頁面如何切分成各自可以獨立開發的任務，以至於前端在任務分配上，需要在隔天再進行一次會議討論，才能夠確立初步的任務分配。

會議後，我建立團隊和助教的kick-off meeting所要使用的會議排程，並將會議資訊連同會議要討論的事項，在Slack群組裡通知團隊成員與助教，並請助教先參閱提供的文件，以利在kick-off meeting中更有效率得討論。

[Acceptance Criteria 最終決定版](https://grey-dancer-26c.notion.site/Acceptance-Criteria-c6dbc9a77a30428593ceaa1c96690495)

[前端分工與SP的評分](https://grey-dancer-26c.notion.site/b6790ac1b9704bfbadfd890d32d7bf7a)

[後端分工與SP的評分](https://grey-dancer-26c.notion.site/79dd78f7ab70449db632e60ba307d20d)

---

大部分的文書工作都在第一次sprint check時完成，接下來主要是專案任務的執行與開發。

功能開發上，團隊規範盡彼此可能一個功能一個feature branch，功能完成後要推上Github時，先更新來自Github的內容，處理完後，再把feature branch推上Github，接著再用推上去的feature branch對main branch發起Pull Request，然後，由另一位團隊成員進行code review，審核通過後，才併入到main branch。這部份Git的多人協作過程，是團隊大部分成員第一次體驗到的情況，一開始會需要比較多的溝通與練習，不過大家漸漸都習慣這個流程了。

在實作功能上，比較不確定的部份是 [Nested Routes](https://router.vuejs.org/guide/essentials/nested-routes.html) 和 [Portal Vue](https://github.com/LinusBorg/portal-vue)，Nested Routes規劃是用在使用者Profile頁上，Portal Vue是規劃用在發推Modal、回推Modal和使用者Profile編輯Modal上。針對Nested Routes不確定的部份，在開發使用者Profile頁部份時，先弄幾個測試空白元件下去驗證想法，確認和當初假設的顯示結果相同後，將這些測試空白頁替換為真正要顯示的元件。而針對Portal Vue也是採取同樣策略，慶幸這兩個部份最終都和當初假設的結果一致。

另外，前端在實作與後端API串接的部份，開發時，參考後端成員鰻魚燒利用[Swagger](https://app.swaggerhub.com/apis-docs/HUANG-SIH-MAN/twitter-API/1.0.0#/)所建立的API文件進行撰寫，當遇到API規格不符預期時，便使用API文件和前端頁面設計搞來進行討論與API的調整。

在第二次sprint check左右時，前端頁面的完成進度主要有使用者登入頁、使用者註冊頁、使用者設定頁、管理員登入頁和管理後台推文頁；後端的開發進度大都完成，開始部屬到Heroku上並進行功能修正。而在第二次sprint check隔天，有showcase的活動，showcase的內容是向AC團隊呈現專案目前的正向流程，並且報告接下來的任務安排與規劃。由於團隊在專案一開始有報名這次的showcase，所以在showcase當天要到showcase前，我這邊主要都在進行將本地端網頁端串接本地端後端API。

串接上遇到最主要的問題是CORS設定不正確，導致前端網頁無法正確取得後端的回應內容，參考Huli大的[CORS解說](https://blog.huli.tw/2021/02/19/cors-guide-1/)，並自己對後端API的程式碼進行調整後，完成網頁端和後端API的初步串接，並且，將修正後的CORS設定，回報給後端組員進行修改。除了CORS問題，也提出一些後端處理上的邏輯建議給後端組員進行調整，以確保前端能夠正確呈現後端回傳的內容。

在showcase過程，主要是由我來向AC團隊進行前端網頁的正向流程示範，而由另一位組員鰻魚燒來進行接下來任務調整與規劃的報告，由於目前網站完成度較低，在正向流程上，能夠操作的不多，而在進行示範時，就很容易遇到流程上會卡住的地方，另外，我預設showcase會是一個完整的進度報告情況，會把目前已經完成、正在進行中和尚未完成的資訊都報告出來，不過在showcase完成後，AC團隊的直接回饋是這是一個增加客戶和開發團隊信賴的場合，示範上，盡可能展示完成的部份，如果遇到無法避免且尚未完成的部份，輕描淡寫帶過即可。

在第二次sprint check時，團隊進行一次線上語音會議，主要是確認彼此的工作狀況，以及工作分配的調整，會議後，前端首頁區塊的部份交給我接手處理，同時，跟隨者與正在跟隨頁提高開發優先順序。

在第二次sprint check和showcase後，我這邊著手進行剩下顯示區域的開發、和Heroku上後端API的串接，並開啟並設定Github issue的部份，讓後端組員測試前端網頁，並將測到的問題以一個issue一個問題的方式回報在Github issue上，我再定期上去看issue、設定解決優先度，甚至是解決。同時，我也請Tony組員設定好Github Page設定，以便前端網站能夠正確部屬到Github Page上並呈現。

到第三次sprint check時，網站主體顯示大抵完成，剩下issue處理的部份，由於網站編譯成正式版本及部屬主要是由Tony組員負責，又Tony組員在時間彈性上沒那麼充裕，於是，我在Github Repository上使用Github Action來解決這問題，我設定Action行為在PR merge進main時，便編譯專案成正式版本並部屬上Github Page。另外，我也請Tony邀請後端組員進前端的Github Repository進行Code Review，藉由這兩個手段，加速團隊在最後的開發速度，以達成團隊可以提早交付並提前檢驗的目的。

收到AC團隊對於提早交付內容的審核結果，我們得到AC團隊在安裝前端專案過程中遇到EBUSY的問題，因此需要進一步調整的問題，團隊成員在自己的電腦上測試，並在網路上搜尋關於這個問題的解法後，團隊得到這個應該是客戶端電腦自身問題的結論，基於呈現出我們還是有努力過的樣子，我們將找到的解決方法記錄在Github Repository的README上，同時，我也增加新的Action，設定Action在有新的PR時，對PR進行編譯，測試該PR在不同系統與Node.js版本下上是否會出現問題。

```html title="wp-unconverted: core/image"
<!-- wp:image {"align":"center","id":312,"sizeSlug":"full","linkDestination":"none"} -->
<div class="wp-block-image"><figure class="aligncenter size-full"><img src="https://aniya.moe/wp-content/uploads/2022/04/32.png" alt="EBUSY錯誤訊息" class="wp-image-312"/><figcaption>EBUSY錯誤訊息</figcaption></figure></div>
<!-- /wp:image -->
```

---

在基本版功能完成，團隊稍微喘息一下後，接著就是挑戰功能。挑戰功能的部份，有三個挑戰內容，開發時間限定在兩天內完成。由於挑戰功能的完成與否，並不影響畢業條件，在挑戰開始的討論會議時，我提出讓團隊開發採用接力的方式進行，把有效的開發時間（48小時）按照人數平均分割，每人認領一個時間，在那個時間只會有一個人在進行開發，由於前端有3人，後端有2人，所以前端可以是8小時分6輪或者16小時分3輪的形式。後端會是12小時分4輪或者24小時分2輪的形式。在討論後，後端那邊沒有打算全天候不間斷開發的模式，所以後端就維持之前的開發時間安排，不過前端這邊就採取16小時3輪的形式，由我自己當作第一棒，Tony作為第二棒，Alison作為最後一棒。

當初設想這個形式，主要是在前面基本版開發的過程中，觀察到前後端API的串接與溝通，在前端部份主要是由我來處理，我是希望團隊的前端在專案結束後，都有能夠和後端獨立溝通的能力，因此，我設計出這樣的模式，讓每一位前端成員在開發時，都強迫自己要和後端成員進行API串接的溝通，另外，挑戰內容其實對我來說已經是熟悉的內容，如果在開發過程中我持續在場，我想對於其他組員的學習成長可能會造成一定的損害。

我的時段從第一天的凌晨0點到下午16點，由於0點到9點這時段沒有後端組員會上線進行開發，所以我先進行前端呈現版面的刻畫。在後端組員開始上線前，我完成了到挑戰二的前端版面呈現。在後端組員上線後，我就和他們邊開發變進行溝通確認，大抵完成了挑戰一的部份。在進到尾聲時，將專案目前的狀態和資訊傳遞給下一棒的Tony，由他接手和後端組員繼續後續的挑戰內容。

---

專案開發和團隊互動的過程給我不少啟發與思考：

1. 在一開始建立團隊的Acceptance Criteria部份，如果提早把所有人規劃的內容先整理到同一頁，或許就能夠提高討論Acceptance Criteria的效率。
2. 任務的安排需要有優先順序，並且這優先順序是前後端要一起協調的，以確保前後端在開發步調上持續的整合溝通。
3. 如何讓團隊氣氛更能使團隊成員更加 [PRO](https://hanamizuki.tw/proactive-responsive-overcommunication/) ，以促進團隊在共識上的建立、專案上開發的效率。
4. 作為經驗者，如何傳授知識與經驗給新進者，並帶領他們成長。

最後，感謝鰻魚燒、Martin、Tony和Alison讓我在緊急的最後一刻加入到團隊，一起完成推特專案。鰻魚燒的學習力與Swagger API令人驚豔；Martin腦筋轉得也快；Tony正職學習但依舊努力勤勞也令人佩服；Alison的行動力使人印象深刻。謝謝各位。
