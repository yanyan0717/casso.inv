import React, { useState } from 'react';
import { Mail, Clock } from 'lucide-react';

interface DeviceApprovalModalProps {
  deviceName: string;
  email: string;
  onClose: () => void;
}

export default function DeviceApprovalModal({
  deviceName,
  email,
  onClose,
}: DeviceApprovalModalProps) {
  const [copied, setCopied] = useState(false);

  const copyEmail = () => {
    navigator.clipboard.writeText(email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 rounded-full">
            <Mail className="w-6 h-6 text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Verify New Device</h2>
          <p className="text-sm text-gray-600">
            We detected a login from a new device
          </p>
        </div>

        {/* Device Info */}
        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
          <div>
            <p className="text-xs text-gray-500 uppercase font-semibold">Device</p>
            <p className="text-sm font-medium text-gray-900">{deviceName}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase font-semibold">Time</p>
            <p className="text-sm text-gray-700">{new Date().toLocaleString()}</p>
          </div>
        </div>

        {/* Instructions */}
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            To complete login, please check your email for an approval link:
          </p>
          
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-semibold">Approval link expires in 30 minutes</p>
              <p className="text-xs mt-1">Click the approve button in the email to allow this device</p>
            </div>
          </div>
        </div>

        {/* Email Display */}
        <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 uppercase font-semibold">Email</p>
            <p className="text-sm font-mono text-gray-900">{email}</p>
          </div>
          <button
            onClick={copyEmail}
            className="px-3 py-2 text-xs font-medium bg-white border border-gray-300 rounded hover:bg-gray-50 transition"
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>

        {/* Info Section */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs text-blue-900">
            <strong>Security Tip:</strong> Never approve a device login if you didn't attempt to sign in.
          </p>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 font-medium rounded-lg transition"
        >
          Close & Check Email
        </button>

        {/* Didn't receive email */}
        <p className="text-xs text-center text-gray-500">
          Didn't receive the email? Check your spam folder or try again.
        </p>
      </div>
    </div>
  );
}
