import { Capacitor, registerPlugin } from '@capacitor/core';

export type IncomingCall = { callId: string; callerName: string };
type CallEvents = { callId: string };
type ScifCallKitPlugin = {
  registerVoipPush(): Promise<void>;
  addListener(eventName: 'incomingCall', listener: (call: IncomingCall) => void): Promise<{ remove(): Promise<void> }>;
  addListener(eventName: 'callAnswered', listener: (event: CallEvents) => void): Promise<{ remove(): Promise<void> }>;
  answerCall(options: CallEvents): Promise<void>;
  endCall(options: CallEvents): Promise<void>;
};

// Requires the native Swift plugin in native/ios and registration in the Xcode app target.
export const ScifCallKit = registerPlugin<ScifCallKitPlugin>('ScifCallKit');

export async function enableIncomingCalls(): Promise<void> {
  if (Capacitor.getPlatform() !== 'ios') {
    throw new Error('Native call integration must be installed and tested in a device build.');
  }
  await ScifCallKit.registerVoipPush();
}
