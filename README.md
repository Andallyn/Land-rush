# Murmur

Murmur is a private, decentralized voice memo app for iOS and Android. It is built with React Native and Expo, has no backend server, encrypts recordings on-device, and stores encrypted blobs on the Sia decentralized storage network.

## Architecture

- **Client only:** the app contains all recording, encryption, upload, discovery, and playback logic.
- **Audio capture:** `expo-av` records microphone input directly to AAC/M4A (`.m4a`, AAC, 44.1 kHz mono, 128 kbps).
- **Encryption:** audio bytes are encrypted before upload with AES-256-GCM using `@noble/ciphers`.
- **Key derivation:** the user's passphrase is stretched with PBKDF2-HMAC-SHA256 at 210,000 iterations. The derived 256-bit key is stored in iOS Keychain / Android Keystore via `expo-secure-store`; the passphrase is never stored.
- **Optional biometric unlock:** Face ID, Touch ID, or fingerprint can protect access to the stored derived key where the device supports enrolled biometrics.
- **Sia storage:** Murmur uses the official React Native Sia SDK binding (`react-native-sia`) for iOS/Android. The API mirrors `@siafoundation/sia-storage` (`Builder`, `PinnedObject`, `upload`, `pinObject`, `objectEvents`, `download`). `@siafoundation/sia-storage` is also pinned in the project for parity with the browser/WASM SDK, but the native binding is required for mobile runtime compatibility.
- **Local persistence:** only memo metadata is stored in AsyncStorage: Sia object ID, title, timestamp, duration, MIME type, and encrypted size. Plaintext audio is not stored locally after capture.

## Configure Sia

Set the Sia indexer URL before starting Expo:

```bash
EXPO_PUBLIC_SIA_INDEXER_URL=https://sia.storage npm start
```

The URL must use HTTPS. Murmur opens the Sia authorization URL in the system browser. After approval, tap **Complete** in the app; Murmur registers with the indexer, stores the Sia app key in secure storage, and shows a Sia recovery phrase. Save that phrase securely.

During upload Murmur:

1. Creates a `PinnedObject`.
2. Attaches JSON metadata containing the memo title, timestamp, duration, MIME type, and crypto suite.
3. Uploads only the encrypted JSON envelope as bytes.
4. Calls `pinObject()` so the recording appears in the user's indexer object event stream.

During sync Murmur consumes `objectEvents(cursor, limit)` incrementally. This is the current SDK event-stream API used for the indexer's listable pinned objects.

## Encryption and playback

1. The user enters a passphrase with at least 12 characters.
2. Murmur derives a 32-byte AES key with PBKDF2-HMAC-SHA256 using 210,000 iterations and a public Murmur domain-separation context.
3. The derived key is stored in Keychain/Keystore with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`; optional biometric protection can be enabled.
4. Each memo uses a fresh 96-bit AES-GCM nonce and authenticated data bound to the memo timestamp and MIME type.
5. The encrypted object contains a JSON envelope with the nonce, MIME type, timestamp, and ciphertext. Sia object metadata contains only listable memo metadata.
6. Playback downloads the encrypted object, decrypts it in memory, and passes a `data:` URI to `expo-av`. Murmur does not write plaintext playback audio to disk.

> Note: mobile OS recorders create a transient local M4A file while the microphone session is active. Murmur reads it once, encrypts the bytes, and deletes that file in a `finally` block before uploading. Playback plaintext is never written to disk.

## Run on iOS and Android

Install dependencies:

```bash
npm install
```

Start Metro:

```bash
npm start
```

Because the Sia SDK uses native modules, build a development client or prebuild native projects:

```bash
npm run prebuild
npm run ios
npm run android
```

Run TypeScript checks:

```bash
npm run typecheck
```

## Security assumptions and threat model

Murmur is designed for a user who trusts their own device OS, secure enclave/keystore implementation, Expo/RN runtime, and Sia indexer authorization flow.

Protected against:

- Sia storage providers reading memo audio: they receive encrypted blobs only.
- Silent memo alteration: Sia objects are immutable/content-addressed and AES-GCM authenticates ciphertext.
- Backend compromise: there is no Murmur backend server.
- Local app metadata disclosure of audio: only object IDs, titles, timestamps, and sizes are stored locally.

Not protected against:

- A compromised or jailbroken/rooted device that can read process memory during recording, encryption, or playback.
- Weak user passphrases; PBKDF2 slows offline guessing but cannot make a poor passphrase safe.
- A malicious OS audio subsystem during live recording.
- Indexer metadata visibility: titles and timestamps are intentionally listable through pinned object metadata so devices can discover memos.

Network requirements:

- Configure only HTTPS Sia indexer URLs. Modern iOS and Android networking stacks negotiate TLS; deploy the indexer with TLS 1.3 enabled and disable legacy TLS versions at the server/load-balancer layer.
- Storage-provider traffic is handled by the Sia SDK.

Dependency and audit cadence:

- Dependencies are pinned exactly in `package.json` and locked in `package-lock.json`.
- Run `npm audit` and review Expo/Sia release notes before each release, and at least monthly for active deployments.
- Re-run `npm run typecheck`, iOS build, and Android build after dependency updates.
