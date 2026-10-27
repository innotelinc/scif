# SCIF Mobile

SCIF Mobile now includes one working service slice: accounts, contact lookup, and direct text messages encrypted in the app before they reach the API. The server stores message ciphertext envelopes, public keys, account metadata, and password verifiers. It cannot recover accounts when the user loses their passphrase. The client encrypts each message to both participants using Web Crypto ECDH P-256, HKDF-SHA-256, and AES-256-GCM.

This implementation is an early, **not independently audited** prototype. It is not appropriate for classified, emergency, or high-risk communications. It is not Signal protocol: no Double Ratchet, forward secrecy, post-compromise security, multi-device key management, audited recovery, group messaging, attachments, or reliable push delivery. Contact-key verification is first-use pinning in browser local storage; verify fingerprints with the peer through a separate trusted channel. Do not assume first contact identity until verified.

Calls, CallKit/VoIP PushKit, SMS/MMS, email, caller-ID masking, voice masking, voice authentication, Bluetooth messaging, and production-grade abuse defenses are not implemented. Those features are not presented as working in the app.

## Run the service locally

Requires Docker Compose and Node.js. From this directory:

```sh
Copy-Item .env.example .env
# Edit .env and set long random POSTGRES_PASSWORD and SCIF_JWT_SECRET values.
docker compose up --build -d
npm ci
npm run dev
```

The API listens on `http://localhost:8080`; the Vite app runs on `http://localhost:5173`. `APP_ORIGINS` in `.env` must include the exact app origin. For iOS, set `VITE_API_BASE_URL` to your public HTTPS API endpoint **before** `npm run build`, then `npx cap sync ios`. Never point a release build at localhost; a physical phone's localhost is the phone itself.

For deployment, place the API behind a maintained TLS reverse proxy, set `NODE_ENV=production`, set `API_BIND_ADDRESS=0.0.0.0` only when the host firewall restricts access to the proxy, restrict `APP_ORIGINS`, protect PostgreSQL with backups and access controls, rotate secrets, and monitor patch/security advisories. Keep `.env` out of Git. `SCIF_JWT_SECRET` signs one-day bearer tokens; resetting it invalidates all sessions. Database backups contain account metadata and ciphertext, not plaintext message bodies.

## API

- `POST /api/v1/register`, `POST /api/v1/login`
- `GET /api/v1/me`, `GET|POST /api/v1/contacts`
- `GET /api/v1/messages/:username`, `POST /api/v1/messages`
- `GET /healthz`

Registration wraps the ECDH private key locally with a key derived from the user's passphrase. The server separately stores an scrypt password verifier for API authentication. Losing the passphrase means losing the wrapped private key and unreadable historical messages. There is no server-side recovery path.

## TestFlight

GitHub Actions builds and uploads the iOS app on pushes to `main`. Set `VITE_API_BASE_URL` as a GitHub Actions **variable** to the public HTTPS API URL, such as `https://api.example.com/api/v1`, so it is embedded into the iOS client at build time. Signing secrets are `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_PRIVATE_KEY_BASE64`, and `IOS_TEAM_ID`. Test the backend from an actual mobile network before distributing; HTTPS, allowed origins, account creation, and two-device encryption tests must pass first.
