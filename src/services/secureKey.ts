import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { deriveMemoKey } from './crypto';
import { base64ToBytes, bytesToBase64 } from './bytes';

const MEMO_KEY_ID = 'murmur.secure.memo-key.v1';
const MEMO_KEY_BIOMETRIC_FLAG = 'murmur.secure.memo-key.biometric.v1';
const SIA_APP_KEY_ID = 'murmur.secure.sia-app-key.v1';

function secureOptions(requireAuthentication: boolean): SecureStore.SecureStoreOptions {
  return {
    keychainService: MEMO_KEY_ID,
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    requireAuthentication,
    authenticationPrompt: 'Unlock Murmur',
  };
}

function siaKeyOptions(): SecureStore.SecureStoreOptions {
  return {
    keychainService: SIA_APP_KEY_ID,
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  };
}

export async function canUseBiometricUnlock(): Promise<boolean> {
  const [hasHardware, enrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);

  return hasHardware && enrolled;
}

export async function isMemoKeyBiometricProtected(): Promise<boolean> {
  return (await AsyncStorage.getItem(MEMO_KEY_BIOMETRIC_FLAG)) === 'true';
}

export async function storeDerivedMemoKey(passphrase: string, requireBiometric: boolean): Promise<Uint8Array> {
  if (requireBiometric && !(await canUseBiometricUnlock())) {
    throw new Error('Biometric unlock is not available or not enrolled on this device.');
  }

  const key = await deriveMemoKey(passphrase);
  await SecureStore.setItemAsync(MEMO_KEY_ID, bytesToBase64(key), secureOptions(requireBiometric));
  await AsyncStorage.setItem(MEMO_KEY_BIOMETRIC_FLAG, String(requireBiometric));
  return key;
}

export async function loadMemoKey(): Promise<Uint8Array | null> {
  const biometric = await isMemoKeyBiometricProtected();
  const value = await SecureStore.getItemAsync(MEMO_KEY_ID, secureOptions(biometric));
  return value ? base64ToBytes(value) : null;
}

export async function setMemoKeyBiometricProtection(enabled: boolean): Promise<void> {
  const key = await loadMemoKey();
  if (!key) {
    await AsyncStorage.setItem(MEMO_KEY_BIOMETRIC_FLAG, String(enabled));
    return;
  }

  if (enabled && !(await canUseBiometricUnlock())) {
    throw new Error('Biometric unlock is not available or not enrolled on this device.');
  }

  await SecureStore.deleteItemAsync(MEMO_KEY_ID, secureOptions(!enabled));
  await SecureStore.setItemAsync(MEMO_KEY_ID, bytesToBase64(key), secureOptions(enabled));
  await AsyncStorage.setItem(MEMO_KEY_BIOMETRIC_FLAG, String(enabled));
}

export async function storeSiaAppKey(key: Uint8Array): Promise<void> {
  await SecureStore.setItemAsync(SIA_APP_KEY_ID, bytesToBase64(key), siaKeyOptions());
}

export async function loadSiaAppKey(): Promise<Uint8Array | null> {
  const value = await SecureStore.getItemAsync(SIA_APP_KEY_ID, siaKeyOptions());
  return value ? base64ToBytes(value) : null;
}

export async function hasSiaAppKey(): Promise<boolean> {
  return (await loadSiaAppKey()) !== null;
}
