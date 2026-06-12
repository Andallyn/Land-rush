import * as ExpoCrypto from 'expo-crypto';
import { gcm } from '@noble/ciphers/aes.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { AES_GCM_NONCE_BYTES, AES_KEY_BYTES, KDF_CONTEXT, PBKDF2_ITERATIONS } from '../config';
import type { EncryptedMemoEnvelope } from '../types';
import { base64ToBytes, bytesToBase64, bytesToString, stringToBytes } from './bytes';

export async function deriveMemoKey(passphrase: string): Promise<Uint8Array> {
  const normalized = passphrase.trim();
  if (normalized.length < 12) {
    throw new Error('Use a passphrase with at least 12 characters.');
  }

  return pbkdf2Async(sha256, normalized, KDF_CONTEXT, {
    c: PBKDF2_ITERATIONS,
    dkLen: AES_KEY_BYTES,
    asyncTick: 10,
  });
}

async function randomBytes(length: number): Promise<Uint8Array> {
  return ExpoCrypto.getRandomBytesAsync(length);
}

export async function encryptMemoAudio(params: {
  plaintext: Uint8Array;
  key: Uint8Array;
  mimeType: string;
  createdAt: string;
}): Promise<Uint8Array> {
  const nonce = await randomBytes(AES_GCM_NONCE_BYTES);
  const aad = stringToBytes(`murmur:${params.createdAt}:${params.mimeType}`);
  const ciphertext = gcm(params.key, nonce, aad).encrypt(params.plaintext);
  const envelope: EncryptedMemoEnvelope = {
    app: 'murmur',
    version: 1,
    algorithm: 'AES-256-GCM',
    nonce: bytesToBase64(nonce),
    mimeType: params.mimeType,
    createdAt: params.createdAt,
    ciphertext: bytesToBase64(ciphertext),
  };

  return stringToBytes(JSON.stringify(envelope));
}

export function decryptMemoAudio(encrypted: Uint8Array, key: Uint8Array): { bytes: Uint8Array; mimeType: string } {
  const envelope = JSON.parse(bytesToString(encrypted)) as EncryptedMemoEnvelope;

  if (envelope.app !== 'murmur' || envelope.version !== 1 || envelope.algorithm !== 'AES-256-GCM') {
    throw new Error('Unsupported Murmur memo envelope.');
  }

  const nonce = base64ToBytes(envelope.nonce);
  const aad = stringToBytes(`murmur:${envelope.createdAt}:${envelope.mimeType}`);
  const ciphertext = base64ToBytes(envelope.ciphertext);
  const bytes = gcm(key, nonce, aad).decrypt(ciphertext);

  return { bytes, mimeType: envelope.mimeType };
}
