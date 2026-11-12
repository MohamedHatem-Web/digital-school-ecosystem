# Security Audit

## 1. Scope
This audit is based on the actual code in the repository and does not rely on the marketing claims in the project documentation.

## 2. Findings

### 1. Hardcoded Cloudinary credentials in server configuration
- File: `cloudflare-worker/worker.js`, `cloudflare-worker/wrangler.toml`
- Function / rule: `handleSignUpload()`, `handleDeleteMedia()`, and `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` config comments
- Risk: If the worker or config is exposed, these credentials could be abused to upload, replace, or delete media outside the intended application context.
- Severity: CRITICAL
- Recommendation: Move all secrets to Cloudflare encrypted secrets or a secure secret manager; never leave them in source or version-controlled config comments.

### 2. JWT verification is not cryptographically validated
- File: `cloudflare-worker/worker.js`
- Function: `verifyAuth()`
- Risk: The worker decodes the JWT payload and checks expiry, but it does not verify the signature against Firebase or the proper signing certificate. This means a forged or tampered token can pass validation if it includes the expected structure and claims.
- Severity: CRITICAL
- Recommendation: Use Firebase Admin SDK or a verified JWT library to validate the token signature and issuer/audience claims against the project configuration.

### 3. Client fallback uses a fake JWT string
- File: `js/services/cloudinary-service.js`
- Function: `uploadMediaImage()`, `deleteMediaImage()`
- Risk: The app creates a dummy JWT string when no real Firebase ID token is available, and sends it to the worker. This weakens request authentication and makes the security boundary dependent on trust rather than actual identity validation.
- Severity: HIGH
- Recommendation: Fail closed when no valid Firebase token is available instead of generating a dummy token.

### 4. Legacy file upload path was unused and has been removed
- Risk: The unused client service contained Data URL fallbacks that could appear to succeed without durable remote storage.
- Status: Removed. Student PDF and profile-image uploads remain unavailable.

### 5. User profile documents are broadly writable by authenticated users
- File: `firestore.rules`
- Rule: `match /users/{userId}`
- Risk: `allow create: if isAuthenticated();` and a permissive update policy permit arbitrary user document creation and modification by any valid Firebase-authenticated account unless a stronger role check is added.
- Severity: MEDIUM
- Recommendation: Restrict user creation to trusted server-side flows and limit updates to the same user plus explicit role controls.

### 6. Public read access for school and CMS data is permissive
- File: `firestore.rules`
- Rule: `match /schools/{schoolId}` and `match /schools/{schoolId}/cmsContent/{contentId}`
- Risk: Public reads are allowed for the school profile and CMS content. This is not necessarily a vulnerability by itself, but it expands exposure if the content includes sensitive operational or personal information.
- Severity: LOW
- Recommendation: Separate public content from internal school metadata and consider limiting read access for some fields.

## 3. Additional observations
- The app caches a large amount of critical data in `localStorage`, which is not secure storage and can be manipulated by a user in the browser.
- Several services auto-populate default data and continue to operate in a local fallback mode, which is useful for demos but risky in production if stale data is trusted.
- The project includes strong rule intent but the runtime still depends on a static, paired set of browser-side assumptions rather than verified server-side enforcement.

## 4. Summary
The most critical weaknesses are in the cloud media gateway and token verification. The repository also shows several areas where security logic is present but not fully hardened. The application is functional as a demo, but it is not yet suitable for untrusted production deployment without a security reassessment.

## 5. Remediation Status (2026-11-12)
- Worker code now verifies Firebase RS256 signatures and project claims, loads roles from the caller's Firestore user document, enforces school scope, and fails closed when Cloudinary secrets are missing.
- Browser media code no longer sends dummy JWTs or stores failed uploads as Data URLs. The default Worker URL is disabled until the hardened Worker is deployed.
- Firestore user creation is denied from clients. Student reads are scoped to staff, the student, or a linked parent. PDF uploads are unavailable.
- **External action still required:** rotate the exposed Cloudinary API Secret, provision a least-privilege Firebase service account for Identity Platform account updates, add it as a Cloudflare secret, set the exact CORS origin, and deploy the Worker. Deploy Firestore rules with `firebase deploy --only firestore:rules --project digital-school-ecosystem`. These account-side actions cannot be completed from the repository.
- Public school-profile and CMS reads, browser local-storage data, and broader application authorization still require a production-focused review.
