import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MemoRecord } from '../types';

const MEMO_INDEX_KEY = 'murmur.memo-index.v1';
const SYNC_CURSOR_KEY = 'murmur.sia-sync-cursor.v1';

type SyncCursor = {
  id: string;
  after: string;
};

function sortMemos(memos: MemoRecord[]): MemoRecord[] {
  return [...memos].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function loadMemoIndex(): Promise<MemoRecord[]> {
  const raw = await AsyncStorage.getItem(MEMO_INDEX_KEY);
  return raw ? sortMemos(JSON.parse(raw) as MemoRecord[]) : [];
}

export async function saveMemoIndex(memos: MemoRecord[]): Promise<void> {
  await AsyncStorage.setItem(MEMO_INDEX_KEY, JSON.stringify(sortMemos(memos)));
}

export async function upsertMemoRecord(record: MemoRecord): Promise<MemoRecord[]> {
  const memos = await loadMemoIndex();
  const next = sortMemos([record, ...memos.filter((memo) => memo.objectId !== record.objectId)]);
  await saveMemoIndex(next);
  return next;
}

export async function upsertMemoRecords(records: MemoRecord[]): Promise<MemoRecord[]> {
  const existing = await loadMemoIndex();
  const byId = new Map(existing.map((memo) => [memo.objectId, memo]));

  for (const record of records) {
    byId.set(record.objectId, record);
  }

  const next = sortMemos([...byId.values()]);
  await saveMemoIndex(next);
  return next;
}

export async function removeMemoRecord(objectId: string): Promise<MemoRecord[]> {
  const next = (await loadMemoIndex()).filter((memo) => memo.objectId !== objectId);
  await saveMemoIndex(next);
  return next;
}

export async function loadSyncCursor(): Promise<SyncCursor | undefined> {
  const raw = await AsyncStorage.getItem(SYNC_CURSOR_KEY);
  return raw ? (JSON.parse(raw) as SyncCursor) : undefined;
}

export async function saveSyncCursor(cursor: SyncCursor): Promise<void> {
  await AsyncStorage.setItem(SYNC_CURSOR_KEY, JSON.stringify(cursor));
}
