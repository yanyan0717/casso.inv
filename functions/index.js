const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

admin.initializeApp();

// Configure email transporter with your Gmail credentials
// Set these using Firebase CLI: firebase functions:config:set gmail.email="..." gmail.password="..."
let transporter = null;

function getTransporter() {
  if (!transporter) {
    const config = functions.config();
    
    if (!config.gmail || !config.gmail.email || !config.gmail.password) {
      console.warn('Gmail configuration not set. Email notifications will not work.');
      console.warn('Run: firebase functions:config:set gmail.email="your.email@gmail.com" gmail.password="your-app-password"');
      return null;
    }

    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.gmail.email,
        pass: config.gmail.password,
      },
    });
  }
  return transporter;
}

/**
 * Cloud Function to request device approval
 * Called from the frontend when a new device attempts to login
 */
exports.requestDeviceApproval = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    const { userId, userEmail, deviceId, deviceName } = data;

    // Validate required fields
    if (!userId || !userEmail || !deviceId || !deviceName) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Missing required fields: userId, userEmail, deviceId, deviceName'
      );
    }

    // Verify user is authenticated
    if (!context.auth || context.auth.uid !== userId) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Unauthorized: User ID mismatch'
      );
    }

    try {
      // Generate secure approval token (expires in 30 minutes)
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = Date.now() + 30 * 60 * 1000; // 30 minutes

      // Store pending approval in Firestore
      const db = admin.firestore();
      await db
        .collection('users')
        .doc(userId)
        .collection('pendingApprovals')
        .doc(deviceId)
        .set({
          deviceId: deviceId,
          deviceName: deviceName,
          token: token,
          expiresAt: expiresAt,
          status: 'pending',
          requestedAt: admin.firestore.FieldValue.serverTimestamp(),
          ipAddress: context.rawRequest.headers['x-forwarded-for'] || context.rawRequest.connection.remoteAddress,
          userAgent: context.rawRequest.headers['user-agent'],
        });

      // Get your app's domain (update this to your actual domain)
      const appDomain = process.env.APP_DOMAIN || 'https://yourdomain.com';
      
      // Create approval URLs
      const approvalUrl = `${appDomain}/approve-device?token=${token}&userId=${userId}&deviceId=${deviceId}`;
      const denyUrl = `${appDomain}/deny-device?token=${token}&userId=${userId}&deviceId=${deviceId}`;

      // Get email transporter
      const mailer = getTransporter();
      
      if (!mailer) {
        // Log but don't fail - developer can fix config later
        console.log('Email transporter not configured. Device approval registered but email not sent.');
      } else {
        // Send approval email
        const mailOptions = {
          from: `"Casso Inventory System" <${functions.config().gmail.email}>`,
          to: userEmail,
          subject: '🔐 New Device Login Request - Casso Inventory System',
          html: generateEmailHTML(
            deviceName,
            deviceId,
            approvalUrl,
            denyUrl,
            new Date().toLocaleString()
          ),
        };

        await mailer.sendMail(mailOptions);
        console.log(`Device approval email sent to ${userEmail} for device: ${deviceName}`);
      }

      return {
        success: true,
        message: 'Approval request created. Check your email for the approval link.',
      };
    } catch (error) {
      console.error('Error requesting device approval:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to process device approval request: ' + error.message
      );
    }
  });

/**
 * HTTP endpoint for handling device approval (when user clicks approve link in email)
 * This function processes approval from email links
 */
exports.handleDeviceApproval = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    // Enable CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'GET') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    try {
      const { token, userId, deviceId, action } = req.query;

      // Validate required parameters
      if (!token || !userId || !deviceId) {
        return res.status(400).send(generateErrorPage('Missing required parameters'));
      }

      if (action !== 'approve' && action !== 'deny') {
        return res.status(400).send(generateErrorPage('Invalid action'));
      }

      const db = admin.firestore();
      const pendingRef = db
        .collection('users')
        .doc(userId)
        .collection('pendingApprovals')
        .doc(deviceId);

      const pendingDoc = await pendingRef.get();

      if (!pendingDoc.exists) {
        return res.status(404).send(
          generateErrorPage('Device approval request not found or already processed')
        );
      }

      const pendingData = pendingDoc.data();

      // Verify token matches
      if (pendingData.token !== token) {
        return res.status(401).send(generateErrorPage('Invalid approval token'));
      }

      // Check if token has expired
      if (pendingData.expiresAt < Date.now()) {
        await pendingRef.delete();
        return res.status(410).send(
          generateErrorPage('This approval link has expired. Please try logging in again.')
        );
      }

      if (action === 'approve') {
        // Add device to approved devices
        await db
          .collection('users')
          .doc(userId)
          .collection('devices')
          .doc(deviceId)
          .set({
            deviceId: deviceId,
            deviceName: pendingData.deviceName,
            approvedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastUsed: admin.firestore.FieldValue.serverTimestamp(),
            approvalToken: token,
          });

        // Delete pending approval
        await pendingRef.delete();

        // Send approval confirmation email
        const userEmail = (await db.collection('users').doc(userId).get()).data()?.email;
        if (userEmail) {
          const mailer = getTransporter();
          if (mailer) {
            try {
              await mailer.sendMail({
                from: `"Casso Inventory System" <${functions.config().gmail.email}>`,
                to: userEmail,
                subject: '✓ Device Approved - Casso Inventory System',
                html: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #4CAF50;">✓ Device Approved</h2>
                    <p>Your device <strong>${pendingData.deviceName}</strong> has been approved for login.</p>
                    <p>You can now access your Casso Inventory System account from this device.</p>
                    <hr style="margin: 30px 0;">
                    <p style="color: #999; font-size: 12px;">
                      If you didn't approve this device, please revoke it immediately from your account settings.
                    </p>
                  </div>
                `,
              });
            } catch (emailError) {
              console.warn('Failed to send approval confirmation email:', emailError);
            }
          }
        }

        return res.send(generateSuccessPage(
          '✓ Device Approved!',
          'Your device has been approved. You can now log in to your Casso Inventory System account.'
        ));
      } else if (action === 'deny') {
        // Delete pending approval without adding device
        await pendingRef.delete();

        // Send denial notification email
        const userEmail = (await db.collection('users').doc(userId).get()).data()?.email;
        if (userEmail) {
          const mailer = getTransporter();
          if (mailer) {
            try {
              await mailer.sendMail({
                from: `"Casso Inventory System" <${functions.config().gmail.email}>`,
                to: userEmail,
                subject: '⛔ Login Attempt Blocked - Casso Inventory System',
                html: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #f44336;">Login Attempt Blocked</h2>
                    <p>A login attempt from <strong>${pendingData.deviceName}</strong> was denied.</p>
                    <p>If this wasn't you, your account is secure.</p>
                    <p>If you believe this was a mistake, you can try logging in again.</p>
                    <hr style="margin: 30px 0;">
                    <p style="color: #999; font-size: 12px;">
                      For security reasons, we only allow logins from approved devices.
                    </p>
                  </div>
                `,
              });
            } catch (emailError) {
              console.warn('Failed to send denial notification email:', emailError);
            }
          }
        }

        return res.send(generateSuccessPage(
          '✓ Access Denied',
          'The login attempt has been blocked. If this wasn\'t you, your account is secure.'
        ));
      }
    } catch (error) {
      console.error('Error handling device approval:', error);
      return res.status(500).send(
        generateErrorPage('An error occurred processing your request. Please try again.')
      );
    }
  });

/**
 * HTML email template for device approval requests
 */
function generateEmailHTML(deviceName, deviceId, approvalUrl, denyUrl, timestamp) {
  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 20px; border-radius: 8px;">
      <div style="background: white; padding: 30px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        
        <!-- Header -->
        <div style="border-bottom: 3px solid #10b981; padding-bottom: 20px; margin-bottom: 30px;">
          <h1 style="color: #111827; margin: 0; font-size: 24px;">🔐 New Device Login Request</h1>
          <p style="color: #6b7280; margin: 10px 0 0 0; font-size: 14px;">Casso Inventory System</p>
        </div>

        <!-- Main Content -->
        <p style="color: #374151; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
          We detected a login attempt to your Casso Inventory System account from a new device. 
          Please verify this is you.
        </p>

        <!-- Device Info -->
        <div style="background: #f3f4f6; border-left: 4px solid #10b981; padding: 15px; margin: 25px 0; border-radius: 4px;">
          <p style="margin: 0; color: #6b7280; font-size: 12px; text-transform: uppercase; font-weight: 600;">Device Information</p>
          <p style="margin: 8px 0 0 0; color: #111827; font-size: 16px; font-weight: 600;">${deviceName}</p>
          <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 13px;">ID: ${deviceId.substring(0, 16)}...</p>
          <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 13px;">📅 ${timestamp}</p>
        </div>

        <!-- Action Buttons -->
        <div style="margin: 30px 0;">
          <p style="color: #374151; font-size: 14px; margin-bottom: 15px; font-weight: 600;">
            Was this you? Choose an action:
          </p>
          
          <div style="display: flex; gap: 12px; margin-bottom: 20px;">
            <a href="${approvalUrl}" style="flex: 1; display: inline-block; background: #10b981; color: white; padding: 14px 20px; text-decoration: none; border-radius: 6px; font-weight: 600; text-align: center; font-size: 14px; transition: background 0.2s;">
              ✓ Approve This Device
            </a>
            <a href="${denyUrl}" style="flex: 1; display: inline-block; background: #ef4444; color: white; padding: 14px 20px; text-decoration: none; border-radius: 6px; font-weight: 600; text-align: center; font-size: 14px; transition: background 0.2s;">
              ✕ Deny Access
            </a>
          </div>
        </div>

        <!-- Security Notice -->
        <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 25px 0; border-radius: 4px;">
          <p style="margin: 0; color: #78350f; font-size: 13px;">
            <strong>⚠️ Security Notice:</strong> If you did not attempt this login, someone may be trying to access your account. 
            We recommend choosing "Deny Access" and changing your password immediately.
          </p>
        </div>

        <!-- Footer -->
        <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 30px;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0; line-height: 1.6;">
            This approval link will expire in <strong>30 minutes</strong> for security reasons.<br>
            If you didn't request this login, simply ignore this email and your account will remain secure.
          </p>
          <p style="color: #9ca3af; font-size: 12px; margin: 15px 0 0 0;">
            &copy; 2024 Casso Inventory System. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  `;
}

/**
 * HTML template for success page
 */
function generateSuccessPage(title, message) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0;
            padding: 20px;
          }
          .container {
            background: white;
            border-radius: 8px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            padding: 40px;
            text-align: center;
            max-width: 500px;
          }
          .success-icon {
            font-size: 64px;
            margin-bottom: 20px;
          }
          h1 {
            color: #10b981;
            font-size: 28px;
            margin: 0 0 15px 0;
          }
          p {
            color: #6b7280;
            font-size: 16px;
            line-height: 1.6;
            margin: 0;
          }
          .next-steps {
            background: #f3f4f6;
            border-radius: 6px;
            padding: 20px;
            margin-top: 30px;
            text-align: left;
          }
          .next-steps p {
            text-align: center;
            color: #374151;
            font-weight: 600;
            margin-bottom: 10px;
          }
          .next-steps li {
            color: #6b7280;
            margin: 10px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success-icon">✓</div>
          <h1>${title}</h1>
          <p>${message}</p>
          <div class="next-steps">
            <p>Next Steps:</p>
            <ul style="margin: 0; padding: 0 20px;">
              <li>Return to your application</li>
              <li>Sign in again with your credentials</li>
              <li>Your device is now approved for future logins</li>
            </ul>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * HTML template for error page
 */
function generateErrorPage(message) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Error</title>
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0;
            padding: 20px;
          }
          .container {
            background: white;
            border-radius: 8px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            padding: 40px;
            text-align: center;
            max-width: 500px;
          }
          .error-icon {
            font-size: 64px;
            margin-bottom: 20px;
          }
          h1 {
            color: #ef4444;
            font-size: 28px;
            margin: 0 0 15px 0;
          }
          p {
            color: #6b7280;
            font-size: 16px;
            line-height: 1.6;
            margin: 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="error-icon">⚠️</div>
          <h1>Error</h1>
          <p>${message}</p>
        </div>
      </body>
    </html>
  `;
}
