# Teja App Store — no-card hosting

A public APK-only Android app catalog. Visitors never sign in. Only the admin can publish. The public action is labelled **Install** and downloads an APK; Android may require user confirmation and permission to install from this source. No website can silently install an APK.

## Services
- Cloudflare Pages: static frontend (free `pages.dev` domain)
- Cloudflare Workers: API (free `workers.dev` domain)
- Firebase Authentication: admin email/password
- Firebase Firestore: public app metadata
- GitHub Releases: public APK, logo and screenshots; 2 GiB per release asset limit (this uploader is limited to 90 MiB per file)

No home server and no payment card for these services' normal free-tier signups. Free plans have usage limits and can change. GitHub Releases is subject to GitHub's acceptable use policies.

## 1. GitHub
1. Create a **public** repository named `teja-app-store-files`.
2. GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token. Give it access only to `teja-app-store-files`, with **Contents: Read and write**. Keep it secret.
3. Record your GitHub username/repository and token. Never place token in frontend files or git.

## 2. Firebase
1. Firebase Console → Add project (Spark plan).
2. Build → Authentication → Sign-in method → enable **Email/Password**.
3. Authentication → Users → Add user. This is the **only admin**.
4. Copy this user's **UID** from the Firebase Users table.
5. Firestore Database → Create database. Select a region and start in production mode.
6. Firestore → Rules → paste contents of `firebase/firestore.rules` and publish. These rules permit public reading of published apps, but **no direct client writes**. Writes happen only through the protected Worker using Firestore REST and a Firebase admin service account.
7. Project settings → General → Your apps → Add web app. Copy `apiKey`, `authDomain`, `projectId`, `appId`.
8. Project settings → Service accounts → Generate new private key. This contains secrets; never upload it to a public repository. Extract `client_email` and `private_key` for Worker secrets.

## 3. Worker backend
1. Sign up at Cloudflare, go to Workers & Pages → Create → Worker.
2. Install Node.js locally for deployment, then run `cd worker`, `npm install`, `npx wrangler login` and `npx wrangler deploy`.
3. Run these commands in `worker/` to set secrets, one at a time (paste the value when prompted):
   - `npx wrangler secret put GITHUB_TOKEN`
   - `npx wrangler secret put GITHUB_OWNER`
   - `npx wrangler secret put GITHUB_REPO`
   - `npx wrangler secret put FIREBASE_PROJECT_ID`
   - `npx wrangler secret put FIREBASE_API_KEY`
   - `npx wrangler secret put ADMIN_UID`
   - `npx wrangler secret put FIREBASE_CLIENT_EMAIL`
   - `npx wrangler secret put FIREBASE_PRIVATE_KEY` (paste the entire PEM including BEGIN/END lines; escaped `\n` also works)
   - `npx wrangler secret put ALLOWED_ORIGIN` (e.g. `https://teja-app-store.pages.dev`)
4. Run `npx wrangler deploy` again. Copy your worker URL (`https://...workers.dev`).
5. The Worker uses Firebase Identity Toolkit to validate admin ID tokens and checks the exact Firebase UID, not just an email address. It uses Google OAuth service-account signing to write Firestore through its REST API. GitHub tokens remain only in Worker secrets.

## 4. Frontend
1. Edit `site/config.js` with your Firebase web config and Worker URL. This Firebase **web API key is public** and safe to include; do not put service-account keys here.
2. Cloudflare → Workers & Pages → Create → Pages → upload assets → upload the **contents** of `site/` (not the outer folder). Cloudflare provides a free `.pages.dev` URL.
3. If your Pages domain differs from `ALLOWED_ORIGIN`, update the Worker secret and redeploy.
4. Open `/admin.html`, sign in with the one Firebase admin account, and upload your first app.

## Admin workflow
- Fill app name, description, category, version, select logo, optional screenshots and APK, then Publish.
- Images are uploaded as release assets on GitHub, with public URLs. APK is a public GitHub release asset. The app listing is written to Firestore only after the upload succeeds.
- Edit text, category, version, and screenshots by uploading a new release. For updates, create a new app listing and delete the old one; this starter does not overwrite existing releases.
- Delete listing removes Firestore entry, but does not delete GitHub assets. You can remove old releases in GitHub.
- AAB is not part of this website. Visitors see only **Install** for APK.

## Limits and important safety
- Maximum **90 MiB per file** in this uploader (Workers Free request limits vary by account; if requests fail, upload via GitHub Releases manually and publish with a smaller APK).
- The browser uploads each file separately to the Worker. File uploads must be kept within your Cloudflare plan's request-size and CPU limits. A larger-file uploader would need a different architecture.
- GitHub public release assets can be downloaded by anyone. Never upload confidential APKs or signing keys.
- APK must be a signed release APK built by you. The Install action downloads the APK; Android prompts the user to open/install it, subject to device security settings.
- Firebase/Cloudflare/GitHub free tiers have quotas. This is a starter implementation; perform security review and real deployment tests before public promotion.
- The admin account is created manually in Firebase, never through public registration. The frontend includes no user login.

## Local preview
You can preview `site/` with `python -m http.server 8000` (from `site/`) but the website is hosted in Cloudflare after deployment, so your laptop can be turned off.
