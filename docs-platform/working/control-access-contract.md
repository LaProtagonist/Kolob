# Control routes — production access contract

`/control/*` and the legacy `/capex-configurator` alias are intentionally available only in the local Vite development build. The static SPA has no server-side authentication boundary, therefore the client must render these routes as 404 in a production build.

Before any production exposure, the reverse proxy must authenticate `/control/*`, `/capex-configurator`, `/leads` and `/api/leads*` before static SPA fallback. The existing `contact-server.mjs` already protects the lead reader with an HTTP-only cookie and server-side password; a future proxy integration may preserve that reader or map a separately authenticated `/control/requests` API. `noindex, nofollow`, sitemap exclusion and lack of public navigation are defense-in-depth only, not access control.

No control route may be deployed until this server-side guard is present and verified against an unauthenticated request.
