import { Audio } from 'expo-av';
import { deleteAsync, EncodingType, readAsStringAsync } from 'expo-file-system/legacy';
import type { CapturedAudio } from '../types';
import { base64ToBytes } from './bytes';

const M4A_RECORDING_OPTIONS: Audio.RecordingOptions = {
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 44_100,
    numberOfChannels: 1,
    bitRate: 128_000,
  },
  ios: {
    extension: '.m4a',
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: 44_100,
    numberOfChannels: 1,
    bitRate: 128_000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/mp4',
    bitsPerSecond: 128_000,
  },
};

export async function startM4aRecording(): Promise<Audio.Recording> {
  const permission = await Audio.requestPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Microphone permission is required to record a memo.');
  }

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    shouldDuckAndroid: true,
    staysActiveInBackground: false,
  });

  const recording = new Audio.Recording();
  await recording.prepareToRecordAsync(M4A_RECORDING_OPTIONS);
  await recording.startAsync();
  return recording;
}

export async function stopM4aRecording(recording: Audio.Recording): Promise<CapturedAudio> {
  await recording.stopAndUnloadAsync();
  const status = await recording.getStatusAsync();
  const uri = recording.getURI();

  if (!uri) {
    throw new Error('Recorder did not return an audio file.');
  }

  try {
    const base64Audio = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
    return {
      bytes: base64ToBytes(base64Audio),
      durationMillis: status.durationMillis,
      mimeType: 'audio/mp4',
    };
  } finally {
    await deleteAsync(uri, { idempotent: true });
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
  }
}
