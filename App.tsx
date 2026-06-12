import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { Audio } from 'expo-av';
import type { Recording } from 'expo-av/build/Audio';
import type { MemoRecord, SiaConnectionState } from './src/types';
import { bytesToDataUri } from './src/services/bytes';
import { decryptMemoAudio, encryptMemoAudio } from './src/services/crypto';
import { loadMemoIndex, upsertMemoRecord } from './src/services/localMetadata';
import { startM4aRecording, stopM4aRecording } from './src/services/audioRecorder';
import {
  beginSiaAuthorization,
  buildMemoObjectMetadata,
  completeSiaAuthorization,
  connectWithStoredSiaKey,
  downloadEncryptedMemo,
  syncMemoIndexFromSia,
  uploadEncryptedMemo,
} from './src/services/siaClient';
import {
  canUseBiometricUnlock,
  isMemoKeyBiometricProtected,
  loadMemoKey,
  setMemoKeyBiometricProtection,
  storeDerivedMemoKey,
} from './src/services/secureKey';

function formatDuration(durationMillis?: number): string {
  if (!durationMillis) {
    return '--:--';
  }

  const totalSeconds = Math.round(durationMillis / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export default function App() {
  const recordingRef = useRef<Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [keyReady, setKeyReady] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [memoTitle, setMemoTitle] = useState('');
  const [status, setStatus] = useState('Private memos, encrypted before upload.');
  const [memos, setMemos] = useState<MemoRecord[]>([]);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [siaState, setSiaState] = useState<SiaConnectionState>('disconnected');
  const [approvalUrl, setApprovalUrl] = useState<string | null>(null);
  const [recoveryPhrase, setRecoveryPhrase] = useState<string | null>(null);
  const [playingObjectId, setPlayingObjectId] = useState<string | null>(null);

  const refreshLocalMemos = useCallback(async () => {
    setMemos(await loadMemoIndex());
  }, []);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    async function boot() {
      try {
        const [storedKey, localMemos, canUseBiometrics, biometricsOn] = await Promise.all([
          loadMemoKey(),
          loadMemoIndex(),
          canUseBiometricUnlock(),
          isMemoKeyBiometricProtected(),
        ]);
        setKeyReady(Boolean(storedKey));
        setMemos(localMemos);
        setBiometricAvailable(canUseBiometrics);
        setBiometricEnabled(biometricsOn);

        if (await connectWithStoredSiaKey()) {
          setSiaState('connected');
          setMemos(await syncMemoIndexFromSia());
          setStatus('Synced pinned Sia objects from your indexer.');
        }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Could not finish startup.');
      } finally {
        setBooting(false);
      }
    }

    void boot();

    return () => {
      void soundRef.current?.unloadAsync();
    };
  }, []);

  async function handleUnlock() {
    setBusy(true);
    try {
      await storeDerivedMemoKey(passphrase, biometricEnabled);
      setKeyReady(true);
      setPassphrase('');
      setStatus('Memo key derived and stored in secure hardware-backed storage where available.');
    } catch (error) {
      Alert.alert('Passphrase required', error instanceof Error ? error.message : 'Could not derive key.');
    } finally {
      setBusy(false);
    }
  }

  async function handleBiometricToggle(value: boolean) {
    try {
      await setMemoKeyBiometricProtection(value);
      setBiometricEnabled(value);
      setStatus(value ? 'Biometric unlock enabled for the memo key.' : 'Biometric unlock disabled.');
    } catch (error) {
      Alert.alert('Biometric unlock', error instanceof Error ? error.message : 'Could not update biometric setting.');
    }
  }

  async function handleConnectSia() {
    setBusy(true);
    try {
      setSiaState('authorizing');
      const url = await beginSiaAuthorization();
      setApprovalUrl(url);
      setStatus('Approve Murmur in your Sia indexer, then tap Complete authorization.');
    } catch (error) {
      setSiaState('disconnected');
      Alert.alert('Sia authorization', error instanceof Error ? error.message : 'Could not start Sia authorization.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCompleteSia() {
    setBusy(true);
    try {
      const result = await completeSiaAuthorization();
      setRecoveryPhrase(result.recoveryPhrase);
      setApprovalUrl(null);
      setSiaState('connected');
      setMemos(await syncMemoIndexFromSia());
      setStatus('Sia indexer connected. Save the recovery phrase shown below.');
    } catch (error) {
      Alert.alert('Sia authorization', error instanceof Error ? error.message : 'Could not complete Sia authorization.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRecordPress() {
    if (busy) {
      return;
    }

    if (!keyReady) {
      Alert.alert('Unlock Murmur', 'Enter your passphrase before recording.');
      return;
    }

    if (siaState !== 'connected') {
      Alert.alert('Connect Sia', 'Connect your Sia indexer before recording so plaintext is not kept locally.');
      return;
    }

    if (!isRecording) {
      try {
        const recording = await startM4aRecording();
        recordingRef.current = recording;
        setIsRecording(true);
        setStatus('Recording AAC/M4A locally; it will be encrypted immediately after stop.');
      } catch (error) {
        Alert.alert('Recording', error instanceof Error ? error.message : 'Could not start recording.');
      }
      return;
    }

    const recording = recordingRef.current;
    if (!recording) {
      return;
    }

    setBusy(true);
    setIsRecording(false);
    recordingRef.current = null;

    try {
      setStatus('Stopping and reading compressed M4A from the recorder.');
      const captured = await stopM4aRecording(recording);
      const key = await loadMemoKey();
      if (!key) {
        throw new Error('Memo key is not available. Unlock Murmur again.');
      }

      const createdAt = new Date().toISOString();
      const title = memoTitle.trim() || `Memo ${new Date(createdAt).toLocaleString()}`;
      setStatus('Encrypting audio on-device with AES-256-GCM.');
      const encryptedBytes = await encryptMemoAudio({
        plaintext: captured.bytes,
        key,
        mimeType: captured.mimeType,
        createdAt,
      });
      const metadata = buildMemoObjectMetadata({
        title,
        createdAt,
        durationMillis: captured.durationMillis,
        mimeType: captured.mimeType,
      });

      setStatus('Uploading encrypted blob to Sia and pinning the object.');
      const uploaded = await uploadEncryptedMemo({ encryptedBytes, metadata });
      const memo: MemoRecord = {
        objectId: uploaded.objectId,
        title,
        createdAt,
        durationMillis: captured.durationMillis,
        encryptedSize: uploaded.encryptedSize,
        mimeType: captured.mimeType,
      };

      setMemos(await upsertMemoRecord(memo));
      setMemoTitle('');
      setStatus('Encrypted memo uploaded and pinned. Plaintext recorder file was deleted.');
    } catch (error) {
      Alert.alert('Save memo', error instanceof Error ? error.message : 'Could not save memo.');
      await refreshLocalMemos();
    } finally {
      setBusy(false);
    }
  }

  async function handlePlayMemo(memo: MemoRecord) {
    if (busy) {
      return;
    }

    setBusy(true);
    setPlayingObjectId(memo.objectId);
    try {
      const key = await loadMemoKey();
      if (!key) {
        throw new Error('Memo key is not available. Unlock Murmur again.');
      }

      setStatus('Downloading encrypted object from Sia.');
      const encrypted = await downloadEncryptedMemo(memo.objectId);
      setStatus('Decrypting memo in memory for playback.');
      const decrypted = decryptMemoAudio(encrypted, key);
      await soundRef.current?.unloadAsync();
      const { sound } = await Audio.Sound.createAsync(
        { uri: bytesToDataUri(decrypted.bytes, decrypted.mimeType) },
        { shouldPlay: true }
      );
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((playbackStatus) => {
        if (playbackStatus.isLoaded && playbackStatus.didJustFinish) {
          setPlayingObjectId(null);
          setStatus('Playback finished. Plaintext audio was never written to disk.');
          void sound.unloadAsync();
        }
      });
      setStatus('Playing decrypted audio from memory.');
    } catch (error) {
      setPlayingObjectId(null);
      Alert.alert('Playback', error instanceof Error ? error.message : 'Could not play memo.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSync() {
    setBusy(true);
    try {
      setMemos(await syncMemoIndexFromSia());
      setStatus('Memo list synced from pinned Sia object events.');
    } catch (error) {
      Alert.alert('Sync', error instanceof Error ? error.message : 'Could not sync memos.');
    } finally {
      setBusy(false);
    }
  }

  if (booting) {
    return (
      <SafeAreaView style={styles.boot}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator color="#d7f96f" />
        <Text style={styles.bootText}>Opening Murmur...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
        <FlatList
          data={memos}
          keyExtractor={(item) => item.objectId}
          ListHeaderComponent={
            <View>
              <View style={styles.header}>
                <View>
                  <Text style={styles.kicker}>Murmur</Text>
                  <Text style={styles.title}>Private voice memos</Text>
                </View>
                <View style={[styles.networkPill, isOnline ? styles.online : styles.offline]}>
                  <Text style={styles.networkText}>{isOnline ? 'Online' : 'Offline'}</Text>
                </View>
              </View>

              {!keyReady ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Unlock encryption</Text>
                  <Text style={styles.copy}>
                    Your passphrase derives a 256-bit AES key with PBKDF2. Murmur stores the derived key in
                    Keychain or Keystore, never the passphrase.
                  </Text>
                  <TextInput
                    value={passphrase}
                    onChangeText={setPassphrase}
                    secureTextEntry
                    placeholder="Long private passphrase"
                    placeholderTextColor="#6f756c"
                    style={styles.input}
                  />
                  <View style={styles.rowBetween}>
                    <Text style={styles.copy}>Biometric unlock</Text>
                    <Switch
                      disabled={!biometricAvailable}
                      value={biometricEnabled}
                      onValueChange={setBiometricEnabled}
                      thumbColor={biometricEnabled ? '#d7f96f' : '#f4f4f4'}
                    />
                  </View>
                  <Pressable disabled={busy} style={styles.secondaryButton} onPress={handleUnlock}>
                    <Text style={styles.secondaryButtonText}>Derive and store key</Text>
                  </Pressable>
                </View>
              ) : null}

              <View style={styles.card}>
                <View style={styles.rowBetween}>
                  <View>
                    <Text style={styles.cardTitle}>Sia indexer</Text>
                    <Text style={styles.copy}>
                      {siaState === 'connected'
                        ? 'Connected. New memos are uploaded encrypted and pinned.'
                        : 'Authorize Murmur with your Sia indexer to upload and discover pinned objects.'}
                    </Text>
                  </View>
                  <View style={[styles.dot, siaState === 'connected' ? styles.dotReady : styles.dotIdle]} />
                </View>
                {approvalUrl ? <Text style={styles.approvalUrl}>{approvalUrl}</Text> : null}
                {recoveryPhrase ? (
                  <View style={styles.recoveryBox}>
                    <Text style={styles.recoveryLabel}>Save this Sia recovery phrase:</Text>
                    <Text style={styles.recoveryPhrase}>{recoveryPhrase}</Text>
                  </View>
                ) : null}
                <View style={styles.actionRow}>
                  <Pressable
                    disabled={busy || siaState === 'connected'}
                    style={[styles.smallButton, (busy || siaState === 'connected') && styles.disabledButton]}
                    onPress={handleConnectSia}
                  >
                    <Text style={styles.smallButtonText}>Connect</Text>
                  </Pressable>
                  <Pressable
                    disabled={busy || siaState !== 'authorizing'}
                    style={[styles.smallButton, (busy || siaState !== 'authorizing') && styles.disabledButton]}
                    onPress={handleCompleteSia}
                  >
                    <Text style={styles.smallButtonText}>Complete</Text>
                  </Pressable>
                  <Pressable
                    disabled={busy || siaState !== 'connected'}
                    style={[styles.smallButton, (busy || siaState !== 'connected') && styles.disabledButton]}
                    onPress={handleSync}
                  >
                    <Text style={styles.smallButtonText}>Sync</Text>
                  </Pressable>
                </View>
              </View>

              {keyReady ? (
                <View style={styles.compactCard}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.copy}>Biometric unlock</Text>
                    <Switch
                      disabled={!biometricAvailable}
                      value={biometricEnabled}
                      onValueChange={handleBiometricToggle}
                      thumbColor={biometricEnabled ? '#d7f96f' : '#f4f4f4'}
                    />
                  </View>
                </View>
              ) : null}

              <View style={styles.recorderCard}>
                <TextInput
                  value={memoTitle}
                  onChangeText={setMemoTitle}
                  placeholder="Memo title (optional)"
                  placeholderTextColor="#788074"
                  style={styles.titleInput}
                />
                <Pressable
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={isRecording ? 'Stop recording' : 'Start recording'}
                  style={[styles.recordButton, isRecording && styles.recordingButton, busy && styles.disabledButton]}
                  onPress={handleRecordPress}
                >
                  <Text style={styles.recordButtonText}>{isRecording ? 'Stop' : 'Record'}</Text>
                </Pressable>
                <Text style={styles.status}>{busy ? 'Working...' : status}</Text>
              </View>

              <View style={styles.memoHeader}>
                <Text style={styles.sectionTitle}>Memos</Text>
                <Text style={styles.memoCount}>{memos.length}</Text>
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.memoCard} onPress={() => handlePlayMemo(item)}>
              <View style={styles.memoIcon}>
                <Text style={styles.memoIconText}>{playingObjectId === item.objectId ? '▶' : 'M'}</Text>
              </View>
              <View style={styles.memoBody}>
                <Text style={styles.memoTitle}>{item.title}</Text>
                <Text style={styles.memoMeta}>
                  {formatDate(item.createdAt)} · {formatDuration(item.durationMillis)} · {item.encryptedSize ?? 0} bytes
                </Text>
                <Text style={styles.objectId} numberOfLines={1}>
                  {item.objectId}
                </Text>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No memos yet. Tap Record to create your first encrypted note.</Text>}
          contentContainerStyle={styles.listContent}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0d130f',
  },
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0d130f',
  },
  bootText: {
    marginTop: 14,
    color: '#f3f7ef',
    fontSize: 16,
  },
  container: {
    flex: 1,
  },
  listContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  kicker: {
    color: '#d7f96f',
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  title: {
    maxWidth: 280,
    color: '#f7fff2',
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: -2,
    lineHeight: 43,
  },
  networkPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  online: {
    backgroundColor: '#1e3827',
  },
  offline: {
    backgroundColor: '#4b2525',
  },
  networkText: {
    color: '#f7fff2',
    fontSize: 12,
    fontWeight: '800',
  },
  card: {
    gap: 14,
    borderWidth: 1,
    borderColor: '#263128',
    borderRadius: 28,
    backgroundColor: '#151d17',
    padding: 18,
    marginBottom: 14,
  },
  compactCard: {
    borderWidth: 1,
    borderColor: '#263128',
    borderRadius: 22,
    backgroundColor: '#151d17',
    padding: 16,
    marginBottom: 14,
  },
  cardTitle: {
    color: '#f7fff2',
    fontSize: 20,
    fontWeight: '900',
  },
  copy: {
    color: '#b9c3b3',
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: '#0d130f',
    color: '#f7fff2',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#2a352d',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  secondaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#d7f96f',
  },
  secondaryButtonText: {
    color: '#10160f',
    fontWeight: '900',
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  dotReady: {
    backgroundColor: '#d7f96f',
  },
  dotIdle: {
    backgroundColor: '#596358',
  },
  approvalUrl: {
    color: '#d7f96f',
    fontSize: 12,
  },
  recoveryBox: {
    borderRadius: 18,
    backgroundColor: '#0d130f',
    padding: 14,
  },
  recoveryLabel: {
    color: '#aab5a6',
    fontWeight: '800',
    marginBottom: 6,
  },
  recoveryPhrase: {
    color: '#f7fff2',
    fontWeight: '800',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  smallButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#253528',
  },
  smallButtonText: {
    color: '#f7fff2',
    fontWeight: '900',
  },
  disabledButton: {
    opacity: 0.5,
  },
  recorderCard: {
    alignItems: 'center',
    gap: 16,
    borderRadius: 34,
    backgroundColor: '#f4f2e6',
    padding: 20,
    marginVertical: 16,
  },
  titleInput: {
    width: '100%',
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    color: '#11170f',
    paddingHorizontal: 16,
  },
  recordButton: {
    width: 168,
    height: 168,
    borderRadius: 84,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#11170f',
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 14 },
    elevation: 6,
  },
  recordingButton: {
    backgroundColor: '#e54848',
  },
  recordButtonText: {
    color: '#f7fff2',
    fontSize: 26,
    fontWeight: '900',
  },
  status: {
    color: '#45503f',
    fontWeight: '700',
    textAlign: 'center',
  },
  memoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#f7fff2',
    fontSize: 24,
    fontWeight: '900',
  },
  memoCount: {
    color: '#d7f96f',
    fontWeight: '900',
  },
  memoCard: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#263128',
    borderRadius: 24,
    backgroundColor: '#151d17',
    padding: 14,
    marginBottom: 10,
  },
  memoIcon: {
    width: 54,
    height: 54,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#d7f96f',
  },
  memoIconText: {
    color: '#11170f',
    fontWeight: '900',
  },
  memoBody: {
    flex: 1,
  },
  memoTitle: {
    color: '#f7fff2',
    fontSize: 17,
    fontWeight: '900',
  },
  memoMeta: {
    color: '#aeb8aa',
    marginTop: 4,
  },
  objectId: {
    color: '#687365',
    marginTop: 4,
    fontSize: 11,
  },
  empty: {
    color: '#aeb8aa',
    textAlign: 'center',
    marginTop: 18,
    lineHeight: 22,
  },
});
