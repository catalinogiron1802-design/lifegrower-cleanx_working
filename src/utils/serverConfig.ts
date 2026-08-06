import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';

const OVERRIDE_KEY = 'lifegrower_server_override';
const SERVER_PORT = 3000;
const FALLBACK_IP = '192.168.254.100';

function isLanIp(host: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
}

// When the app is loaded through Expo Go/dev-client on the same Wi-Fi as the PC,
// hostUri is the LAN IP the phone used to reach the Metro bundler — the sync
// server lives on the same PC, just on a different port. A tunnel hostname isn't
// usable here (only Metro's port is tunneled), so it's ignored in that case.
function detectLanIp(): string | null {
  const hostUri = Constants.expoConfig?.hostUri;
  if (!hostUri) return null;
  const host = hostUri.split(':')[0];
  return isLanIp(host) ? host : null;
}

export async function getServerOverride(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(OVERRIDE_KEY);
  } catch {
    return null;
  }
}

export async function setServerOverride(url: string | null): Promise<void> {
  if (!url) {
    await AsyncStorage.removeItem(OVERRIDE_KEY);
    return;
  }
  await AsyncStorage.setItem(OVERRIDE_KEY, url.trim().replace(/\/+$/, ''));
}

export async function resolveServerUrl(): Promise<string> {
  const override = await getServerOverride();
  if (override) return override;
  return `http://${detectLanIp() || FALLBACK_IP}:${SERVER_PORT}`;
}

// Returns the sync server URL, auto-detected from how the app was loaded
// (falls back to a manual AsyncStorage override, then to FALLBACK_IP).
export function useServerUrl(): string {
  const [serverUrl, setServerUrl] = useState(
    () => `http://${detectLanIp() || FALLBACK_IP}:${SERVER_PORT}`
  );

  useEffect(() => {
    let cancelled = false;
    resolveServerUrl().then((url) => {
      if (!cancelled) setServerUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return serverUrl;
}
