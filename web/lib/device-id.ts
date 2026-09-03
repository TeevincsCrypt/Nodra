/**
 * Shared bytes32 device-id encoding — no server-only guard, since both server actions
 * and client components need it. Mirrors `toDeviceId` in the root repo's
 * `scripts/env.ts` exactly (UTF-8 bytes, right-padded with zeros to 32 bytes), so a
 * device registered through the UI produces the identical id a CLI-registered device
 * would. Uses TextEncoder rather than Node's Buffer so it also runs in the browser.
 */

export const DEVICE_LABEL_MAX_BYTES = 32;

export interface DeviceLabelValidation {
  valid: boolean;
  error?: string;
}

export function validateDeviceLabel(label: string): DeviceLabelValidation {
  const trimmed = label.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Enter a device label.' };
  }
  const byteLength = new TextEncoder().encode(trimmed).length;
  if (byteLength > DEVICE_LABEL_MAX_BYTES) {
    return { valid: false, error: `Label is ${byteLength} bytes — must be ${DEVICE_LABEL_MAX_BYTES} or fewer.` };
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(trimmed)) {
    return {
      valid: false,
      error: 'Use letters, numbers, "." "_" or "-", starting with a letter or number.',
    };
  }
  return { valid: true };
}

/** "NODE-001" -> 0x4e4f44452d303031000000000000000000000000000000000000000000000000 */
export function toDeviceId(label: string): string {
  const trimmed = label.trim();
  const bytes = new TextEncoder().encode(trimmed);
  if (bytes.length === 0 || bytes.length > DEVICE_LABEL_MAX_BYTES) {
    throw new Error(`Device label "${label}" must be 1-${DEVICE_LABEL_MAX_BYTES} bytes.`);
  }
  const padded = new Uint8Array(DEVICE_LABEL_MAX_BYTES);
  padded.set(bytes);
  return '0x' + Array.from(padded, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Inverse of toDeviceId: strips zero-padding and decodes back to the original label.
 *  Only meaningful for a deviceId this module produced — a deviceId built some other way
 *  (arbitrary bytes32) may decode to garbled or empty text; callers should treat the
 *  result as a best-effort display label, not a validated identifier. */
export function fromDeviceId(deviceId: string): string {
  const hex = deviceId.startsWith('0x') ? deviceId.slice(2) : deviceId;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end--;
  return new TextDecoder().decode(bytes.slice(0, end));
}
