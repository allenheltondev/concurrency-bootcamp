# Vendored `@readysetcloud/ui` nav (for the static course pages)

The course pages are plain static HTML/JS and can't import the React
`<AppNav>`, so they use the package's framework-agnostic browser build. These
files are vendored (rather than loaded from a CDN) because the course pages are
offline-first PWAs — everything the nav needs must be same-origin and precached
by each course's service worker.

| File | Source | Notes |
| --- | --- | --- |
| `rsc-nav.global.js` | `@readysetcloud/ui` → `dist/browser/nav.global.js` | Verbatim copy. Exposes `window.rscNav.mountAppNav(...)`. |
| `assets/cloud-logo.svg` | `@readysetcloud/ui` → `assets/cloud-logo.svg` | Verbatim copy. The nav brand mark (CSS mask). |
| `rsc-nav.css` | **generated** by `tools/build-nav-css.mjs` | The package's tokens + component styles, scoped so they can only touch `.app-nav` / `.app-launcher-modal` / `.profile-menu-modal` and never collide with a course's own design system. |

`js/account.js` loads these (only once accounts are enabled) and mounts the nav.

## Updating to a new package version

```sh
npm pack @readysetcloud/ui@<version>          # or copy from the installed package
tar xzf readysetcloud-ui-<version>.tgz
cp package/dist/browser/nav.global.js  js/vendor/rsc-nav.global.js
cp package/assets/cloud-logo.svg       js/vendor/assets/cloud-logo.svg
node tools/build-nav-css.mjs package/styles js/vendor/rsc-nav.css
```

Then bump each course's service-worker `CACHE` constant so clients pick up the
new build.
