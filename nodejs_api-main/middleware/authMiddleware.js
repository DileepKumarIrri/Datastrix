const admin = require('../config/firebase');
const { query } = require('../config/db');

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decodedToken = await admin.auth().verifyIdToken(token);
      
      const sql = 'SELECT id, firebase_uid, email, role, name, organization_name, designation FROM users WHERE firebase_uid = @firebase_uid';
      const result = await query(sql, { firebase_uid: decodedToken.uid });
      
      if (result.rows.length === 0) {
        // This case can happen if a user exists in Firebase but not in our DB yet.
        // We attach a partial user object for endpoints that might create the profile (like registerProfile).
        req.user = { id: null, firebase_uid: decodedToken.uid, email: decodedToken.email };
        console.log(`[Auth Middleware] New Firebase user authenticated: ${req.user.email} (UID: ${req.user.firebase_uid})`);
        return next();
      }

      req.user = result.rows[0];
      console.log(`[Auth Middleware] User authenticated: ${req.user.email} (ID: ${req.user.id})`);
      return next();
    } catch (error) {
      console.error('[Auth Middleware] Token verification failed:', error.message);
      let message = 'Not authorized, token failed';
      if (error.code === 'auth/id-token-expired') {
          message = 'Your session has expired. Please log in again.';
      }
      return res.status(401).json({ message });
    }
  }

  return res.status(401).json({ message: 'Not authorized, no token provided' });
};

module.exports = { protect };