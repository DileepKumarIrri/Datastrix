
const express = require('express');
const router = express.Router();
const { 
    getMemories,
    addMemory,
    updateMemory,
    deleteMemory,
} = require('../controllers/memoryController');
const { protect } = require('../middleware/authMiddleware');

// @route   GET /api/memories
// @desc    Get all memories for the user
// @access  Private
router.get('/', protect, getMemories);

// @route   POST /api/memories
// @desc    Add a new memory for the user
// @access  Private
router.post('/', protect, addMemory);

// @route   PUT /api/memories/:id
// @desc    Update a user's memory
// @access  Private
router.put('/:id', protect, updateMemory);

// @route   DELETE /api/memories/:id
// @desc    Delete a user's memory
// @access  Private
router.delete('/:id', protect, deleteMemory);

module.exports = router;