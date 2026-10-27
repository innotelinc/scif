# iOS CallKit / PushKit integration scaffold

This Swift file is a starting point and is not yet a registered, tested Capacitor plugin. Add it to the generated iOS target after `npx cap add ios`; wire plugin registration using the Capacitor version's native plugin registration flow, and forward `incomingCall`, `callAnswered`, `callEnded`, and `voipToken` events to the UI/backend.

Before accepting calls:

- Add Push Notifications and Background Modes > Voice over IP capabilities to the app target and configure the APNs VoIP environment/entitlements.
- Use the APNs VoIP service and a server-side provider token. Keep APNs signing keys only in protected CI/backend secrets, never in the app.
- Verify caller authorization, call-ID/UUID validity, nonce/expiry and replay protection server-side. Keep push payloads minimal and avoid message content.
- Add encrypted signaling and media, call lifecycle, cancellation, timeout, microphone permissions, audio-session configuration, and network-loss behavior. The sample's `answerCall` must not be considered complete until it waits for authenticated media setup.
- Test on physical iPhones in foreground, background, terminated, locked, Low Power Mode, and revoked-notification states. Simulator tests do not establish real APNs VoIP delivery behavior.

PushKit/CallKit APIs and platform requirements change. Confirm current Apple requirements before distribution. This scaffold does not guarantee a locked-screen ring and is not suitable for emergency or classified communications.
