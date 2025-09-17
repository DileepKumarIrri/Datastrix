const { query, uuidv4 } = require('../config/db');

const MAX_MEMORIES = 50;

// --- Get all memories for a user ---
const getMemories = async (req, res) => {
    const { id: userId } = req.user;
    try {
        const sql = 'SELECT id, content FROM user_memories WHERE user_id = @userId ORDER BY created_at ASC';
        const result = await query(sql, { userId });
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Get Memories Error:', error);
        res.status(500).json({ message: 'Server error while fetching memories.' });
    }
};

// --- Add a new memory ---
const addMemory = async (req, res) => {
    const { id: userId } = req.user;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
        return res.status(400).json({ message: 'Memory content cannot be empty.' });
    }
    if (content.length > 500) {
        return res.status(400).json({ message: 'Memory content cannot exceed 500 characters.' });
    }

    try {
        const countResult = await query('SELECT COUNT(*) as count FROM user_memories WHERE user_id = @userId', { userId });
        const memoryCount = parseInt(countResult.rows[0].count, 10);

        if (memoryCount >= MAX_MEMORIES) {
            return res.status(403).json({ message: `You have reached the maximum limit of ${MAX_MEMORIES} memories.` });
        }

        const newMemoryId = uuidv4();
        const sql = 'INSERT INTO user_memories (id, user_id, content) OUTPUT INSERTED.id, INSERTED.content VALUES (@id, @userId, @content)';
        const result = await query(sql, { id: newMemoryId, userId, content: content.trim() });
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Add Memory Error:', error);
        res.status(500).json({ message: 'Server error while adding memory.' });
    }
};

// --- Update a memory ---
const updateMemory = async (req, res) => {
    const { id: userId } = req.user;
    const { id: memoryId } = req.params;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
        return res.status(400).json({ message: 'Memory content cannot be empty.' });
    }
    if (content.length > 500) {
        return res.status(400).json({ message: 'Memory content cannot exceed 500 characters.' });
    }

    try {
        const sql = 'UPDATE user_memories SET content = @content OUTPUT INSERTED.id, INSERTED.content WHERE id = @memoryId AND user_id = @userId';
        const result = await query(sql, { content: content.trim(), memoryId, userId });
        
        if (result.rows.length === 0) {
             return res.status(404).json({ message: 'Memory not found or access denied.' });
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('Update Memory Error:', error);
        res.status(500).json({ message: 'Server error while updating memory.' });
    }
};

// --- Delete a memory ---
const deleteMemory = async (req, res) => {
    const { id: userId } = req.user;
    const { id: memoryId } = req.params;

    try {
        const sql = 'DELETE FROM user_memories WHERE id = @memoryId AND user_id = @userId';
        const result = await query(sql, { memoryId, userId });

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Memory not found or access denied.' });
        }
        
        res.status(200).json({ success: true, message: 'Memory deleted successfully.' });
    } catch (err) {
        console.error('Delete Memory Error:', err);
        res.status(500).json({ message: 'Server error while deleting memory.' });
    }
};


module.exports = {
    getMemories,
    addMemory,
    updateMemory,
    deleteMemory,
};