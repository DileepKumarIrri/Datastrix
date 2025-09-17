


const express = require('express');
const router = express.Router();
const {
    createChatSession,
    getChatSessions,
    getChatMessages,
    postChatMessage,
    deleteChatSession,
    getChatSessionFiles,
    addFilesToSession,
    removeFileFromSession,
    updateChatSession,
    generateTitleForChat,
} = require('../controllers/chatController');
const { protect } = require('../middleware/authMiddleware');

// @route   POST /api/chat/session
// @desc    Create a new chat session
// @access  Private
router.post('/session', protect, createChatSession);

// @route   PUT /api/chat/session/:id
// @desc    Update a chat session (e.g., rename)
// @access  Private
router.put('/session/:id', protect, updateChatSession);

// @route   GET /api/chat/sessions
// @desc    Get all chat sessions for the logged-in user
// @access  Private
router.get('/sessions', protect, getChatSessions);

// @route   GET /api/chat/session/:id/files
// @desc    Get all files for a specific chat session
// @access  Private
router.get('/session/:id/files', protect, getChatSessionFiles);

// @route   POST /api/chat/session/:id/files
// @desc    Add one or more files to a chat session
// @access  Private
router.post('/session/:id/files', protect, addFilesToSession);

// @route   DELETE /api/chat/session/:id/file/:fileId
// @desc    Remove a file from a chat session
// @access  Private
router.delete('/session/:id/file/:fileId', protect, removeFileFromSession);

// @route   GET /api/chat/session/:id/messages
// @desc    Get all messages for a specific chat session
// @access  Private
router.get('/session/:id/messages', protect, getChatMessages);

// @route   POST /api/chat/message
// @desc    Post a message to a chat session
// @access  Private
router.post('/message', protect, postChatMessage);

// @route   DELETE /api/chat/session/:id
// @desc    Delete a chat session and its messages
// @access  Private
router.delete('/session/:id', protect, deleteChatSession);

// @route   POST /api/chat/generate-title
// @desc    Generate a title for a chat based on a prompt
// @access  Private
router.post('/generate-title', protect, generateTitleForChat);

module.exports = router;