# Sakefolio Security Release Gate — 2026-10-18

Current verdict: **NO GO** for inviting other users to connect Google accounts.

This file documents the additional security work in Draft PR #3. No change to `main` or `test/sakefolio-pages-preview` is implied by creating this file.

## Code-level safeguards

- V-01: cancel stale Google-account data loads on unmount/account switch, including completion of save/restore/backup operations; do not download a previous account's backup after a switch.
- V-02: re-encode new photos as PNG, stripping EXIF/XMP; re-encode images imported from offline backups before IndexedDB persistence. Existing stored photos are not retroactively scrubbed.
- V-03: distinguish confirmed Google revocation from failure and callback timeout.
- V-04: reuse a reserved private Drive photo file ID and immutable record ID when retrying uncertain writes. No distributed transaction exists and browser crash recovery is not complete.
- Photo hardening: read Drive metadata first; reject files that lack the Sakefolio marker, correct photo kind, safe MIME or expected app photo folder. Validate image magic bytes before rendering.
- Prevent silently importing an offline China backup into a connected Google account.

## Release blockers: mandatory independent verification

1. With *two authorised test Google accounts*, prove A -> B -> A isolation with deliberately delayed API reads, repeat logins, failed auth, multiple tabs and interrupted writes. Do not use other people's accounts without permission.
2. Inspect Google Cloud OAuth configuration, consent screen, actual granted scopes and allowed origins. Source code has drive.file but does not prove the live grant.
3. Perform real Drive/Sheets and image read/write/retry/revoke tests with disposable files; verify failures and orphan-photo diagnostics. No destructive testing on real user records.
4. Run genuine iPhone Safari tests including upload, refresh, token expiry and account switching.
5. V-05: move general public OAuth access to a dedicated browser origin. Another path under ryotamatsuki.github.io does not isolate IndexedDB or permissions.
6. Verify security headers on the final hosting response. `web/public/_headers` is prepared **only for future Cloudflare Pages-compatible hosting** and is **ignored by GitHub Pages**. Header-based CSP, frame-ancestors, nosniff, Permissions-Policy and HSTS must be confirmed over HTTPS before treating them as effective.
7. Review currently stored photos for EXIF; obtain approval before any migration or deletion. Build a safe mechanism to distinguish Japanese and China photos before diagnosing orphan files.
8. Obtain independent penetration testing and confirm up-to-date dependency auditing, CodeQL, functional regression testing, privacy notice and data export/deletion workflow.

Do not merge or deploy Draft PR #3 without an explicit approved release step and evidence of the required real-account checks. Zero vulnerabilities can never be guaranteed.


## Security audit fix-up (2026-10-19)

- Ported the verified `style-src-attr 'unsafe-inline'` CSP exception only for inline **styles**, retaining the restricted `script-src` directive. Recheck delivered CSP in a real browser.
- Added opt-in build flag `VITE_SAKEFOLIO_SECURITY_TEST=20261019`: namespaced Drive root `SAKEFOLIO_SECURITY_TEST_20261019`, workbook `SAKEFOLIO_SECURITY_TEST_20261019_Data`, app marker `sakefolio-security-test-20261019-v1`. **Never use this flag for ordinary deployment.**
- Default namespace remains `Sakefolio` / `Sakefolio_Data` / `sakefolio-react-v1`. Sandbox and normal builds cannot intentionally discover each other's app-marked files. New tests assert both pathways without actual Drive mutations.
- Intentionally **did not copy** the audit branch's full `google.ts`, because it contains a truncated portion relative to PR #3 and could drop retry/metadata validation logic.
- Pending before personal-Google OAuth signoff: Cloud Console origins/scopes, real Save/Read/Photo/Revoke in sandbox, browser CSP and iPhone Safari. On GitHub Pages, `_headers` does not apply; the shared-origin risk remains.
