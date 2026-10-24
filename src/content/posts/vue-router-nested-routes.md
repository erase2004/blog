---
title: "Vue Router - Nested Routes"
slug: "vue-router-nested-routes"
published: 2022-03-24T23:10:13+08:00
updated: 2022-04-06T13:32:54+08:00
categories: ["技術"]
tags: ["nested-route", "vue", "vue-router"]
excerpt: "使用範例專案來講解 Vue Router 中，Nested Routes 的使用方法，以及可能的使用場景。"
draft: false
wordpressId: 234
---

參考範例：[https://github.com/erase2004/vue-router-demo](https://github.com/erase2004/vue-router-demo)

```html title="wp-unconverted: core/image"
<!-- wp:image {"align":"center","id":251,"sizeSlug":"large","linkDestination":"none"} -->
<div class="wp-block-image"><figure class="aligncenter size-large"><img src="https://aniya.moe/wp-content/uploads/2022/03/preivew-1024x768.png" alt="頁面預覽" class="wp-image-251"/><figcaption>頁面預覽</figcaption></figure></div>
<!-- /wp:image -->
```

```html title="wp-unconverted: core/image"
<!-- wp:image {"align":"center","id":236,"sizeSlug":"full","linkDestination":"none"} -->
<div class="wp-block-image"><figure class="aligncenter size-full"><img src="https://aniya.moe/wp-content/uploads/2022/03/Untitled-Diagram.drawio.png" alt="頁面結構" class="wp-image-236"/><figcaption>頁面結構</figcaption></figure></div>
<!-- /wp:image -->
```

網頁結構出現 router-view 下層還有 router-view 情況時，就是 Nested Routes 的情況。以範例來講，網頁最上層有 Homepage、Multi View #1 \~ Multi View #4、Nested Route 的頁面，而 Nested Route 頁面底下又有 Tab #1 \~ Tab #3 的分頁，在 App.vue 裡會使用一個 router-view 來作為最上層頁面切換顯示使用，而在 NestedRoute.vue 裡也會放上一個 router-view 來作為 Nested Route 底下分頁的切換使用，這麼做的好處是可以使頁面有更好的結構，NestedRoute.vue 裡放 Tab #1 \~ Tab #3 共同的顯示部份， Tab #1 \~ Tab #3 彼此不同的顯示內容，獨立成各自的 view 元件去管理，然後 Nested Route 在藉由 router-view 來載入對應元件作顯示。

```javascript title="src/router/index.js"
...,
{ // Nested Route 的 Route 物件
  path: '/nested',
  name: 'nested',
  component: () => import('@/views/NestedRoute.vue'),
  children: [
    { // Tab #1 的 Route 物件
      path: 'first',
      name: 'tab-first',
      component: () => import('@/components/nested/TabOne.vue')
    },
    { // Tab #2 的 Route 物件
      path: 'second',
      name: 'tab-second',
      component: () => import('@/components/nested/TabTwo.vue')
    },
    { // Tab #3 的 Route 物件
      path: 'third',
      name: 'tab-third',
      component: () => import('@/components/nested/TabThree.vue')
    }
  ]
},
...
```

為了達成這樣效果，我們需要在 router 的設定檔裡面，對有 Nested Route 顯示需求的 Route 物件使用 children 屬性，在 children 屬性裡，設定下一層元件所需載入的 Route 物件。

在上述 router 的設定所作出來的結果，當使用者切換到 Nested Route 頁面時，只會顯示 NestedRoute.vue 裡面既有的 router-link 元件和 router-view 元件，但 router-view 並不會載入 Tab #1 \~ Tab #3 的內容，所以 router-view 顯示為空，只有當使用者在點擊 Nested Route 頁面下的 router-link 後，Nested Route 頁面下的 router-view 才為顯示對應的 Tab 內容。

```javascript title="src/router/index.js"
...,
{
  path: '/nested',
  name: 'nested',
  component: () => import('@/views/NestedRoute.vue'),
  // 格式可以是 path string, path object 或者會回傳 path 的 function
  redirect: { name: 'tab-first' },
  children: [
    ...
  ]
},
...
```

如果要達成在當使用者進到 Nested Route 頁面時，底下的 router-view 就載入 Tab #1 的話，須在 router 設定使用 redirect，讓路由進到 <mark>/nested</mark> 時，導向至 <mark>/nested/first</mark> 做顯示。

可以藉由在不同層級的 Route 物件上使用 children 屬性，來達成不只兩層的 Nested Route。

```html title="src/App.vue"
...
<router-link
  class="page-link"
  :to="{name: 'nested'}"
  <!-- 對 class 屬性進行設定，讓上層 router-link 在路由是在下層頁面時，也能夠有 exact active 的效果 -->
  :class="{'link-exact-active': ['nested', 'tab-first', 'tab-second', 'tab-third'].includes($route.name)}"
>
  Nested Route
</router-link>
...
```

在下層的 router-view 顯示時，同一層對應的 router-link 會有 exact active 的效果，但路徑上層的 router-link 則不會有，以範例為例，Tab #1 開啟時，只有 Tab #1 的 router-link 會有 exact active 的效果，上層的 Nested Route 的 router-link 則不會有，要達成上層的 router-link 也有 exact active 的效果，這時候需要對上層 router-link 的 class 屬性進行手動設定，設定其在下層路由開啟時，也有 exact active 的 class。目前這部份的功能需求還在rfc裡面，因此，只能藉由這樣的方法，讓上層的 router-link 在下層的 router-link 是 exact active 時，也有 exact active 的效果。

---

參考資料：

- [Nested Routes | Vue Router](https://router.vuejs.org/guide/essentials/nested-routes.html)
- [Redirect and Alias | Vue Router](https://router.vuejs.org/guide/essentials/redirect-and-alias.html)
- [RFC: 0028-router-active-link](https://github.com/vuejs/rfcs/blob/master/active-rfcs/0028-router-active-link.md#unrelated-but-similiar-routes)
