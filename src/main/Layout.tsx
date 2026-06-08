import { useEffect, useState, useRef } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { onAuthStateChanged, type User, updatePassword } from 'firebase/auth';
import { collection, query, orderBy, onSnapshot, addDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { showToast } from '../components/Toast';
import Sidebar from '../sidebar/Sidebar';
import { Menu } from 'lucide-react';

export default function Layout() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const seenRequestIdsRef = useRef(new Set<string>());
  const initialRequestLoadRef = useRef(true);

  useEffect(() => {
    const loadRole = async (user: User | null) => {
      if (!user) {
        setIsAdmin(false);
        setRoleLoaded(true);
        return;
      }

      try {
        const profileDoc = await getDoc(doc(db, 'profiles', user.uid));
        if (profileDoc.exists()) {
          const data = profileDoc.data();
          const rawRole = (data?.role || 'user').toString().toLowerCase().trim();
          const normalizedRole = rawRole === 'admin' || rawRole === 'administrator';
          setIsAdmin(normalizedRole);

          // Auto-apply approved password change!
          if (data.password_change_status === 'approved' && data.requested_password) {
            try {
              await updatePassword(user, data.requested_password);
              await updateDoc(doc(db, 'profiles', user.uid), {
                password_change_status: 'completed',
                requested_password: ''
              });
              showToast('Your requested password change has been approved and applied!', 'success');
            } catch (err: any) {
              if (err.code === 'auth/requires-recent-login') {
                showToast('Please sign out and sign back in to apply your approved password change.', 'error');
              } else {
                console.error("Failed to apply password change:", err);
              }
            }
          }
        } else {
          setIsAdmin(false);
        }
      } catch (error) {
        console.error('Error loading user role:', error);
        setIsAdmin(false);
      }

      setRoleLoaded(true);
    };

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        navigate('/', { replace: true });
      } else {
        setLoading(false);
        loadRole(user);
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (!roleLoaded || !isAdmin) {
      return;
    }

    const requestsQuery = query(collection(db, 'requests'), orderBy('created_at', 'desc'));
    const unsubscribe = onSnapshot(requestsQuery, async (snapshot) => {
      const addedChanges = snapshot.docChanges().filter((change) => change.type === 'added');

      if (initialRequestLoadRef.current) {
        addedChanges.forEach((change) => seenRequestIdsRef.current.add(change.doc.id));
        initialRequestLoadRef.current = false;
        return;
      }

      for (const change of addedChanges) {
        const requestData = change.doc.data() as any;
        if (requestData.status !== 'pending') continue;

        const requestId = change.doc.id;
        if (seenRequestIdsRef.current.has(requestId)) continue;
        seenRequestIdsRef.current.add(requestId);

        const qty = requestData.quantity || 0;
        const requestUserId = requestData.user_id || '';
        const requestMaterialId = requestData.material_ref || requestData.material_id || '';

        let userName = 'A user';
        let materialName = 'an item';

        try {
          if (requestUserId) {
            const profileDoc = await getDoc(doc(db, 'profiles', requestUserId));
            if (profileDoc.exists()) {
              const profileData = profileDoc.data();
              userName = profileData.full_name || profileData.email || userName;
            } else {
              userName = requestUserId;
            }
          }
        } catch (error) {
          console.error('Failed to resolve request user name:', error);
          userName = requestUserId || userName;
        }

        try {
          if (requestMaterialId) {
            const materialDoc = await getDoc(doc(db, 'materials', requestMaterialId));
            if (materialDoc.exists()) {
              const materialData = materialDoc.data();
              materialName = materialData.name || requestMaterialId;
            } else {
              materialName = requestMaterialId;
            }
          }
        } catch (error) {
          console.error('Failed to resolve material name:', error);
          materialName = requestMaterialId || materialName;
        }

        showToast(`New request received: ${userName} asked for ${qty} of ${materialName}`, 'success');

        try {
          await addDoc(collection(db, 'material_logs'), {
            material_ref: requestMaterialId,
            material_name: materialName,
            action_type: 'REQUEST_NOTIFICATION',
            quantity: qty,
            reason: `Admin notified of new request from ${userName}`,
            user_id: auth.currentUser?.uid || null,
            created_at: new Date().toISOString()
          });
        } catch (error) {
          console.error('Failed to log admin notification:', error);
        }
      }
    });

    return () => unsubscribe();
  }, [isAdmin, roleLoaded]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-gray-50 overflow-hidden font-[var(--sans)]">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className={`flex-1 flex flex-col h-screen overflow-y-auto w-full transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-0'} md:ml-64`}>
        {/* Main Header / Topbar (optional, but good for design) */}
        <header className="bg-white border-b border-gray-200 h-[72px] flex items-center justify-between px-4 md:px-8 sticky top-0 z-40 shadow-sm shrink-0">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <Menu className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="text-lg font-bold text-gray-800 font-[var(--heading)]">Supply Inventory Management System</h1>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 md:p-8 overflow-x-hidden">
          <div className="w-full max-w-[1400px] mx-auto h-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
