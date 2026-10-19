# PR #3 security retest — 2026-10-20

## Decision

**NO GO.** PR #3 remains draft and unmerged. The code changes below pass local regression tests and the production build, but the updated branch has not been pushed, the hosted verification page is still running the earlier build, and several live checks cannot be completed against that build. No changes were made to `main`, PR #4, `test/sakefolio-pages-preview`, or existing Drive files.

## Findings and evidence

| Test | Result | Evidence |
|---|---|---|
| Chrome verification page access | **PASS for recognition only; live API test BLOCKED** | Chrome opened the requested sandbox URL and the DOM showed the sandbox-only banner. The current page is logged out and displays 0 records; its console has 0 matching redacted security-audit entries. No new live write was attempted. |
| Cross-tab logout vs. Google grant revocation | **FAIL observed in prior build; code fix added; live retest BLOCKED** | Root cause: each tab held its own in-memory token and logout only cleared the initiating tab. The earlier page has no retained `[Sakefolio security-test]` console records, so its revocation callback, other-tab token state, and request times cannot be reconstructed. New code sends a token-free `BroadcastChannel` logout/401 notice, aborts the other tab's active request, and correlates revoke request/callback, session-clear, and API status by event/request IDs and timestamps. Automated coverage passes. |
| Actual OAuth scope vs. Cloud Data Access | **BLOCKED — configuration update required** | App requests only `https://www.googleapis.com/auth/drive.file` and disables accumulated grants. The prior single-account consent record showed `drive.file`. Google Cloud Auth Platform > Data Access currently lists **0 scopes**; the Drive scope is available in the selector. The code/runtime scope and Cloud Console declaration are separate settings. No Cloud setting was changed. |
| Single-account sandbox Drive location and sharing | **PASS for the inspected metadata** | Read-only Drive metadata shows the `SAKEFOLIO_SECURITY_TEST_20261019` root and its `Photos` child are not shared; the inspected PNG is in that `Photos` folder and is also not shared. Permission metadata identifies only the owner. No Drive files were changed. |
| Photo `appProperties` | **BLOCKED for direct live evidence** | The Drive connector omits `appProperties` from its normalized metadata response even when requested. New app diagnostics now request `appProperties`, `parents`, `shared`, and permission roles and report redacted mismatch counts; this code is not yet deployed to the hosted verification URL. Unit tests validate marker, review ID, parent, and sharing checks. |
| Japanese/Chinese test records and Sheets reconciliation | **Prior single-account PASS retained; no new live write** | The updated test suite covers read-before-write reconciliation and prevents duplicate row/photo creation after a failed write or lost response. No new live Drive/Sheets data was written during this retest. |
| Timeout, lost response, retry and reload | **Automated PASS; Chrome fault-injection BLOCKED** | Regression tests cover network failure before a write, response loss after commit, upload-response loss, and reuse of stable review/photo IDs. Sandbox code now persists only a one-way content/account digest, spreadsheet ID, and retry IDs in a dedicated IndexedDB store; it never stores the record body, photo bytes, or OAuth token. A Web Lock plus an atomic IndexedDB journal prevents concurrent test-tab attempts from creating separate IDs. The available Chrome control API does not expose offline/throttling or request interception, and the hosted page is still the prior build. |
| Logout during save and multiple tabs | **Automated PASS; Chrome live retest BLOCKED** | The logout control remains available while busy, aborts the active request, clears local token state, and broadcasts a token-free signal. Tests cover the signal schema and lock behavior. The deployed URL does not contain this fix yet. |
| Google permission revocation and reauthentication | **BLOCKED for fresh live evidence** | The current page is logged out and retained no redacted revoke/API audit events. New code distinguishes local logout from the asynchronous Google revoke callback; callback success is reported as request acceptance, not proof that all already-issued tokens stopped working immediately. |
| Google Cloud and browser security settings | **BLOCKED in part** | Cloud Data Access mismatch remains. Chrome extension “Allow access to file URLs” was reported enabled earlier. No Cloud OAuth setting was altered. |
| 2-account isolation and iPhone Safari | **BLOCKED / residual risk** | Only one Google account has been authorized. No B/A account isolation or iPhone Safari result is claimed. |
| Regression tests | **PASS** | `npm run test:security`: **116 passed, 0 failed**. |
| Build | **PASS** | `npm run build`: TypeScript check and Vite production build succeeded. The case-only `dashboardDrilldown.ts` filename collision on Windows was fixed by renaming the model file. |
| `npm audit --audit-level=high` | **BLOCKED** | The sandboxed request could not reach the npm advisory endpoint. An escalated retry was rejected by automatic review because it would send dependency metadata to `registry.npmjs.org`; no workaround was attempted. |
| CodeQL | **BLOCKED** | CodeQL is not installed locally. Pushing this branch would trigger the repository workflow that runs `npm audit`, so the branch was not pushed after the automatic review rejection. Existing PR head SHA has no workflow runs or status checks. |

## Required Google Cloud action

In the `sakefolio` Google Cloud project, open **Google Auth Platform → Data Access → Add or remove scopes**. Select Google Drive API scope `https://www.googleapis.com/auth/drive.file`, save, then re-open Data Access and confirm it appears under non-sensitive scopes. Do not add broader Drive scopes. This change was not made by the agent.

## Release gate

Keep **NO GO** until the revised PR branch can be pushed and its tests, build, CodeQL, and dependency audit complete; the updated sandbox build is available for Chrome retry/logout/photo-metadata checks; Cloud Data Access matches `drive.file`; and the existing two-account and iPhone Safari residual tests have owners/results. A successful revoke callback alone must not be used as evidence that an API request with an already-issued token immediately fails.
