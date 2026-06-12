export type MemoRecord = {
  objectId: string;
  title: string;
  createdAt: string;
  durationMillis?: number;
  encryptedSize?: number;
  mimeType: string;
};

export type MemoObjectMetadata = {
  app: 'murmur';
  version: 1;
  objectType: 'voice-memo';
  title: string;
  createdAt: string;
  durationMillis?: number;
  mimeType: string;
  crypto: {
    algorithm: 'AES-256-GCM';
    kdf: 'PBKDF2-HMAC-SHA256';
    iterations: number;
  };
};

export type EncryptedMemoEnvelope = {
  app: 'murmur';
  version: 1;
  algorithm: 'AES-256-GCM';
  nonce: string;
  mimeType: string;
  createdAt: string;
  ciphertext: string;
};

export type CapturedAudio = {
  bytes: Uint8Array;
  durationMillis?: number;
  mimeType: string;
};

export type SiaConnectionState = 'disconnected' | 'authorizing' | 'connected';
