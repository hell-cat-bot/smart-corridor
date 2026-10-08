import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { ServiceType } from '../constants/emergency';

export interface EmergencyReport {
  id: string;
  service: ServiceType;
  emergencyClass: string;
  emergencyLabel: string;
  priority: 1 | 2 | 3;
  sceneNode: string;
  sceneName: string;
  note: string;
  photoUri?: string;
  createdAt: string;
  status: 'pending' | 'dispatched' | 'on_scene' | 'completed';
  assignedUnit?: string;
  etaSeconds?: number;
}

const STORAGE_KEY = '@packmen_citizen_reports';

let cachedWorkingHost: string | null = null;

export function getCandidateBackendUrls(): string[] {
  const urls: string[] = [];

  // 1. Explicitly configured backend URL from environment (app/.env)
  if (process.env.EXPO_PUBLIC_BACKEND_URL) {
    urls.push(process.env.EXPO_PUBLIC_BACKEND_URL.trim());
  }

  // 2. hostUri from Expo if available (auto-detected when running in LAN mode: `npx expo start`)
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    if (ip && !ip.includes('exp.direct') && !ip.includes('ngrok') && ip !== 'localhost' && ip !== '127.0.0.1') {
      urls.push(`http://${ip}:4000`);
    }
  }

  // 3. Known LAN IP of development laptop (allows Expo --tunnel on phone to still reach backend over local Wi-Fi)
  urls.push('http://192.168.0.109:4000');

  // 4. localhost (works when USB debugging is enabled via `adb reverse tcp:4000 tcp:4000` or iOS Simulator)
  urls.push('http://localhost:4000');
  urls.push('http://127.0.0.1:4000');

  // 5. Android Studio emulator fallback (ONLY on emulator; physical phones hang if trying 10.0.2.2)
  if (Platform.OS === 'android' && !Device.isDevice) {
    urls.push('http://10.0.2.2:4000');
  }

  return Array.from(new Set(urls.filter(Boolean)));
}

export async function fetchFromBackend(path: string, options?: RequestInit): Promise<Response> {
  const candidates = getCandidateBackendUrls();
  if (cachedWorkingHost && candidates.includes(cachedWorkingHost)) {
    candidates.splice(candidates.indexOf(cachedWorkingHost), 1);
    candidates.unshift(cachedWorkingHost);
  }

  let lastError: any = null;
  for (const host of candidates) {
    try {
      const controller = new AbortController();
      const isPost = options?.method === 'POST';
      // Fast timeout during host probe, longer timeout once host is verified
      const timeoutDuration = cachedWorkingHost === host ? (isPost ? 20000 : 8000) : (isPost ? 6000 : 3000);
      const timeout = setTimeout(() => controller.abort(), timeoutDuration);
      const res = await fetch(`${host}${path}`, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok || res.status < 500) {
        if (cachedWorkingHost !== host) {
          console.log(`[emergencyService] Successfully connected to backend at: ${host}`);
        }
        cachedWorkingHost = host;
        return res;
      }
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('No reachable backend');
}

export async function getReports(): Promise<EmergencyReport[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const localReports: EmergencyReport[] = raw ? JSON.parse(raw) : [];

    // Background sync with backend for dispatched status
    try {
      const res = await fetchFromBackend('/api/citizen-reports');
      if (res.ok) {
        const remoteReports: any[] = await res.json();
        const remoteMap = new Map(remoteReports.map((r) => [r.id, r]));
        let hasChanges = false;
        const updated = localReports.map((r) => {
          const remote = remoteMap.get(r.id);
          if (remote && remote.status !== r.status) {
            hasChanges = true;
            return {
              ...r,
              status: remote.status,
              assignedUnit: remote.status === 'dispatched' ? (r.service === 'fire' ? 'Fire Squad FT-1' : 'EMS Unit AMB-1') : undefined,
            };
          }
          return r;
        });
        if (hasChanges) {
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
          return updated;
        }
      }
    } catch {
      // Return local cache on network timeout/offline
    }

    return localReports;
  } catch {
    return [];
  }
}

export async function saveReport(report: EmergencyReport): Promise<void> {
  try {
    const existing = await getReports();
    const updated = [report, ...existing.filter((r) => r.id !== report.id)];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save report:', err);
  }
}

export async function submitEmergency(data: {
  service: ServiceType;
  emergencyClass: string;
  emergencyLabel: string;
  priority: 1 | 2 | 3;
  sceneNode: string;
  sceneName: string;
  note: string;
  photoUri?: string;
}): Promise<EmergencyReport> {
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const reportId = `EMG-${randomSuffix}`;

  const report: EmergencyReport = {
    id: reportId,
    service: data.service,
    emergencyClass: data.emergencyClass,
    emergencyLabel: data.emergencyLabel,
    priority: data.priority,
    sceneNode: data.sceneNode,
    sceneName: data.sceneName,
    note: data.note,
    photoUri: data.photoUri,
    createdAt: new Date().toISOString(),
    status: 'pending',
    etaSeconds: data.priority === 1 ? 180 : data.priority === 2 ? 300 : 480,
  };

  try {
    const res = await fetchFromBackend('/api/citizen-reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: reportId,
        service: data.service,
        emergencyClass: data.emergencyClass,
        emergencyLabel: data.emergencyLabel,
        priority: data.priority,
        sceneNode: data.sceneNode,
        sceneName: data.sceneName,
        note: data.note,
        photoData: data.photoUri || null,
      }),
    });
    if (res.ok) {
      console.log(`[emergencyService] Emergency alert ${reportId} transmitted to dispatch center successfully.`);
    }
  } catch (err) {
    console.warn('[emergencyService] Remote transmission failed, saved in local queue:', err);
  }

  await saveReport(report);
  return report;
}
