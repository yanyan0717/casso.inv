/**
 * Device Service - Handles unique device identification for login approval
 * Uses localStorage to store device ID and browser fingerprinting for verification
 */

const DEVICE_ID_KEY = 'casso_device_id';
const DEVICE_NAME_KEY = 'casso_device_name';

interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  userAgent: string;
  platform: string;
  createdAt: number;
}

/**
 * Generate a simple UUID v4-like string (browser-compatible)
 */
function generateSimpleUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Generate a browser fingerprint for additional security
 */
function generateFingerprint(): string {
  const fingerprint = {
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    colorDepth: window.screen.colorDepth,
  };
  
  // Simple hash of fingerprint data
  return btoa(JSON.stringify(fingerprint));
}

/**
 * Get or create a unique device ID
 */
export function getOrCreateDeviceId(): string {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  
  if (!deviceId) {
    // Generate a new device ID if one doesn't exist
    deviceId = `device_${generateSimpleUUID()}_${Date.now()}`;
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  
  return deviceId;
}

/**
 * Get device name for display (e.g., "Chrome on Windows")
 */
export function getDeviceName(): string {
  // Try to get cached device name
  const cached = localStorage.getItem(DEVICE_NAME_KEY);
  if (cached) return cached;
  
  const ua = navigator.userAgent;
  let deviceName = 'Unknown Device';
  
  // Parse browser
  if (ua.includes('Chrome')) {
    deviceName = 'Chrome';
  } else if (ua.includes('Firefox')) {
    deviceName = 'Firefox';
  } else if (ua.includes('Safari')) {
    deviceName = 'Safari';
  } else if (ua.includes('Edge')) {
    deviceName = 'Edge';
  }
  
  // Parse OS
  if (ua.includes('Windows')) {
    deviceName += ' on Windows';
  } else if (ua.includes('Mac')) {
    deviceName += ' on macOS';
  } else if (ua.includes('Linux')) {
    deviceName += ' on Linux';
  } else if (ua.includes('Android')) {
    deviceName += ' on Android';
  } else if (ua.includes('iPhone') || ua.includes('iPad')) {
    deviceName += ' on iOS';
  }
  
  localStorage.setItem(DEVICE_NAME_KEY, deviceName);
  return deviceName;
}

/**
 * Get complete device information
 */
export function getDeviceInfo(): DeviceInfo {
  return {
    deviceId: getOrCreateDeviceId(),
    deviceName: getDeviceName(),
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    createdAt: Date.now(),
  };
}

/**
 * Verify device fingerprint hasn't changed (optional security check)
 */
export function verifyFingerprint(storedFingerprint: string): boolean {
  const currentFingerprint = generateFingerprint();
  return currentFingerprint === storedFingerprint;
}

/**
 * Clear device ID (for logout on untrusted device)
 */
export function clearDeviceId(): void {
  localStorage.removeItem(DEVICE_ID_KEY);
  localStorage.removeItem(DEVICE_NAME_KEY);
}
