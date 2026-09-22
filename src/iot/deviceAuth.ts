/**
 * Minimal device authentication for the IoT telemetry-ingestion endpoint
 * (see IOT_ARCHITECTURE.md). A real fleet deployment should use mutual TLS
 * or per-device certificates issued by the LoRaWAN/NB-IoT network server;
 * a bare pre-shared API key is the right MINIMUM for a small number of
 * devices and is what this implements, not a claim that it's sufficient
 * at scale.
 *
 * Configured via OAH_IOT_DEVICE_KEYS = "deviceId1:key1,deviceId2:key2".
 * Unset by default -- unlike the demo routes, this endpoint refuses every
 * request (503, not a silent 200) until it is explicitly configured,
 * because unlike the demo it is designed to be reachable from outside the
 * process, by something that isn't this application's own UI.
 */

import { timingSafeEqual } from "node:crypto";

export interface DeviceRegistry {
  isConfigured: boolean;
  deviceIds(): string[];
  verify(deviceId: string, presentedKey: string): boolean;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // Constant-time comparison requires equal-length buffers; a length
  // mismatch is itself safe to short-circuit on (it leaks only length,
  // not key content) and avoids timingSafeEqual's own length-mismatch throw.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function parseDeviceRegistry(spec: string | undefined): DeviceRegistry {
  const keys = new Map<string, string>();
  if (spec) {
    for (const entry of spec.split(",")) {
      const trimmed = entry.trim();
      if (!trimmed) continue;
      const separatorIndex = trimmed.indexOf(":");
      if (separatorIndex <= 0 || separatorIndex === trimmed.length - 1) {
        throw new Error(`OAH_IOT_DEVICE_KEYS: malformed entry '${trimmed}' (expected deviceId:key)`);
      }
      const deviceId = trimmed.slice(0, separatorIndex);
      const key = trimmed.slice(separatorIndex + 1);
      if (keys.has(deviceId)) throw new Error(`OAH_IOT_DEVICE_KEYS: duplicate device id '${deviceId}'`);
      keys.set(deviceId, key);
    }
  }
  return {
    isConfigured: keys.size > 0,
    deviceIds: () => [...keys.keys()],
    verify: (deviceId, presentedKey) => {
      const expected = keys.get(deviceId);
      return expected !== undefined && safeEqual(presentedKey, expected);
    },
  };
}

export function loadDeviceRegistryFromEnv(env: NodeJS.ProcessEnv): DeviceRegistry {
  return parseDeviceRegistry(env.OAH_IOT_DEVICE_KEYS);
}
