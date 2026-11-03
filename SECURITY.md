# Sakefolio security policy / セキュリティ運用方針

This repository contains an **experimental React application** using user-owned Google Drive and Google Sheets. Passing CI does not prove the absence of vulnerabilities. Before production release, two real Google accounts must be used to test isolation.

## Threat model

Protected assets: Google OAuth access tokens held temporarily in the browser; private sake reviews, Google Sheets, and label photos owned by each user.

Trust boundaries:
- Static website is publicly reachable through GitHub Pages. **Never embed a secret or refresh token** in bundled code, GitHub Actions variables, logs, or client-side storage.
- Requests use Google Identity Services and a short-lived access token with only `https://www.googleapis.com/auth/drive.file`.
- The app does not receive blanket access to a user's Google Drive. It may read/change/delete files the user has individually authorized and files created through the app.
- All user records are kept in the Google account that granted the token. Do not share Drive permissions programmatically.
- Third-party dependencies, the Google Identity Services JavaScript, browser extensions, and phishing remain risks even with CSP.

## Controls implemented

- `web/index.html` includes a restrictive CSP meta tag. It allows Sakefolio assets and Google's required OAuth, Drive, Sheets, and font endpoints. No inline application scripts, arbitrary origins or eval are allowed.
- **GitHub Pages cannot configure application-specific HTTP response headers.** A meta CSP cannot enforce `frame-ancestors`, HSTS, or all response-only controls. Moving to a free static host supporting `_headers` (e.g. Cloudflare Pages) allows stronger protection without introducing a database or backend.
- Token stays in React memory and is not persisted in `localStorage`, `sessionStorage`, or user cookies. The UI shows the actual Google account returned by Drive `about.get`.
- Drive API files and folders are tagged with private app-specific `appProperties`, not identified by name alone. When duplicate tagged storage locations exist, the app refuses to guess.
- Existing, non-empty spreadsheet headers are checked before write; unexpected changes stop the operation.
- Input strings are bounded; dates and star ratings validated; Sheets writes use `valueInputOption=RAW` to avoid interpreting user text as spreadsheet formulas.
- Photo upload validates **file signature**, not just a browser-provided MIME type or extension. Only JPEG, PNG, WebP, HEIC, HEIF and AVIF; max 10 MiB. SVG and HTML are rejected. File names are generated with UUIDs.
- Recorded photo is not published via Drive sharing links. Photo fetch uses an authorized API request and creates a local `blob:` URL.
- All npm packages are pinned transitively in `web/package-lock.json`; CI uses `npm ci`, runs `npm audit --audit-level=high`, executes security validation tests, type-checks, and produces the site bundle. A high/critical npm advisory blocks deployment.
- CodeQL checks JavaScript/TypeScript on changes and weekly. Dependabot is configured for weekly npm and GitHub Actions updates (effective after configuration lands on default branch and corresponding GitHub security features are enabled).
- The PR build has read-only repository permissions. The production deploy job alone gets `pages:write` and `id-token:write`.

## Security verification

Run from `web/`:
```sh
npm ci
npm audit --audit-level=high
npm run test:security
npm run build
```

Before giving the app to a family member, complete **real account tests**:

1. User A authorizes and creates the storage folder, spreadsheet, review and label photo.
2. User B authorizes in a new browser profile and must see **only their own** empty/new records; A's files must not be accessible via B's token.
3. User A signs out and reconnects; same records and photos must reappear. B's data must never appear.
4. Verify an expired/revoked token cannot keep accessing Drive API, and UI requires renewed authorization.
5. Verify which account is displayed before saving; check Google account switching and multiple tabs.
6. Attempt SVG/XML/HTML masquerading as an image, oversize photos, malformed dates, formula-prefixed text, and markup in field inputs; ensure no arbitrary code executes.
7. Test interrupted network uploads and concurrent edits. The app currently has no transaction rollback, cross-tab lock, or deletion-recovery workflow.
8. Validate CSP in the production browser's developer tools alongside the Google OAuth popup. A passing build **does not** prove CSP compatibility.

## Known residual risks / limitations

- Browser client app can be compromised by XSS, a hostile extension, or upstream script supply-chain compromise. Google-issued tokens are short-lived but can be misused before expiry.
- Google OAuth and Drive API integration have not yet been tested using actual user accounts. No penetration test has been performed.
- Different app versions/OAuth client IDs may not see the same `appProperties`-tagged files. Keep the OAuth Client ID stable, and migrate older untagged prototype folders manually.
- The browser verifies common magic bytes, not full image decodability or antivirus scanning.
- Multiple Sheets/Drive writes are not atomic. Interrupted saves can leave incomplete rows or orphaned photos.
- Google Drive sharing controls still apply: if a user shares a file, people with that share permission may see it.
- GitHub Pages cannot set `frame-ancestors`, so clickjacking mitigation via response headers requires a different static host.
- User data deletion, export and restore workflows need implementation before general public release.

## Reporting

Report a security problem privately using [GitHub repository security advisories](https://github.com/ryotamatsuki/sakefolio/security/advisories), if enabled. Do not put live OAuth tokens, private Google Drive links, personal photos, or sensitive proof-of-concept data in public issues.
