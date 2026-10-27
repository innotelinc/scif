import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';

export type VoiceResult = { transcript: string; confidence: number; warning?: string };

/** Dictation helper only. Browser speech recognition may send audio to the OS/vendor service;
 * it is not voice authentication and must never approve identity or account recovery.
 */
export function dictate(): Promise<VoiceResult> {
  const SpeechRecognition = (window as Window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition
    ?? (window as Window & { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
  if (!SpeechRecognition) return Promise.reject(new Error('Speech recognition is not available on this device.'));
  return new Promise((resolve, reject) => {
    const recognizer = new SpeechRecognition();
    recognizer.lang = navigator.language || 'en-US';
    recognizer.interimResults = false;
    recognizer.maxAlternatives = 1;
    recognizer.onresult = (event) => resolve({
      transcript: event.results[0][0].transcript,
      confidence: event.results[0][0].confidence,
      warning: 'Dictation may be processed by the device speech service. Do not dictate secrets.'
    });
    recognizer.onerror = (event) => reject(new Error(`Dictation failed: ${event.error}`));
    recognizer.start();
  });
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start(): void;
}

export async function registerPush(): Promise<string> {
  if (!Capacitor.isNativePlatform()) throw new Error('Push registration is available in installed native builds only.');
  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== 'granted') throw new Error('Push permission was not granted.');
  return new Promise((resolve, reject) => {
    let registrationHandle: { remove(): Promise<void> } | undefined;
    let failureHandle: { remove(): Promise<void> } | undefined;
    void PushNotifications.addListener('registration', ({ value }) => {
      void registrationHandle?.remove();
      void failureHandle?.remove();
      resolve(value);
    }).then((handle) => { registrationHandle = handle; });
    void PushNotifications.addListener('registrationError', ({ error }) => {
      void registrationHandle?.remove();
      void failureHandle?.remove();
      reject(new Error(error));
    }).then((handle) => { failureHandle = handle; });
    void PushNotifications.register().catch(reject);
  });
}

export const voiceAuthNotice = 'Voice recognition can transcribe speech, but browser-only voice authentication is not secure. Use OS biometrics/passkeys and server-side, replay-resistant verification instead.';
