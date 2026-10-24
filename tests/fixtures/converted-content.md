What the WordPress converter writes for code blocks and footnotes (ticket 08),
in a Markdown file (shown by converted-content.astro).

```javascript title="src/router/index.js"
const routes = [{ path: '/nested' }]
```

```html
<router-view class="flex-grow" />
```

一[^1]，二[^2]。

- 清單裡的註腳[^3]

[^1]: 註一
[^2]: [註二](https://example.com/)
[^3]: 註三
