const { query, uuidv4, poolPromise, sql } = require('../config/db');
const path = require('path');
const { generateChatResponse, generateTitle } = require('../services/pythonApiService');

// --- Create a new Chat Session ---
const createChatSession = async (req, res) => {
  const { name } = req.body;
  const { id: userId } = req.user;
  if (!name) return res.status(400).json({ message: 'Session name is required.' });

  try {
    const newSessionId = uuidv4();
    const sql = 'INSERT INTO chat_sessions (id, user_id, name) OUTPUT INSERTED.id, INSERTED.name, INSERTED.created_at VALUES (@id, @user_id, @name)';
    const result = await query(sql, { id: newSessionId, user_id: userId, name });
    const newSession = result.rows[0];
    
    res.status(201).json({
      id: newSession.id,
      title: newSession.name,
      timestamp: newSession.created_at,
      lastMessage: '',
    });
  } catch (error) {
    console.error('Create Chat Session Error:', error);
    res.status(500).json({ message: 'Server error while creating chat session.' });
  }
};

// --- Update a Chat Session (e.g., rename) ---
const updateChatSession = async (req, res) => {
    const { id: sessionId } = req.params;
    const { name } = req.body;
    const { id: userId } = req.user;
    if (!name) return res.status(400).json({ message: 'A new name is required.' });

    try {
        const updateSql = 'UPDATE chat_sessions SET name = @name OUTPUT INSERTED.id, INSERTED.name, INSERTED.created_at WHERE id = @sessionId AND user_id = @userId';
        const result = await query(updateSql, { name, sessionId, userId });

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Chat session not found or access denied.' });
        }
        const updatedSession = result.rows[0];
        
        const lastMessageResult = await query('SELECT TOP 1 message FROM chat_messages WHERE session_id = @sessionId ORDER BY created_at DESC', { sessionId });
        
        res.status(200).json({
            id: updatedSession.id,
            title: updatedSession.name,
            timestamp: updatedSession.created_at,
            lastMessage: lastMessageResult.rows[0]?.message || '',
        });
    } catch (error) {
        console.error('Update Chat Session Error:', error);
        res.status(500).json({ message: 'Server error while updating chat session.' });
    }
};

// --- Get all Chat Sessions for a user ---
const getChatSessions = async (req, res) => {
  const { id: userId } = req.user;
  try {
    const sql = `
        WITH RankedMessages AS (
            SELECT
                cs.id,
                cs.name as title,
                cs.created_at as timestamp,
                COALESCE(cm.message, '') as lastMessage,
                ROW_NUMBER() OVER(PARTITION BY cs.id ORDER BY cm.created_at DESC) as rn
            FROM chat_sessions cs
            LEFT JOIN chat_messages cm ON cs.id = cm.session_id
            WHERE cs.user_id = @userId
        )
        SELECT id, title, timestamp, lastMessage
        FROM RankedMessages
        WHERE rn = 1
        ORDER BY timestamp DESC;
    `;
    
    const result = await query(sql, { userId });
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Get Chat Sessions Error:', error);
    res.status(500).json({ message: 'Server error while fetching chat sessions.' });
  }
};

// --- Get all Messages for a specific Chat Session ---
const getChatMessages = async (req, res) => {
  const { id: sessionId } = req.params;
  const { id: userId } = req.user;
  try {
    const sessionAccess = await query('SELECT id FROM chat_sessions WHERE id = @sessionId AND user_id = @userId', { sessionId, userId });
    if (sessionAccess.rows.length === 0) return res.status(403).json({ message: 'Access denied.' });

    const sql = `
       SELECT id, sender, message AS text, files_used, created_at AS timestamp
       FROM chat_messages WHERE session_id = @sessionId
       ORDER BY created_at ASC`;
    const result = await query(sql, { sessionId });
    
    const messages = result.rows.map(row => ({
        ...row,
        filesUsed: row.files_used ? JSON.parse(row.files_used) : [],
    }));
    res.status(200).json(messages);
  } catch (error) {    
    console.error('Get Chat Messages Error:', error);
    res.status(500).json({ message: 'Server error while fetching messages.' });
  }
};

// --- Get all Files for a specific Chat Session ---
const getChatSessionFiles = async (req, res) => {
    const { id: sessionId } = req.params;
    const { id: userId } = req.user;
    try {
        const sessionAccess = await query('SELECT id FROM chat_sessions WHERE id = @sessionId AND user_id = @userId', { sessionId, userId });
        if (sessionAccess.rows.length === 0) return res.status(403).json({ message: 'Access denied.' });

        const sql = `
            SELECT f.id, f.original_file_name as name, f.file_name, f.created_at as timestamp
            FROM files f 
            JOIN chat_session_files csf ON f.id = csf.file_id 
            WHERE csf.session_id = @sessionId AND f.user_id = @userId`;
        const result = await query(sql, { sessionId, userId });
        
        const files = result.rows.map(row => ({
            id: row.id,
            name: row.name,
            timestamp: row.timestamp,
            type: path.extname(row.name).replace('.', '').toUpperCase() || 'FILE',
            viewUrl: `${req.protocol}://${req.get('host')}/uploads/${userId}/${row.file_name}`
        }));
        res.status(200).json(files);
    } catch (error) {
        console.error('Get Chat Session Files Error:', error);
        res.status(500).json({ message: 'Server error while fetching session files.' });
    }
};

// --- Add Files to a Session ---
const addFilesToSession = async (req, res) => {
    const { id: sessionId } = req.params;
    const { fileIds } = req.body;
    const { id: userId } = req.user;
    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
        return res.status(400).json({ message: 'An array of fileIds is required.' });
    }

    try {
        const sessionAccess = await query('SELECT id FROM chat_sessions WHERE id = @sessionId AND user_id = @userId', { sessionId, userId });
        if (sessionAccess.rows.length === 0) return res.status(403).json({ message: 'Access denied.' });
        
        // Loop to insert if not exists, since MERGE is complex to build dynamically
        for (const fileId of fileIds) {
            const upsertSql = `
                IF NOT EXISTS (SELECT 1 FROM chat_session_files WHERE session_id = @sessionId AND file_id = @fileId)
                BEGIN
                    INSERT INTO chat_session_files (session_id, file_id) VALUES (@sessionId, @fileId)
                END
            `;
            await query(upsertSql, { sessionId, fileId });
        }

        res.status(200).json({ success: true, message: 'Files added to session.' });
    } catch (error) {
        console.error('Add Files to Session Error:', error);
        res.status(500).json({ message: 'Server error while adding files to session.' });
    }
};

// --- Remove a File from a Session ---
const removeFileFromSession = async (req, res) => {
    const { id: sessionId, fileId } = req.params;
    const { id: userId } = req.user;
    try {
        const sessionAccess = await query('SELECT id FROM chat_sessions WHERE id = @sessionId AND user_id = @userId', { sessionId, userId });
        if (sessionAccess.rows.length === 0) return res.status(403).json({ message: 'Access denied.' });

        const sql = 'DELETE FROM chat_session_files WHERE session_id = @sessionId AND file_id = @fileId';
        await query(sql, { sessionId, fileId });
        res.status(200).json({ success: true, message: 'File removed from session.' });
    } catch (error) {
        console.error('Remove File from Session Error:', error);
        res.status(500).json({ message: 'Server error while removing file from session.' });
    }
};

// --- Post a new Message to a Chat Session ---
const postChatMessage = async (req, res) => {
    const { sessionId, prompt, fileIds } = req.body;
    const { id: userId } = req.user;
    if (!sessionId || !prompt) return res.status(400).json({ message: 'sessionId and prompt are required.' });

    const pool = await poolPromise;
    const transaction = pool.transaction();

    try {
        await transaction.begin();
        const request = transaction.request();

        const sessionAccess = await request.input('p_sessionId', sql.NVarChar, sessionId).input('p_userId', sql.NVarChar, userId).query('SELECT id FROM chat_sessions WHERE id = @p_sessionId AND user_id = @p_userId');
        if (sessionAccess.recordset.length === 0) {
            await transaction.rollback();
            return res.status(403).json({ message: 'Access denied.' });
        }

        const userMessageId = uuidv4();
        await request.input('userMessageId', sql.NVarChar, userMessageId).input('prompt', sql.NVarChar, prompt).query("INSERT INTO chat_messages (id, session_id, sender, message) VALUES (@userMessageId, @p_sessionId, 'user', @prompt)");
        
        if (fileIds && fileIds.length > 0) {
             for (const fileId of fileIds) {
                const fileRequest = transaction.request();
                await fileRequest.input('sessionId', sql.NVarChar, sessionId).input('fileId', sql.NVarChar, fileId).query(`
                    IF NOT EXISTS (SELECT 1 FROM chat_session_files WHERE session_id = @sessionId AND file_id = @fileId)
                    BEGIN
                        INSERT INTO chat_session_files (session_id, file_id) VALUES (@sessionId, @fileId)
                    END
                `);
            }
        }

        // Fetch history and memories outside the transaction if they are read-only operations
        const historyResult = await query('SELECT sender, message FROM chat_messages WHERE session_id = @sessionId ORDER BY created_at ASC', { sessionId });
        const memoriesResult = await query('SELECT content FROM user_memories WHERE user_id = @userId ORDER BY created_at ASC', { userId });
        
        const aiResponse = await generateChatResponse(prompt, fileIds, historyResult.rows, userId, memoriesResult.rows.map(r=>r.content));

        const aiMessageId = uuidv4();
        const filesUsedJson = (aiResponse.files_used && aiResponse.files_used.length > 0) ? JSON.stringify(aiResponse.files_used) : null;
        
        const aiMessageRequest = transaction.request();
        const aiResult = await aiMessageRequest
            .input('aiMessageId', sql.NVarChar, aiMessageId)
            .input('ai_sessionId', sql.NVarChar, sessionId)
            .input('ai_message', sql.NVarChar, aiResponse.text)
            .input('filesUsed', filesUsedJson ? sql.NVarChar(sql.MAX) : sql.NVarChar, filesUsedJson)
            .query(`INSERT INTO chat_messages (id, session_id, sender, message, files_used) 
                    OUTPUT INSERTED.id, INSERTED.sender, INSERTED.message as text, INSERTED.files_used, INSERTED.created_at as timestamp
                    VALUES (@aiMessageId, @ai_sessionId, 'ai', @ai_message, @filesUsed)`);
        
        await transaction.commit();
        
        const aiMessage = aiResult.recordset[0];
        res.status(201).json({
            ...aiMessage,
            filesUsed: aiMessage.files_used ? JSON.parse(aiMessage.files_used) : []
        });

    } catch (error) {
        await transaction.rollback();
        console.error('Post Chat Message Error:', error);
        res.status(500).json({ message: 'Server error while posting message.' });
    }
};

// --- Delete a Chat Session ---
const deleteChatSession = async (req, res) => {
  const { id: sessionId } = req.params;
  const { id: userId } = req.user;
  try {
    const deleteSql = 'DELETE FROM chat_sessions WHERE id = @sessionId AND user_id = @userId';
    const result = await query(deleteSql, { sessionId, userId });

    if (result.rowCount === 0) {
        return res.status(404).json({ message: 'Chat session not found or you do not have permission to delete it.' });
    }
    res.status(200).json({ success: true, message: 'Chat session deleted successfully.' });
  } catch (err) {
      console.error('Delete Chat Session Error:', err);
      res.status(500).json({ message: 'Server error while deleting chat session.' });
  }
};

// --- Generate a Title for a Chat ---
const generateTitleForChat = async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ message: 'A prompt is required.' });
    try {
        res.status(200).json(await generateTitle(prompt));
    } catch (error) {
        console.error('Generate Title Error:', error);
        res.status(500).json({ message: 'Server error while generating chat title.' });
    }
};

module.exports = {
  createChatSession,
  getChatSessions,
  getChatMessages,
  getChatSessionFiles,
  addFilesToSession,
  removeFileFromSession,
  postChatMessage,
  deleteChatSession,
  updateChatSession,
  generateTitleForChat,
};