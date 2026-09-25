# Building Dad League with Capacitor

This guide explains how to export **Dad League** from AI Studio, set it up on GitHub, and build native iOS and Android apps using Capacitor.

---

## 1. Exporting Dad League to GitHub

You do not currently have a GitHub repository connected directly in this container, but you can export it in seconds:

### Option A: 1-Click Export in AI Studio UI (Easiest & Recommended)
1. In the top navigation bar / header of **Google AI Studio**, look for the **GitHub icon** or the **Export** button (also found under the **"..."** project settings menu).
2. Click **Export to GitHub** (or **Sync to GitHub**).
3. Authorize your GitHub account if prompted.
4. AI Studio will automatically create a new GitHub repository (e.g. `your-username/dad-league`) containing the entire project with all code, icons, manifest, and assets.

### Option B: Using Git Command Line (From your PC / Steam Deck)
If you clone or download your files:
```bash
git init
git add .
git commit -m "Initial commit of Dad League with Capacitor & App Store compliance"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/dad-league.git
git push -u origin main
```

---

## 2. Pre-Configured Capacitor Files

Your repository is already pre-configured for Capacitor:
- **`capacitor.config.json`**: Pre-configured with App ID `com.dadleague.app`, App Name `Dad League`, and web bundle dir `dist`.
- **`assets/icon.png`** & **`assets/splash.png`**: High-resolution 1024x1024 icons ready for automated iOS asset generation.
- **`package.json`**: Pre-installed with `@capacitor/core` and `@capacitor/cli`.

---

## 3. How to Build & Run with Capacitor

Once you clone your repository to your computer:

```bash
# 1. Install dependencies
npm install

# 2. Add the iOS and Android platforms
npm install @capacitor/ios @capacitor/android
npx cap add ios
npx cap add android

# 3. Generate native app icons & splash screens across all iOS/Android sizes
npx @capacitor/assets generate

# 4. Build your web app bundle and copy assets to native projects
npm run cap:sync
# (which runs "vite build" followed by "npx cap sync")
```

---

## 4. Opening in Xcode (For Apple App Store)

> **Note for Windows / Steam Deck users:**  
> Apple requires macOS and Xcode to produce the final `.ipa` archive and submit to App Store Connect. You have two easy choices:
> 1. **GitHub Actions (Free Cloud Mac):** You can use a free GitHub Actions workflow (`runs-on: macos-latest`) to build the iOS archive right in GitHub without needing a Mac!
> 2. **A Mac or Borrowed Mac:** Once the code is in GitHub, open it on any Mac:
>    ```bash
>    npx cap open ios
>    ```
>    Xcode will open `App.xcworkspace`. Select your Apple Developer Team in **Signing & Capabilities**, plug in your iPhone (or select "Any iOS Device (arm64)"), and click **Product → Archive** to publish to TestFlight!

---

## 5. Live App Store Links Included
- **Privacy Policy:** `https://YOUR_APP_URL/privacy` (also at `/privacy-policy.md`)
- **Terms of Service:** `https://YOUR_APP_URL/terms` (also at `/terms-of-service.md`)
- **In-App Account Deletion:** Available under **Account Settings → Delete Account** (Guideline 5.1.1(v) compliant).
