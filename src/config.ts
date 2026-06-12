export const APP_NAME = 'Murmur';
export const SIA_INDEXER_URL = process.env.EXPO_PUBLIC_SIA_INDEXER_URL ?? 'https://sia.storage';

export const MURMUR_APP_ID_HEX =
  'f0e1d2c3b4a5968778695a4b3c2d1e0f00112233445566778899aabbccddeeff';

export const PBKDF2_ITERATIONS = 210_000;
export const AES_KEY_BYTES = 32;
export const AES_GCM_NONCE_BYTES = 12;

// Public domain-separation context. It is not a secret; the passphrase provides secrecy.
export const KDF_CONTEXT = 'murmur:v1:voice-memo:aes-256-gcm';
