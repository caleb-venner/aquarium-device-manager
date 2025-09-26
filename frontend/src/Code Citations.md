# Code Citations (curated)

This file contains a short, curated list of external code snippets that
informed the implementation of frontend utilities (notably `escapeHtml`).
The repository previously contained a large, repeated export of fragmentary
matches which created noise and bloated the repository. That content has
been removed and replaced with this concise, useful attribution.

## escapeHtml — canonical example
Source: multiple open-source snippets (consolidated)

```ts
function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
```

## Attributions
- https://github.com/wyatt-herkamp/nitro_repo (MIT)
- https://github.com/gamelayers/pmog-chat (GPL-2.0)
- https://github.com/tokuhirom/64p.org-orig-orig (unknown)

Notes:
- The canonical snippet above is a consolidated, permissively-styled
  implementation suitable for our frontend usage. If any exact-file
  reproduction is required for licensing reasons, consult the original
  upstream links listed above.
```markdown
# Code Citations (curated)

This file contains a short, curated list of external code snippets that
informed the implementation of frontend utilities (notably `escapeHtml`).
The repository previously contained a large, repeated export of fragmentary
matches which created noise and bloated the repository. That content has
been removed and replaced with this concise, useful attribution.

## escapeHtml — canonical example
Source: multiple open-source snippets (consolidated)

```
function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
```

## Attributions
- https://github.com/wyatt-herkamp/nitro_repo (MIT)
- https://github.com/gamelayers/pmog-chat (GPL-2.0)
- https://github.com/tokuhirom/64p.org-orig-orig (unknown)

Notes:
- The canonical snippet above is a consolidated, permissively-styled
  implementation suitable for our frontend usage. If any exact-file
  reproduction is required for licensing reasons, consult the original
  upstream links listed above.

```
