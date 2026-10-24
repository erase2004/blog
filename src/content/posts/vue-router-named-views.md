---
title: "Vue Router - Named Views"
slug: "vue-router-named-views"
published: 2022-03-25T13:59:52+08:00
updated: 2022-04-06T13:32:32+08:00
categories: ["技術"]
tags: ["named-views", "vue", "vue-router"]
excerpt: "使用範例專案來講解 Vue Router 中，Named Views 的使用方法，以及可能的使用場景。"
draft: false
wordpressId: 255
---

參考範例：[https://github.com/erase2004/vue-router-demo](https://github.com/erase2004/vue-router-demo)

```html title="wp-unconverted: core/image"
<!-- wp:image {"align":"center","id":257,"sizeSlug":"large","linkDestination":"none"} -->
<div class="wp-block-image"><figure class="aligncenter size-large"><img src="https://aniya.moe/wp-content/uploads/2022/03/preview-1-1024x768.png" alt="頁面預覽" class="wp-image-257"/><figcaption>頁面預覽</figcaption></figure></div>
<!-- /wp:image -->
```

```html title="wp-unconverted: core/image"
<!-- wp:image {"align":"center","id":258,"sizeSlug":"full","linkDestination":"none"} -->
<div class="wp-block-image"><figure class="aligncenter size-full"><img src="https://aniya.moe/wp-content/uploads/2022/03/Untitled-Diagram.drawio-1.png" alt="頁面結構" class="wp-image-258"/><figcaption>頁面結構</figcaption></figure></div>
<!-- /wp:image -->
```

在一個顯示元件下，可以同時存在不只一個 router-view 元件，為了能夠讓目標顯示內容，顯示在指定的 router-view 上，這時候可以給個別的 router-view 設定不同的 name 屬性值，並且在元件要顯示時，指定要顯示的 router-view。因為該元件有多個 router-view，又 router-view 可以被指定要顯示的內容，可以把該元件當作一個可重複使用的模板元件，讓類似顯示結構的頁面都使用該元件，並設定好要顯示的內容。

```html title="src/App.vue"
...
<div class="flex flex-grow md:flex-row flex-col flex-nowrap">
  <router-view class="flex-grow" />
  <router-view
    name="SubviewOne"
    class="flex-grow"
  />
  <router-view
    name="SubviewTwo"
    class="flex-grow"
  />
</div>
...
```

這是 App.vue 裡一部分的 template 結構，當中有三個 router-view，其中有兩個 router-view 有手動設定 name 屬性值，其實，router-view 在未手動設定 name 屬性值的情況下，其會使用預設值 <mark>default</mark> 作為屬性值。

```javascript title="src/router/index.js"
...
import MultiComponentOne from '@/components/multiple/ComponentOne'
import MultiComponentTwo from '@/components/multiple/ComponentTwo'

const routes = [
  ...,
  {
    path: '/multi/first',
    name: 'multi-first',
    components: {
      SubviewOne: MultiComponentOne,
      SubviewTwo: MultiComponentTwo
    }
  },
  ...
]
```

在 Multi View #1 這個頁面底下，為了滿足 App.vue 底下的 router-view 顯示指定的內容的需求，我們在 router 的設定裡，對 Multi View #1 的 router 物件設定 componenets 屬性，並在當中指定對應的 key-value pair，key 所代表的是指定的 router-view 的 name，value 則是所要呈現的顯示元件。由於 SubviewOne 指定為 MultiComponentOne，SubviewTwo 指定為 MultiComponentTwo，在進到 Multi View #1 的頁面時，router-view (name: SubviewOne) 的部份就會顯示 MultiComponentOne 的內容，而 router-view (name: SubviewTwo) 的部份則會顯示 MultiComponentTwo 的內容。

App.vue 底下還有一個未手動設定 name 屬性值的 router-view (name: default)，在 Multi View #1 路由的設定也為對其指定要顯示的元件，因此，在進到 Multi View #1 頁面時，該 router-view 則不會有顯示內容。

```javascript
{
  path: '/',
  name: 'home',
  component: () => import('@/views/HomePage.vue')
}
```

```javascript
{
  path: '/',
  name: 'home',
  components: {
    default: () => import('@/views/HomePage.vue')
  }
},
```

由於 router-view 的 name 預設值是 default，其實上述兩種 route 物件的寫法是可以產生相同效果的。
