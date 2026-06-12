import { Linking } from 'react-native';
import {
  AppKey,
  Builder,
  PinnedObject,
  generateRecoveryPhrase,
  initSia,
  type BuilderLike,
  type ObjectEvent,
  type ObjectsCursor,
  type PinnedObjectLike,
  type Reader,
  type SdkLike,
} from 'react-native-sia';
import { MURMUR_APP_ID_HEX, PBKDF2_ITERATIONS, SIA_INDEXER_URL } from '../config';
import type { MemoObjectMetadata, MemoRecord } from '../types';
import { arrayBufferToBytes, bytesToArrayBuffer, bytesToString, stringToBytes } from './bytes';
import { loadSiaAppKey, storeSiaAppKey } from './secureKey';
import { loadSyncCursor, removeMemoRecord, saveSyncCursor, upsertMemoRecords } from './localMetadata';
import { hexToBytes } from '@noble/hashes/utils.js';

let initialized = false;
let sdk: SdkLike | null = null;
let pendingBuilder: BuilderLike | null = null;

function assertHttpsIndexer(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') {
    throw new Error('Sia indexer URL must use HTTPS.');
  }
}

async function ensureSiaInitialized(): Promise<void> {
  if (!initialized) {
    assertHttpsIndexer(SIA_INDEXER_URL);
    await initSia();
    initialized = true;
  }
}

function appMetadata() {
  return {
    id: bytesToArrayBuffer(hexToBytes(MURMUR_APP_ID_HEX)),
    name: 'Murmur',
    description: 'Private, decentralized encrypted voice memos.',
    serviceUrl: 'https://murmur.local',
    callbackUrl: 'murmur://sia-callback',
  };
}

function bytesReader(data: Uint8Array, chunkSize = 256 * 1024): Reader {
  let offset = 0;

  return {
    async read() {
      if (offset >= data.byteLength) {
        return new ArrayBuffer(0);
      }

      const end = Math.min(offset + chunkSize, data.byteLength);
      const chunk = data.slice(offset, end);
      offset = end;
      return bytesToArrayBuffer(chunk);
    },
  };
}

async function readDownload(download: ReturnType<SdkLike['download']>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];

  while (true) {
    const chunk = await download.read();
    if (chunk.byteLength === 0) {
      break;
    }
    chunks.push(arrayBufferToBytes(chunk));
  }

  const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}

function getSdk(): SdkLike {
  if (!sdk) {
    throw new Error('Connect Murmur to your Sia indexer before syncing recordings.');
  }

  return sdk;
}

export async function connectWithStoredSiaKey(): Promise<boolean> {
  await ensureSiaInitialized();
  const key = await loadSiaAppKey();
  if (!key) {
    return false;
  }

  const builder = new Builder(SIA_INDEXER_URL, appMetadata());
  const connected = await builder.connected(new AppKey(bytesToArrayBuffer(key)));
  sdk = connected ?? null;
  return sdk !== null;
}

export async function beginSiaAuthorization(): Promise<string> {
  await ensureSiaInitialized();
  const builder = new Builder(SIA_INDEXER_URL, appMetadata());
  pendingBuilder = await builder.requestConnection();
  const url = pendingBuilder.responseUrl();
  await Linking.openURL(url);
  return url;
}

export async function completeSiaAuthorization(): Promise<{ recoveryPhrase: string }> {
  if (!pendingBuilder) {
    throw new Error('Start the Sia authorization flow first.');
  }

  await pendingBuilder.waitForApproval();
  const recoveryPhrase = generateRecoveryPhrase();
  sdk = await pendingBuilder.register(recoveryPhrase);
  await storeSiaAppKey(arrayBufferToBytes(sdk.appKey().export_()));
  pendingBuilder = null;
  return { recoveryPhrase };
}

export function buildMemoObjectMetadata(params: {
  title: string;
  createdAt: string;
  durationMillis?: number;
  mimeType: string;
}): MemoObjectMetadata {
  return {
    app: 'murmur',
    version: 1,
    objectType: 'voice-memo',
    title: params.title,
    createdAt: params.createdAt,
    durationMillis: params.durationMillis,
    mimeType: params.mimeType,
    crypto: {
      algorithm: 'AES-256-GCM',
      kdf: 'PBKDF2-HMAC-SHA256',
      iterations: PBKDF2_ITERATIONS,
    },
  };
}

export async function uploadEncryptedMemo(params: {
  encryptedBytes: Uint8Array;
  metadata: MemoObjectMetadata;
}): Promise<{ objectId: string; encryptedSize: number }> {
  const object = new PinnedObject();
  object.updateMetadata(bytesToArrayBuffer(stringToBytes(JSON.stringify(params.metadata))));

  const uploaded = await getSdk().upload(object, bytesReader(params.encryptedBytes), { maxInflight: 10 });
  await getSdk().pinObject(uploaded);

  return {
    objectId: uploaded.id(),
    encryptedSize: Number(uploaded.size()),
  };
}

export async function downloadEncryptedMemo(objectId: string): Promise<Uint8Array> {
  const object = await getSdk().object(objectId);
  const download = getSdk().download(object, { maxInflight: 10 });
  return readDownload(download);
}

function memoFromObject(objectId: string, object: PinnedObjectLike): MemoRecord | null {
  try {
    const metadata = JSON.parse(bytesToString(arrayBufferToBytes(object.metadata()))) as MemoObjectMetadata;
    if (metadata.app !== 'murmur' || metadata.objectType !== 'voice-memo') {
      return null;
    }

    return {
      objectId,
      title: metadata.title,
      createdAt: metadata.createdAt,
      durationMillis: metadata.durationMillis,
      encryptedSize: Number(object.size()),
      mimeType: metadata.mimeType,
    };
  } catch {
    return null;
  }
}

function cursorFromEvent(event: ObjectEvent): ObjectsCursor {
  return {
    id: event.id,
    after: event.updatedAt,
  };
}

export async function syncMemoIndexFromSia(): Promise<MemoRecord[]> {
  const client = getSdk();
  const discovered: MemoRecord[] = [];
  let rawCursor = await loadSyncCursor();
  let cursor: ObjectsCursor | undefined = rawCursor ? { id: rawCursor.id, after: new Date(rawCursor.after) } : undefined;

  while (true) {
    const events = await client.objectEvents(cursor, 50);
    if (events.length === 0) {
      break;
    }

    for (const event of events) {
      if (event.deleted) {
        await removeMemoRecord(event.id);
      } else if (event.object) {
        const memo = memoFromObject(event.id, event.object);
        if (memo) {
          discovered.push(memo);
        }
      }

      cursor = cursorFromEvent(event);
      await saveSyncCursor({ id: cursor.id, after: cursor.after.toISOString() });
    }

    if (events.length < 50) {
      break;
    }
  }

  return upsertMemoRecords(discovered);
}

export function isSiaConnected(): boolean {
  return sdk !== null;
}
