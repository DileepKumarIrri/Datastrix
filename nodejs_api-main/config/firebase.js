const admin = require('firebase-admin');
const path = require('path');

try {
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH;
  if (!serviceAccountPath) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY_PATH is not defined in .env file.');
  }

  // Resolve path from the directory where the node process was started.
  // This assumes you run `node server.js` from within the `backend-node` directory.
  const absoluteServiceAccountPath = path.resolve(process.cwd(), serviceAccountPath);
  const serviceAccount = require(absoluteServiceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  
  console.log('✅ Firebase Admin SDK initialized successfully.');

} catch (error) {
  console.error('❌ Firebase Admin SDK initialization error:', error.message);
  console.error('Please ensure that FIREBASE_SERVICE_ACCOUNT_KEY_PATH in your .env file points to a valid service account JSON file, and that the path is relative to the `backend-node` directory where you run the server.');
  process.exit(1);
}

module.exports = admin;