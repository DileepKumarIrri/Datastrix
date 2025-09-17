const express = require('express');
const router = express.Router();
const { 
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
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

// --- OTP Routes (For signup and general purpose) ---
// This is used for signup OTP and delete account OTP
router.post('/otp/send', protect, sendOtp); // Private
router.post('/otp/verify', verifyOtp); // Public


// --- Password Management Routes ---

// @route   POST /api/auth/password/forgot-initiate
// @desc    Initiate forgotten password flow by sending an OTP.
// @access  Public
router.post('/password/forgot-initiate', forgotPasswordInitiate);

// @route   POST /api/auth/password/forgot-confirm
// @desc    Confirm forgotten password flow with OTP and set new password.
// @access  Public
router.post('/password/forgot-confirm', forgotPasswordConfirm);

// @route   POST /api/auth/password/change-initiate
// @desc    For a logged-in user, initiate a password change by sending an OTP.
// @access  Private
router.post('/password/change-initiate', protect, changePasswordInitiate);

// @route   POST /api/auth/password/change-confirm
// @desc    For a logged-in user, confirm password change with OTP and set new password.
// @access  Private
router.post('/password/change-confirm', protect, changePasswordConfirm);


// --- Profile and Account Management Routes (All Private) ---

// @route   POST /api/auth/register
// @desc    Create a user profile in the local DB after Firebase signup & OTP verification
// @access  Private
router.post('/register', protect, registerProfile);

// @route   GET /api/auth/profile
// @desc    Get user profile
// @access  Private
router.get('/profile', protect, getUserProfile);

// @route   PUT /api/auth/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', protect, updateUserProfile);

// @route   DELETE /api/auth/account
// @desc    Delete user account from local DB and Firebase (requires OTP)
// @access  Private
router.delete('/account', protect, deleteUserAccount);

// @route   DELETE /api/auth/account/cancel-signup
// @desc    Deletes a firebase user if they abandon the signup process.
// @access  Private
router.delete('/account/cancel-signup', protect, cancelSignup);


module.exports = router;