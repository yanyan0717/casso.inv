import { httpsCallable } from 'firebase/functions';
import { doc, getDoc, collection, getDocs, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Device Approval Service
 * Handles checking and requesting device approval
 */

interface PendingApproval {
  deviceId: string;
  deviceName: string;
  token?: string;
  expiresAt?: number;
  status: 'pending' | 'approved' | 'denied';
  requestedAt?: any;
}

interface ApprovedDevice {
  deviceId: string;
  deviceName: string;
  approvedAt: any;
  lastUsed: any;
}

/**
 * Check if a device is approved for a user
 */
export async function isDeviceApproved(userId: string, deviceId: string): Promise<boolean> {
  try {
    const deviceRef = doc(db, `users/${userId}/devices/${deviceId}`);
    const deviceDoc = await getDoc(deviceRef);
    return deviceDoc.exists();
  } catch (error) {
    console.error('Error checking device approval:', error);
    return false;
  }
}

/**
 * Request approval for a new device
 * Calls Cloud Function to send Gmail notification
 */
export async function requestDeviceApproval(
  functions: any,
  userId: string,
  userEmail: string,
  deviceId: string,
  deviceName: string
): Promise<void> {
  try {
    const requestApproval = httpsCallable(functions, 'requestDeviceApproval');
    
    await requestApproval({
      userId,
      userEmail,
      deviceId,
      deviceName,
    });

    console.log('Device approval requested');
  } catch (error) {
    console.error('Error requesting device approval:', error);
    throw new Error('Failed to send approval email. Please try again.');
  }
}

/**
 * Get all approved devices for a user
 */
export async function getApprovedDevices(userId: string): Promise<ApprovedDevice[]> {
  try {
    const devicesRef = collection(db, `users/${userId}/devices`);
    const snapshot = await getDocs(devicesRef);
    
    return snapshot.docs.map(doc => ({
      ...doc.data() as ApprovedDevice,
      deviceId: doc.id,
    }));
  } catch (error) {
    console.error('Error fetching approved devices:', error);
    return [];
  }
}

/**
 * Get pending approvals for a user
 */
export async function getPendingApprovals(userId: string): Promise<PendingApproval[]> {
  try {
    const approvalsRef = collection(db, `users/${userId}/pendingApprovals`);
    const snapshot = await getDocs(approvalsRef);
    
    return snapshot.docs.map(doc => ({
      ...doc.data() as PendingApproval,
      deviceId: doc.id,
    }));
  } catch (error) {
    console.error('Error fetching pending approvals:', error);
    return [];
  }
}

/**
 * Remove/revoke a device (user can do this from settings)
 */
export async function revokeDevice(userId: string, deviceId: string): Promise<void> {
  try {
    const deviceRef = doc(db, `users/${userId}/devices/${deviceId}`);
    await setDoc(deviceRef, { revokedAt: serverTimestamp() }, { merge: true });
    console.log('Device revoked');
  } catch (error) {
    console.error('Error revoking device:', error);
    throw error;
  }
}
