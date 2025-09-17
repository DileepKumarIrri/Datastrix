const { query, uuidv4, poolPromise, sql } = require('../config/db');
const admin = require('../config/firebase');
const { sendOtpEmail } = require('../services/emailService');
const { triggerChunkDeletion } = require('../services/pythonApiService');
const fs = require('fs').promises;
const path = require('path');

// In-memory store for OTPs. In a production environment, use a more persistent store like Redis.
const otpStore = new Map();

/**
 * Generates and stores an OTP for a given email and purpose.
 * @param {string} email - The user's email.
 * @param {string} purpose - The reason for the OTP (e.g., 'signup', 'delete_account').
 * @returns {string} The generated OTP.
 */
const generateAndStoreOtp = (email, purpose) => {
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
    const expires = Date.now() + 10 * 60 * 1000; // OTP expires in 10 minutes
    otpStore.set(email, { otp, expires, purpose });
    return otp;
};

/**
 * Verifies an OTP for a given email and purpose. Consumes the OTP on success.
 * @param {string} email - The user's email.
 * @param {string} otp - The OTP provided by the user.
 * @param {string} purpose - The purpose the OTP was generated for.
 * @returns {{isValid: boolean, message: string}}
 */
const verifyAndConsumeOtp = (email, otp, purpose) => {
    const storedOtpData = otpStore.get(email);
    if (!storedOtpData) {
        return { isValid: false, message: 'No OTP found for this email. Please request a new one.' };
    }
    if (storedOtpData.otp !== otp) {
        return { isValid: false, message: 'Invalid OTP.' };
    }
    if (Date.now() > storedOtpData.expires) {
        otpStore.delete(email);
        return { isValid: false, message: 'OTP has expired. Please request a new one.' };
    }
    if (storedOtpData.purpose !== purpose) {
        return { isValid: false, message: 'OTP purpose mismatch.' };
    }
    
    otpStore.delete(email); // Consume the OTP
    return { isValid: true, message: 'OTP verified successfully.' };
};


// --- OTP Management ---

const sendOtp = async (req, res) => {
    const { purpose } = req.body;
    const email = req.user?.email || req.body.email; // Flexible for public/private use

    if (!email || !purpose) {
        return res.status(400).json({ message: 'Email and purpose are required.' });
    }

    const otp = generateAndStoreOtp(email, purpose);

    try {
        await sendOtpEmail(email, otp, purpose);
        res.status(200).json({ success: true, message: `OTP sent to ${email} for ${purpose}.` });
    } catch (error) {
        console.error(`Failed to send OTP for ${email}:`, error);
        res.status(500).json({ message: 'Failed to send OTP.' });
    }
};

const verifyOtp = async (req, res) => {
    const { email, otp, purpose } = req.body;
    if (!email || !otp || !purpose) {
        return res.status(400).json({ message: 'Email, OTP, and purpose are required.' });
    }
    const { isValid, message } = verifyAndConsumeOtp(email, otp, purpose);
    if (!isValid) return res.status(400).json({ message });
    res.status(200).json({ success: true, message: 'OTP verified successfully.' });
};


// --- Password Management Controllers ---

const forgotPasswordInitiate = async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required.' });

    try {
        const userCheck = await query('SELECT id FROM users WHERE email = @email', { email });
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ message: 'No account found with that email address.' });
        }
        const otp = generateAndStoreOtp(email, 'forgot_password');
        await sendOtpEmail(email, otp, 'forgot_password');
        res.status(200).json({ success: true, message: 'An OTP has been sent to your email.' });
    } catch (error) {
        console.error('Forgot Password Initiate Error:', error);
        res.status(500).json({ message: 'Server error during password reset process.' });
    }
};

const forgotPasswordConfirm = async (req, res) => {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
        return res.status(400).json({ message: 'Email, OTP, and new password are required.' });
    }

    const { isValid, message } = verifyAndConsumeOtp(email, otp, 'forgot_password');
    if (!isValid) return res.status(400).json({ message });
    
    try {
        const userResult = await query('SELECT firebase_uid FROM users WHERE email = @email', { email });
        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }
        const firebase_uid = userResult.rows[0].firebase_uid;
        await admin.auth().updateUser(firebase_uid, { password: newPassword });
        res.status(200).json({ success: true, message: 'Password has been reset successfully.' });
    } catch (error) {
        console.error('Forgot Password Confirm Error:', error);
        res.status(500).json({ message: 'Server error while resetting password.' });
    }
};

const changePasswordInitiate = async (req, res) => {
    const { email } = req.user;
    try {
        const otp = generateAndStoreOtp(email, 'change_password');
        await sendOtpEmail(email, otp, 'change_password');
        res.status(200).json({ success: true, message: 'An OTP has been sent to your email to confirm password change.' });
    } catch (error) {
        console.error('Change Password Initiate Error:', error);
        res.status(500).json({ message: 'Server error during password change process.' });
    }
};

const changePasswordConfirm = async (req, res) => {
    const { email, firebase_uid } = req.user;
    const { otp, newPassword } = req.body;

    if (!otp || !newPassword) {
        return res.status(400).json({ message: 'OTP and new password are required.' });
    }
    
    const { isValid, message } = verifyAndConsumeOtp(email, otp, 'change_password');
    if (!isValid) return res.status(400).json({ message });
    
    try {
        await admin.auth().updateUser(firebase_uid, { password: newPassword });
        res.status(200).json({ success: true, message: 'Password changed successfully.' });
    } catch (error) {
        console.error('Change Password Confirm Error:', error);
        res.status(500).json({ message: 'Server error while changing password.' });
    }
};


// --- Register User Profile in local DB ---
const registerProfile = async (req, res) => {
    const { firebase_uid, email } = req.user; // from authMiddleware
    const { name, organizationName, designation } = req.body;

    if (!name || !organizationName || !designation) {
        return res.status(400).json({ message: 'Name, organization, and designation are required.' });
    }

    try {
        const checkUserSql = 'SELECT id FROM users WHERE firebase_uid = @firebase_uid';
        const existingUser = await query(checkUserSql, { firebase_uid });
        if (existingUser.rows.length > 0) {
            return res.status(409).json({ message: 'User profile already exists.' });
        }

        const newUser = {
            id: uuidv4(),
            firebase_uid: firebase_uid,
            email: email,
            name: name,
            organization_name: organizationName,
            designation: designation,
            role: 'user',
        };

        const insertSql = `
            INSERT INTO users (id, firebase_uid, email, name, organization_name, designation, role) 
            OUTPUT INSERTED.*
            VALUES (@id, @firebase_uid, @email, @name, @organization_name, @designation, @role)
        `;
        const result = await query(insertSql, newUser);
        const dbUser = result.rows[0];

        const userResponse = {
            id: dbUser.id,
            email: dbUser.email,
            role: dbUser.role,
            name: dbUser.name,
            organizationName: dbUser.organization_name,
            designation: dbUser.designation
        };

        res.status(201).json({ user: userResponse });
    } catch (error) {
        console.error('Register Profile Error:', error);
        res.status(500).json({ message: 'Server error during profile registration.' });
    }
};


// --- Get User Profile ---
const getUserProfile = async (req, res) => {
    const { id, email, role, name, organization_name, designation } = req.user;
    if (!id) {
        return res.status(404).json({ message: 'User profile not found. Please complete registration.' });
    }
    res.status(200).json({ id, email, role, name, organizationName: organization_name, designation });
};

// --- Update User Profile ---
const updateUserProfile = async (req, res) => {
    const { id: userId } = req.user;
    const { name, designation } = req.body;
    
    if (!name && !designation) {
        return res.status(400).json({ message: 'At least one field is required.' });
    }

    let setClauses = [];
    let params = { userId };
    if (name) {
        setClauses.push(`name = @name`);
        params.name = name;
    }
    if (designation) {
        setClauses.push(`designation = @designation`);
        params.designation = designation;
    }
    
    const updateQuery = `UPDATE users SET ${setClauses.join(', ')} OUTPUT INSERTED.* WHERE id = @userId`;

    try {
        const result = await query(updateQuery, params);
        if (result.rows.length === 0) return res.status(404).json({ message: 'User not found.' });
        const dbUser = result.rows[0];
        const userResponse = {
            id: dbUser.id,
            email: dbUser.email,
            role: dbUser.role,
            name: dbUser.name,
            organizationName: dbUser.organization_name,
            designation: dbUser.designation
        };
        res.status(200).json({ success: true, user: userResponse });
    } catch (error) {
        console.error('Update Profile Error:', error);
        res.status(500).json({ message: 'Server error during profile update.' });
    }
};

// --- Delete User Account (with OTP verification) ---
const deleteUserAccount = async (req, res) => {
    const { id: userId, firebase_uid, email } = req.user;
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ message: 'OTP is required.' });

    const { isValid, message } = verifyAndConsumeOtp(email, otp, 'delete_account');
    if (!isValid) return res.status(401).json({ message });

    const pool = await poolPromise;
    const transaction = pool.transaction();
    const userUploadDir = path.join(__dirname, '..', 'uploads', userId);
    let userFiles = [];

    try {
        const filesResult = await query('SELECT id FROM files WHERE user_id = @userId', { userId });
        userFiles = filesResult.rows;

        await transaction.begin();
        const request = transaction.request();
        // Deleting from the users table will cascade to all other user-related tables.
        await request.input('userId', sql.NVarChar, userId).query('DELETE FROM users WHERE id = @userId');
        
        await admin.auth().deleteUser(firebase_uid);

        if (userFiles.length > 0) {
            const fileIdsToDelete = userFiles.map(f => f.id);
            triggerChunkDeletion(fileIdsToDelete);
        }
        
        await transaction.commit();

        // Delete the physical upload directory for the user.
        try {
            await fs.rm(userUploadDir, { recursive: true, force: true });
            console.log(`Successfully deleted user upload directory ${userUploadDir}`);
        } catch (dirErr) {
            // Log if directory doesn't exist, but don't fail the request.
            if (dirErr.code !== 'ENOENT') {
                console.error(`Failed to delete user directory ${userUploadDir}:`, dirErr);
            }
        }
        
        res.status(200).json({ success: true, message: 'Account deleted successfully.' });

    } catch (error) {
        await transaction.rollback();
        console.error('Delete Account Error:', error);
        // Don't leak detailed error info to the client
        res.status(500).json({ message: 'Server error during account deletion. Your account may be in an inconsistent state. Please contact support.' });
    }
};

// --- Cancel Signup (delete orphaned Firebase user) ---
const cancelSignup = async (req, res) => {
    const { firebase_uid } = req.user;

    // A basic check to ensure this is a new user without a DB profile yet
    if (req.user.id) {
        return res.status(400).json({ message: 'This action is only for incomplete signups.' });
    }

    try {
        await admin.auth().deleteUser(firebase_uid);
        console.log(`Successfully deleted orphaned Firebase user: ${firebase_uid}`);
        res.status(200).json({ success: true, message: 'Signup cancelled and user cleared.' });
    } catch (error) {
        console.error(`Failed to delete orphaned Firebase user ${firebase_uid}:`, error);
        res.status(500).json({ message: 'Server error during signup cancellation.' });
    }
};

module.exports = {
  registerProfile,
  getUserProfile,
  updateUserProfile,
  deleteUserAccount,
  sendOtp,
  verifyOtp,
  forgotPasswordInitiate,
  forgotPasswordConfirm,
  changePasswordInitiate,
  changePasswordConfirm,
  cancelSignup,
};