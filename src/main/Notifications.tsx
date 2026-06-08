import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, deleteDoc, writeBatch, getDocs, getDoc, updateDoc, addDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { showToast } from '../components/Toast';
import { Bell, Trash2, CheckCircle, XCircle, Clock, Check, X } from 'lucide-react';
import { TableSkeleton } from '../components/SkeletonLoader';

interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'approval' | 'rejection' | 'info' | 'pending_user_approval';
  created_at: string;
  read: boolean;
  request_id?: string;
}

export default function Notifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    // 1. Cleanup old notifications (older than 30 days)
    const cleanupOldNotifications = async () => {
      try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const isoThreshold = thirtyDaysAgo.toISOString();

        const oldNotifsQuery = query(
          collection(db, 'notifications'),
          where('user_id', '==', user.uid),
          where('created_at', '<', isoThreshold)
        );
        
        const snapshot = await getDocs(oldNotifsQuery);
        if (!snapshot.empty) {
          const batch = writeBatch(db);
          snapshot.forEach(docSnap => batch.delete(docSnap.ref));
          await batch.commit();
        }
      } catch (error) {
        console.error('Failed to cleanup old notifications:', error);
      }
    };

    cleanupOldNotifications();

    // 2. Subscribe to notifications
    const q = query(
      collection(db, 'notifications'),
      where('user_id', '==', user.uid),
      orderBy('created_at', 'desc')
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Notification));
      setNotifications(data);
      setLoading(false);

      // 3. Mark unread (non-actionable) notifications as read
      const unreadDocs = snapshot.docs.filter(d => !d.data().read && d.data().type !== 'pending_user_approval');
      if (unreadDocs.length > 0) {
        try {
          const batch = writeBatch(db);
          unreadDocs.forEach(docSnap => {
            batch.update(docSnap.ref, { read: true });
          });
          await batch.commit();
        } catch (error) {
          console.error('Failed to mark notifications as read:', error);
        }
      }
    }, (error) => {
      console.error('Failed to fetch notifications:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'notifications', id));
      showToast('Notification deleted', 'success');
    } catch (error: any) {
      showToast('Failed to delete notification: ' + error.message, 'error');
    }
  };

  const handleAcceptPartial = async (notif: Notification) => {
    if (!notif.request_id) return;
    setActioningId(notif.id);
    try {
      // Fetch request to get approved_quantity and material info
      const requestSnap = await getDoc(doc(db, 'requests', notif.request_id));
      if (!requestSnap.exists()) {
        showToast('Request not found.', 'error');
        return;
      }
      const requestData = requestSnap.data();
      const approvedQty: number = requestData.approved_quantity;
      const materialRef = requestData.material_ref || requestData.material_id;

      if (!materialRef) {
        showToast('Material reference missing for this request.', 'error');
        return;
      }

      // Fetch material to check current stock
      const materialSnap = await getDoc(doc(db, 'materials', materialRef));
      if (!materialSnap.exists()) {
        showToast('Material not found.', 'error');
        return;
      }
      const materialData = materialSnap.data();
      const currentStock: number = materialData.stocks;

      if (currentStock < approvedQty) {
        showToast('Insufficient stock available. Contact admin.', 'error');
        return;
      }

      // Deduct stock
      await updateDoc(doc(db, 'materials', materialRef), { stocks: currentStock - approvedQty });

      // Log the action
      await addDoc(collection(db, 'material_logs'), {
        material_ref: materialRef,
        material_name: materialData.name,
        action_type: 'APPROVED_REQUEST',
        quantity: approvedQty,
        reason: `Partial approval accepted by user (${approvedQty} of ${requestData.quantity} requested).`,
        user_id: auth.currentUser?.uid || null,
        created_at: new Date().toISOString()
      });

      // Update request status
      await updateDoc(doc(db, 'requests', notif.request_id), { status: 'approved' });

      // Mark notification as actioned (change type and read)
      await updateDoc(doc(db, 'notifications', notif.id), {
        type: 'approval',
        read: true,
        title: 'Partial Approval Accepted',
        message: `You accepted ${approvedQty} ${materialData.name}. Stock has been deducted.`
      });

      showToast(`Accepted! ${approvedQty} ${materialData.name} approved.`, 'success');
    } catch (error: any) {
      showToast('Failed to accept: ' + error.message, 'error');
    } finally {
      setActioningId(null);
    }
  };

  const handleDeclinePartial = async (notif: Notification) => {
    if (!notif.request_id) return;
    setActioningId(notif.id);
    try {
      // Update request status to rejected
      await updateDoc(doc(db, 'requests', notif.request_id), { status: 'rejected' });

      // Mark notification as actioned
      await updateDoc(doc(db, 'notifications', notif.id), {
        type: 'rejection',
        read: true,
        title: 'Partial Approval Declined',
        message: 'You declined the admin\'s partial approval. The request has been rejected.'
      });

      showToast('Partial approval declined.', 'error');
    } catch (error: any) {
      showToast('Failed to decline: ' + error.message, 'error');
    } finally {
      setActioningId(null);
    }
  };

  const getDaysLeft = (createdAt: string) => {
    const createdDate = new Date(createdAt);
    if (Number.isNaN(createdDate.getTime())) return 0;
    const diffMs = Date.now() - createdDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return Math.max(0, 30 - diffDays);
  };

  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'approval':
        return <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center"><CheckCircle className="w-5 h-5 text-emerald-600" /></div>;
      case 'rejection':
        return <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center"><XCircle className="w-5 h-5 text-red-600" /></div>;
      case 'pending_user_approval':
        return <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center"><Clock className="w-5 h-5 text-blue-600" /></div>;
      default:
        return <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center"><Bell className="w-5 h-5 text-gray-500" /></div>;
    }
  };

  return (
    <div className="flex flex-col space-y-4 relative w-full max-w-3xl pb-8 mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 font-[var(--heading)] tracking-tight">Notifications</h2>
          <p className="text-sm text-gray-600 mt-1 font-medium">
            Stay updated on the status of your material requests.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-md shadow-sm border border-gray-200 overflow-hidden min-h-[400px]">
        {loading ? (
          <div className="p-4">
            <TableSkeleton rows={5} cols={1} />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
              <Bell className="w-8 h-8 text-gray-300" />
            </div>
            <p className="font-medium text-gray-500 text-base">No notifications found.</p>
            <p className="text-sm text-gray-400 mt-1">You're all caught up!</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {notifications.map((notif) => (
              <div
                key={notif.id}
                className={`p-4 flex gap-4 transition-all duration-200 hover:bg-slate-50 ${notif.type === 'pending_user_approval' ? 'bg-blue-50/40 border-l-4 border-blue-400' : !notif.read ? 'bg-blue-50/20' : 'bg-white'}`}
              >
                <div className="flex-shrink-0 mt-1">
                  {getIcon(notif.type)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h4 className="text-sm font-bold text-gray-900 truncate">{notif.title}</h4>
                    <span className="text-xs font-medium text-gray-400 whitespace-nowrap">
                      {new Date(notif.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{notif.message}</p>

                  {/* Accept / Decline buttons for partial approvals */}
                  {notif.type === 'pending_user_approval' && (
                    <div className="flex items-center gap-2 mt-3">
                      <button
                        onClick={() => handleAcceptPartial(notif)}
                        disabled={actioningId === notif.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50 shadow-sm"
                      >
                        <Check className="w-3.5 h-3.5" /> Accept
                      </button>
                      <button
                        onClick={() => handleDeclinePartial(notif)}
                        disabled={actioningId === notif.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors disabled:opacity-50 shadow-sm"
                      >
                        <X className="w-3.5 h-3.5" /> Decline
                      </button>
                      {actioningId === notif.id && (
                        <span className="text-xs text-gray-400 ml-1">Processing...</span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-4 text-xs font-medium mt-2">
                    <span className={`${getDaysLeft(notif.created_at) <= 5 ? 'text-orange-500' : 'text-gray-400'}`}>
                      Auto-deletes in {getDaysLeft(notif.created_at)} days
                    </span>
                  </div>
                </div>

                <div className="flex-shrink-0 flex items-start pt-1">
                  <button
                    onClick={() => handleDelete(notif.id)}
                    disabled={actioningId === notif.id}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30"
                    title="Delete notification"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
