import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader, CheckCircle, XCircle } from 'lucide-react';

export default function DeviceApprovalPage() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Processing your device approval...');

  useEffect(() => {
    const handleApproval = async () => {
      const token = searchParams.get('token');
      const userId = searchParams.get('userId');
      const deviceId = searchParams.get('deviceId');

      if (!token || !userId || !deviceId) {
        setStatus('error');
        setMessage('Invalid approval link. Missing required parameters.');
        return;
      }

      try {
        // Call the Cloud Function endpoint
        const action = window.location.pathname.includes('approve') ? 'approve' : 'deny';
        const response = await fetch(
          `/approve-device?token=${token}&userId=${userId}&deviceId=${deviceId}&action=${action}`
        );

        if (response.ok) {
          setStatus('success');
          const actionText = action === 'approve' ? 'approved' : 'denied';
          setMessage(`Device ${actionText} successfully! You can now close this window.`);
        } else {
          setStatus('error');
          const text = await response.text();
          setMessage('Failed to process your request. Please try again or contact support.');
        }
      } catch (error) {
        console.error('Approval error:', error);
        setStatus('error');
        setMessage('An error occurred while processing your request. Please try again.');
      }
    };

    handleApproval();
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-8 text-center">
        {status === 'loading' && (
          <>
            <div className="flex justify-center mb-6">
              <Loader className="w-12 h-12 text-blue-600 animate-spin" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Processing...</h2>
            <p className="text-gray-600">{message}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="flex justify-center mb-6">
              <CheckCircle className="w-12 h-12 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-green-600 mb-2">Success!</h2>
            <p className="text-gray-600 mb-6">{message}</p>
            <p className="text-sm text-gray-500">
              You can return to the login page and sign in with your approved device.
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="flex justify-center mb-6">
              <XCircle className="w-12 h-12 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-red-600 mb-2">Error</h2>
            <p className="text-gray-600 mb-6">{message}</p>
            <a
              href="/login"
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition"
            >
              Return to Login
            </a>
          </>
        )}
      </div>
    </div>
  );
}
