# 07 — UI, Pages and Template Port

Template (read-only, private): the `next-web-template-red-alert` Next.js template (`$T` below).
Base: Next 16.4 App Router · React 19 · TS strict · Tailwind 4 (`@theme` CSS) · npm · Node 22.
**Theme decision:** the full red-alert look is kept with all decorations (hazard stripes, HUD brackets, glow, grid backdrop).

## Routes
| Route | Group | Page | Plan |
|---|---|---|---|
| `/` | (dashboard) | Server Lobby | [04](04-feature-lobby.md) |
| `/resources` | (dashboard) | Resources Monitor | [03](03-feature-resources.md) |
| `/apps` | (dashboard) | Application Usage | [05](05-feature-app-usage.md) |
| `/watcher` | (dashboard) | User Watcher | [06](06-feature-user-watcher.md) |
| `/alerts` | (dashboard) | Rules + history | [10](10-feature-alerts.md) |
| `/settings` | (dashboard) | Password, retention, hostname, catalog, geo DB, channels | — |
| `/login` | (auth) | Sign in | [08](08-auth.md) |
| `/setup` | (auth) | First-run admin creation | [08](08-auth.md) |
| `/api/stream` | — | SSE | [01](01-architecture.md) |

## Side menu (`configuration/side-menu-navigation.ts`)
```
LOBBY            (LayoutGrid)
RESOURCES        (Activity)
APPLICATIONS     (BarChart3)
USER WATCHER     (ShieldCheck)
ALERTS           (Siren)       ← badge with firing count
── divider ──
SETTINGS         (Settings)
```

## Top bar changes
- **Kept:** breadcrumb, full-screen button, notifications (now wired to `alert_events`).
- **⌘K search:** repurposed to search Lobby items and pages instead of demo users and products.
- **Account menu:** shows "admin" with Change password and Sign out.
- **Activities panel:** removed (no equivalent data).
- **Added:** a collector status dot (green if the heartbeat is under 10 s old) and the host name.

## Template files: copy as-is
| From `$T` | Purpose |
|---|---|
| `styles/**` (all css + `fonts/` + `vendor-overrides/`) | tokens, decorations, fonts |
| `configuration/theme-fonts.ts`, `configuration/shell-appearance.ts` | fonts, shell classes |
| `components/primitives/*` **except** `icon-by-name.tsx`, `cover-image.tsx` | card, statistic-card, progress-bar, badge, status-indicator, table, button, form-*, empty-state, page-header, loading-indicator, static-alert, pagination, icon-circle, avatar, brand-icon |
| `components/charts/*` | Chart.js wrappers (line, bar, donut, pie, radar) |
| `components/data-grid/*` | login table |
| `components/interactive/*` | modal, slideover, tabs, dropdown, tooltip, toast, popover, copy button |
| `components/form-controls/validated-form.tsx`, `validated-input-field.tsx`, `searchable-select.tsx` | forms |
| `components/application-widgets/scrollable-area.tsx` | scroll containers |
| `components/page-sections/dashboards/shared/{dashboard-panel,metric-summary,change-indicator,chart-legend,period-tab-list,period-select,card-options-menu,segmented-distribution-bar}.tsx` | dashboard helpers |
| `utilities/{merge-class-names,join-class-names,read-theme-color,format-number,format-date}.ts` | helpers |
| `hooks/*` | click-outside, disclosure, media-query |
| `app/not-found.tsx` | 404 |

## Template files: copy and adapt
| From `$T` | Change |
|---|---|
| `components/layout-shell/application-shell.tsx` | remove `@/mock-data/{users,products,departments,notifications,activities}` imports; inject real search index + alerts |
| `components/layout-shell/top-bar.tsx` | remove activities panel + `@/types/activity`; add collector status + hostname |
| `components/layout-shell/notifications-panel.tsx` | replace `@/types/notification` with an `AlertEvent` type |
| `components/layout-shell/global-search.tsx` | search Lobby items + pages |
| `components/layout-shell/account-menu.tsx` | admin only; sign-out server action |
| other `components/layout-shell/*` (side-menu, breadcrumb-trail, brand-logo, …) | brand-logo → ServerLab mark |
| `components/page-sections/dashboards/shared/comparison-trend-chart.tsx` | remove demo-data import; accept points as props |
| `components/page-sections/authentication/{authentication-frame,sign-in-form}.tsx` | remove demo image/data; wire to login server action; drop "register"/social buttons |
| `components/page-sections/settings/device-history-section.tsx` | used only as a **reference** for Watcher row styling |
| `configuration/side-menu-navigation.ts`, `configuration/route-map.json` (+ `route-map.ts`) | rewrite for ServerLab routes (breadcrumbs depend on this) |
| `configuration/theme-identity.ts`, `app/layout.tsx` metadata | rebrand "Tailwise" → "ServerLab" |
| `app/(dashboard)/layout.tsx`, `app/(authentication)/layout.tsx` | keep structure; add session guard check |
| `next.config.ts` | keep `cacheComponents`; **remove** route-map redirects; add `serverExternalPackages: ['better-sqlite3']` |
| `package.json` | keep only needed deps (below) |
| `public/images/browsers/*` | only if the Watcher shows browser logos for web logins |

## Do NOT copy
`mock-data/`, `types/` (demo), all `*-data.ts`, `sample-record-lookups.ts`, `report-trend-series-data.ts`, `public/images/**` (36 MB) except browsers, `documentation/`, `scripts/`, `configuration/page-manifest*`, all demo routes and `page-sections/*` other than those listed above, `application-widgets/event-calendar*`, `icon-by-name.tsx`.

## Dependencies
- **Keep from the template:** `next`, `react`, `react-dom`, `tailwindcss`, `@tailwindcss/forms`, `@tailwindcss/postcss` (or turbopack), `@headlessui/react`, `@floating-ui/react`, `simplebar-react`, `sonner`, `chart.js`, `@tanstack/react-table`, `react-hook-form`, `zod`, `@hookform/resolvers`, `lucide-react`, `dayjs`, `clsx`, `tailwind-merge`, `xlsx` (CSV export; or replace with a small CSV writer).
- **Drop:** FullCalendar, TipTap, Leaflet, embla, lightbox, highlight.js, react-day-picker, react-dropzone, react-chartjs-2.
- **Add:** `better-sqlite3`, `drizzle-orm`, `drizzle-kit`, `systeminformation`, `dockerode`, `maxmind`, `@node-rs/argon2`, `chartjs-adapter-dayjs-4`, `tsx`, `tsup`, `vitest`.

## New components (not in the template)
| Component | Purpose |
|---|---|
| `charts/live-line-chart.tsx` | incremental Chart.js updates (see [03](03-feature-resources.md#new-component-livelinechart)) |
| `hooks/use-live-stream.ts` | shared EventSource with topic subscriptions |
| `lobby/lobby-card.tsx`, `lobby/lobby-item-form.tsx`, `lobby/source-badge.tsx` | Lobby |
| `apps/app-usage-row.tsx` | ranked bar row |
| `watcher/login-columns.tsx` | data-grid column defs |
| `alerts/rule-form.tsx` | alert rule editor |
| `shell/collector-status.tsx` | heartbeat dot |
