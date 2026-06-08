import { useState, useEffect, useRef } from 'react';
import { User, Camera, Save, Eye, EyeOff, Clock } from 'lucide-react';
import { doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged, updatePassword } from 'firebase/auth';
import { db, auth } from '../lib/firebase';
import { CardSkeleton } from '../components/SkeletonLoader';
import { showToast } from '../components/Toast';

interface Profile {
  id: string;
  full_name: string | null;
  profile_picture_path: string | null;
  email: string | null;
  role: string | null;
}

export default function Settings() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({ full_name: '', profile_picture_path: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Password Request States
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [hasPendingRequest, setHasPendingRequest] = useState(false);
  const [requestLoading, setRequestLoading] = useState(true);
  const [requestSaving, setRequestSaving] = useState(false);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const profileRef = doc(db, 'profiles', user.uid);
          unsubscribeProfile = onSnapshot(profileRef, async (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data() as Profile & { password_change_status?: string; requested_password?: string };
              setProfile(data);
              setFormData({ 
                full_name: data.full_name || '', 
                profile_picture_path: data.profile_picture_path || '' 
              });

              setHasPendingRequest(data.password_change_status === 'pending');

              // Auto-apply approved password change!
              if (data.password_change_status === 'approved' && data.requested_password) {
                try {
                  await updatePassword(user, data.requested_password);
                  await updateDoc(profileRef, {
                    password_change_status: 'completed',
                    requested_password: ''
                  });
                  showToast('Your requested password change has been approved and applied!', 'success');
                } catch (err: any) {
                  if (err.code === 'auth/requires-recent-login') {
                    showToast('Please sign out and sign back in to apply your approved password change.', 'error');
                  } else {
                    console.error("Failed to apply password change:", err);
                    showToast('Failed to apply password change: ' + err.message, 'error');
                  }
                }
              }
            }
            setRequestLoading(false);
          }, (err) => {
            console.error("Error listening to profile changes:", err);
            setRequestLoading(false);
          });
        } catch (error) {
          console.error("Error setting up profile listener:", error);
          setRequestLoading(false);
        }
      } else {
        setRequestLoading(false);
      }
      setLoading(false);
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
    };
  }, []);

  const handlePasswordRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || !confirmPassword) {
      showToast('Please fill in all password fields', 'error');
      return;
    }
    if (newPassword.length < 6) {
      showToast('Password must be at least 6 characters long', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }

    const user = auth.currentUser;
    if (!user) return;

    setRequestSaving(true);
    try {
      await updateDoc(doc(db, 'profiles', user.uid), {
        password_change_status: 'pending',
        requested_password: newPassword,
        password_change_requested_at: new Date().toISOString()
      });

      showToast('Password change request submitted successfully. Pending Admin approval.', 'success');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      showToast('Failed to submit request: ' + error.message, 'error');
    } finally {
      setRequestSaving(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        setFormData({ ...formData, profile_picture_path: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const user = auth.currentUser;
    if (user) {
      try {
        await updateDoc(doc(db, 'profiles', user.uid), { 
          full_name: formData.full_name,
          profile_picture_path: formData.profile_picture_path,
          updated_at: new Date().toISOString()
        });
        setProfile(prev => prev ? { ...prev, full_name: formData.full_name, profile_picture_path: formData.profile_picture_path } : null);
      } catch (error) {
        console.error("Error saving profile:", error);
      }
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex flex-col space-y-4 relative w-full max-w-2xl mx-auto pb-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800 font-[var(--heading)] tracking-tight">Settings</h2>
          <p className="text-sm text-gray-600 mt-1 font-medium">Manage your system preferences and account settings.</p>
        </div>
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-4 relative w-full max-w-2xl mx-auto pb-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-800 font-[var(--heading)] tracking-tight">Settings</h2>
        <p className="text-sm text-gray-600 mt-1 font-medium">Manage your system preferences and account settings.</p>
      </div>

      <div className="bg-white rounded-md shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6">
          <div className="space-y-5">
            <div className="flex flex-col items-center pb-6 border-b border-gray-100">
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center overflow-hidden shadow-sm border-2 border-white">
                  {formData.profile_picture_path ? (
                    <img src={formData.profile_picture_path} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-8 h-8 text-[#166534]" />
                  )}
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 w-8 h-8 bg-[#166534] text-white rounded-full flex items-center justify-center shadow-md hover:bg-[#14532d] cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[13px] font-bold text-gray-600 uppercase tracking-wider">Full Name</label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-md border border-gray-200 bg-gray-50/30 text-black text-sm focus:ring-2 focus:ring-[#166534]/10 focus:border-[#166534] transition-all outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[13px] font-bold text-gray-600 uppercase tracking-wider">Email Address</label>
                <input
                  type="email"
                  value={profile?.email || ''}
                  disabled
                  className="w-full px-3 py-2.5 rounded-md border border-gray-200 bg-gray-100 text-gray-500 text-sm cursor-not-allowed"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[13px] font-bold text-gray-600 uppercase tracking-wider">Role</label>
                <input
                  type="text"
                  value={profile?.role || 'user'}
                  disabled
                  className="w-full px-3 py-2.5 rounded-md border border-gray-200 bg-gray-100 text-gray-500 text-sm capitalize cursor-not-allowed"
                />
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="bg-[#166534] hover:bg-[#14532d] text-white px-6 py-3 rounded-md text-sm font-bold shadow-sm transition-all flex items-center gap-2 active:scale-[0.98] cursor-pointer"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Password Change Request Card */}
      <div className="bg-white rounded-md shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-bold text-gray-800">Security & Password</h3>
              <p className="text-xs text-gray-500 mt-1">Request a password change. This requires administrator approval before it takes effect.</p>
            </div>

            {requestLoading ? (
              <div className="text-sm text-gray-400">Loading request status...</div>
            ) : hasPendingRequest ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-800 flex items-start gap-3">
                <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-sm">Request Pending Approval</p>
                  <p className="text-xs mt-0.5">You have a pending password change request. Please wait for an administrator to approve it.</p>
                </div>
              </div>
            ) : (
              <form onSubmit={handlePasswordRequest} className="space-y-4 pt-2">
                <div className="space-y-2">
                  <label className="text-[13px] font-bold text-gray-600 uppercase tracking-wider block">New Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-md border border-gray-200 bg-gray-50/30 text-black text-sm focus:ring-2 focus:ring-[#166534]/10 focus:border-[#166534] transition-all outline-none font-medium pr-10"
                      placeholder="Enter new password"
                      required
                      disabled={requestSaving}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-[#166534] transition-colors"
                    >
                      {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[13px] font-bold text-gray-600 uppercase tracking-wider block">Confirm Password</label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-md border border-gray-200 bg-gray-50/30 text-black text-sm focus:ring-2 focus:ring-[#166534]/10 focus:border-[#166534] transition-all outline-none font-medium pr-10"
                      placeholder="Re-enter password"
                      required
                      disabled={requestSaving}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-[#166534] transition-colors"
                    >
                      {showConfirmPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={requestSaving}
                    className="bg-[#166534] hover:bg-[#14532d] text-white px-6 py-2.5 rounded-md text-sm font-bold shadow-sm transition-all flex items-center gap-2 active:scale-[0.98] cursor-pointer"
                  >
                    Submit Request
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
