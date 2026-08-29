# Apple Notes-style sidebar utilities

The live side panels use the shared `--cdx-dense-*` compatibility tokens in
`src/index.css`, configured for a comfortable native notes-style workspace.
This reference block shows the reusable classes without adding demonstration
content to the application.

```html
<nav aria-label="Workspace navigation">
  <h2 class="cdx-dense-header">Files</h2>
  <ul class="cdx-dense-list">
    <li>
      <a class="cdx-dense-row" href="/workspace/source">
        <span class="cdx-dense-label">Source control</span>
      </a>
    </li>
    <li>
      <a class="cdx-dense-row" href="/workspace/tasks">
        <span class="cdx-dense-label">Background tasks</span>
      </a>
    </li>
    <li>
      <button class="cdx-dense-micro" type="button" aria-label="Add item">
        <svg aria-hidden="true" viewBox="0 0 20 20"><!-- icon --></svg>
      </button>
    </li>
  </ul>
</nav>
```

Tailwind equivalents are `text-cdx-dense-sm`, `text-cdx-dense-xs`,
`text-cdx-dense-header`, `min-h-cdx-row-md`, and `min-h-cdx-row-sm`.
