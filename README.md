# SCIF mobile prototype

SCIF is a Capacitor web application scaffold for iOS and Android. This repository contains a polished UI prototype, device speech dictation (where supported), Capacitor push registration, and setup notes for native incoming-call integration. It is **not a secure communications product yet** and must not be used for classified, emergency, or sensitive communications.

## Run the web prototype

```sh
npm install
npm run dev
```

## Create native projects

Install Xcode on macOS for iOS builds; Android Studio and its SDK are needed for Android builds.

```sh
npm run build
npx cap add ios
npx cap add android
npx cap sync
npx cap open ios
npx cap open android
```

The repository environment used to scaffold this project is Windows. iOS compilation and signing require macOS with Xcode. `.github/workflows/testflight.yml` builds and uploads the current prototype to TestFlight on pushes to `main` that change `scif/**`, or by manually starting the workflow in GitHub Actions. This workflow does not add CallKit/PushKit to the generated iOS target; incoming calls are not implemented by the uploaded build.

### GitHub Actions setup for TestFlight

Push this repository to GitHub, then configure these repository Actions secrets:

- `ASC_KEY_ID`: App Store Connect API key ID.
- `ASC_ISSUER_ID`: App Store Connect API issuer ID.
- `ASC_PRIVATE_KEY_BASE64`: Base64-encoded `.p8` private key. Keep it in GitHub Secrets, never in the repository.
- `IOS_TEAM_ID`: Apple Developer Team ID.

Optional repository Actions variable:

- `IOS_BUNDLE_ID`: registered App ID / bundle identifier. Defaults to `com.scif.privatecomms`; it must be registered in the Apple Developer account and match the App Store Connect app record.

Create an App Store Connect API key with permissions appropriate for uploading builds, and make sure the account has access to the app. Automatic signing must be permitted for the team. After the workflow succeeds, Apple processes the uploaded build before it appears in TestFlight. Add testers and complete required beta app metadata in App Store Connect. No Apple credentials should be sent in chat or committed to source.

The current workflow packages the web prototype only. The local Swift CallKit file is not wired into the generated Capacitor Xcode project, and push entitlements, VoIP push, Android call handling, and secure communications services are not finished.

## Incoming calls on locked phones

The Capacitor Push Notifications plugin registers for remote notifications, but it does not implement VoIP calling or CallKit. For iOS, add a maintained native CallKit/PushKit Capacitor plugin or a native Swift plugin, enable the Push Notifications and Background Modes > Voice over IP capabilities, register PushKit with APNs VoIP push, and report incoming calls to `CXProvider` promptly. A backend must authenticate the caller, issue VoIP pushes, and connect an encrypted media session. Do not use ordinary alert push as a substitute for VoIP push or CallKit. iOS may throttle or reject misuse of VoIP pushes.

Android needs a native call-notification implementation using the platform's Telecom/ConnectionService or a full-screen call notification with user-granted notification permissions, plus FCM and a backend. OEM background restrictions and Android version behavior require physical-device testing.

Push payloads should contain only opaque call IDs and minimal routing metadata; never put message bodies, credentials, or keys in push notifications. The client should fetch authenticated call details after wake.

## Voice recognition and authentication

The **Dictation** control uses the Web Speech API when available. OS/browser speech services can send audio to a provider; the UI warns users and discourages secrets. It is for composing text only.

Do not use voice matching as the sole authentication or account-recovery factor. Recorded/replayed speech, synthesized voices, noisy environments, and accessibility problems make speaker recognition unsuitable as a passkey replacement. Use platform biometrics/passkeys for user presence and authentication, and server-side cryptographic challenge-response with anti-replay controls for account/session authorization. Store no raw voiceprints in the web app.

## Security status

The chat, call, email, attachment, and contact surfaces are mock UI only. There is no messaging backend, S/MIME or end-to-end key management, call signaling/media encryption, mail transport, MMS transport, SMS integration, or Bluetooth messaging in this scaffold. Labels in the UI are illustrative and do not indicate enforced encryption. SMS/MMS and carrier calls are not end-to-end encrypted by this app. Wi-Fi/Bluetooth are transports, not security guarantees. A production release needs a reviewed protocol, key verification and recovery design, authenticated backend, secure native storage, abuse handling, and independent security review.

Never commit Apple certificates, provisioning profiles, APNs private keys, signing secrets, or production credentials. Use local keychain/CI secrets and least-privilege access. Credentials are not needed for this scaffold.
