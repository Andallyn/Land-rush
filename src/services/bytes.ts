import { base64 } from '@scure/base';
import { bytesToUtf8, utf8ToBytes } from '@noble/ciphers/utils.js';

export function base64ToBytes(value: string): Uint8Array {
  return base64.decode(value);
}

export function bytesToBase64(value: Uint8Array): string {
  return base64.encode(value);
}

export function stringToBytes(value: string): Uint8Array {
  return utf8ToBytes(value);
}

export function bytesToString(value: Uint8Array): string {
  return bytesToUtf8(value);
}

export function bytesToArrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

export function arrayBufferToBytes(value: ArrayBuffer): Uint8Array {
  return new Uint8Array(value);
}

export function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }

  return output;
}

export function bytesToDataUri(bytes: Uint8Array, mimeType: string): string {
  return `data:${mimeType};base64,${bytesToBase64(bytes)}`;
}
