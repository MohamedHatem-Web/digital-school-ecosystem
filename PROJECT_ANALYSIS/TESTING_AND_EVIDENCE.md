# Testing and Evidence

## 1. Existing tests
The repository contains one substantive validation script:
- `scripts/run-tests.js`

This script performs:
- JavaScript syntax validation across the project
- ES module import/export integrity checks
- HTTP 200 checks for major pages
- Firebase Authentication sign-in checks against live demo accounts

## 2. Current evidence
The script was executed successfully in this environment and reported:
- 66 / 66 tests passed

This demonstrates that the static app serves correctly and that the configured Firebase Auth project accepts the demo credentials used by the app.

## 3. What the existing tests do not cover
The script does not validate:
- Firestore write/read correctness beyond login provisioning
- critical business workflows such as attendance saving, grade creation, or device assignment end-to-end
- role separation beyond login acceptance
- multi-school isolation under real tenant conditions
- Cloudflare Worker security or Cloudinary upload success in production
- security rule enforcement under simulated malicious or unauthorized requests
- production-level data consistency or migration safety

## 4. Evidence quality assessment
The evidence is strong for front-end availability and Firebase account readiness. It is not strong enough to claim that the core school operations are fully valid in production conditions.

## 5. Important caveat
The tests are evidence of a functioning demo environment, not a proven school operations platform. Several workflows are seeded and fallback-based, and many service modules behave as if demo data is always available.

## 6. Additional evidence used for this analysis
The assessment also relied on source inspection of:
- `js/auth.js` and `js/router-guard.js`
- `js/services/*.js`
- `firestore.rules`
- `cloudflare-worker/worker.js`
- `js/config.js`

This gives a grounded code-level picture of the actual project status.
