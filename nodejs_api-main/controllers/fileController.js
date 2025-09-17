const { query, uuidv4 } = require('../config/db');
const { triggerExtraction, triggerChunkDeletion } = require('../services/pythonApiService');
const { convertDocxToPdf } = require('../services/fileConverter');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

// --- Upload a File ---
const uploadFile = async (req, res) => {
  console.log('[Upload Controller] Initiating file upload process...');
  
  if (!req.file) {
    console.error('[Upload Controller] Error: req.file is missing.');
    return res.status(400).json({ message: 'File is missing or has an unsupported format.' });
  }

  const originalUploadedPath = req.file.path;
  let finalFilePath = originalUploadedPath;
  const newFileId = uuidv4();

  try {
    if (!req.user) throw new Error('User authentication context is missing.');
    
    const { collection } = req.body;
    if (!collection || collection.trim() === '') throw new Error('Collection name is required.');
    
    const { id: userId, name: userName } = req.user;
    const { originalname } = req.file;
    let finalFileName = req.file.filename;

    if (path.extname(originalname).toLowerCase() === '.docx') {
      finalFilePath = await convertDocxToPdf(originalUploadedPath);
      finalFileName = path.basename(finalFilePath);
    }
    
    const sql = `
      INSERT INTO files (id, user_id, file_name, original_file_name, collection, path) 
      OUTPUT INSERTED.*
      VALUES (@id, @user_id, @file_name, @original_file_name, @collection, @path)
    `;
    const params = {
        id: newFileId,
        user_id: userId,
        file_name: finalFileName,
        original_file_name: originalname,
        collection: collection.trim(),
        path: finalFilePath
    };
    const newFileRecord = await query(sql, params);
    
    const fileBuffer = await fsPromises.readFile(finalFilePath);
    const fileBase64 = fileBuffer.toString('base64');

    await triggerExtraction({
        fileContent: fileBase64,
        fileId: newFileId,
        userId,
        userName,
        collection: newFileRecord.rows[0].collection,
        originalFileName: newFileRecord.rows[0].original_file_name,
        timestamp: newFileRecord.rows[0].created_at,
    });

    console.log('[Upload Controller] File upload process fully completed.');
    const createdFile = newFileRecord.rows[0];
    res.status(201).json({
      message: 'File uploaded and processed successfully.',
      file: {
        id: createdFile.id,
        file_name: createdFile.file_name,
        original_file_name: createdFile.original_file_name,
        collection: createdFile.collection,
        created_at: createdFile.created_at
      },
    });

  } catch (error) {
    console.error('[Upload Controller] An error occurred. Starting rollback process.', error.stack);
    
    // Attempt to delete from DB if it was inserted
    await query('DELETE FROM files WHERE id = @id', { id: newFileId });
    console.log(`[Upload Controller] Rolled back database record for file ID: ${newFileId}`);
    
    try {
      if (fs.existsSync(originalUploadedPath)) await fsPromises.unlink(originalUploadedPath);
      if (finalFilePath !== originalUploadedPath && fs.existsSync(finalFilePath)) await fsPromises.unlink(finalFilePath);
    } catch (fileError) {
      console.error('[Upload Controller] Error during file cleanup:', fileError);
    }
    
    const status = error.message.includes('connect') ? 502 : 500;
    res.status(status).json({ message: error.message || 'Server error during file upload.' });
  }
};

// --- List Files ---
const listFiles = async (req, res) => {
  const { id: userId } = req.user;
  try {
    const sql = 'SELECT id, file_name, original_file_name as name, collection, created_at as timestamp FROM files WHERE user_id = @userId ORDER BY created_at DESC';
    const result = await query(sql, { userId });
    
    const collections = result.rows.reduce((acc, file) => {
        const { collection, ...fileData } = file;
        let existingCollection = acc.find(c => c.name === collection);
        if (!existingCollection) {
            existingCollection = { id: `col-${collection.replace(/\s+/g, '-')}`, name: collection, files: [] };
            acc.push(existingCollection);
        }
        const viewUrl = `${req.protocol}://${req.get('host')}/uploads/${userId}/${file.file_name}`;
        existingCollection.files.push({ ...fileData, type: path.extname(fileData.name).replace('.', '').toUpperCase() || 'FILE', viewUrl });
        return acc;
    }, []);

    res.status(200).json(collections);
  } catch (error) {
    console.error('List Files Error:', error);
    res.status(500).json({ message: 'Server error while fetching files.' });
  }
};

// --- Delete File ---
const deleteFile = async (req, res) => {
  const { id: fileId } = req.params;
  const { id: userId } = req.user;

  try {
    const fileResult = await query('SELECT path FROM files WHERE id = @fileId AND user_id = @userId', { fileId, userId });
    if (fileResult.rows.length === 0) {
      return res.status(404).json({ message: 'File not found or access denied.'});
    }
    const filePath = fileResult.rows[0].path;

    await query('DELETE FROM files WHERE id = @fileId AND user_id = @userId', { fileId, userId });
    
    console.log(`Successfully deleted file record ${fileId} from DB.`);
    
    // Asynchronously delete chunks and physical file
    triggerChunkDeletion([fileId]);
    fs.unlink(filePath, (err) => {
        if (err) console.error(`Failed to delete physical file ${filePath}:`, err);
        else console.log(`Successfully deleted physical file ${filePath}.`);
    });

    res.status(200).json({ success: true, message: 'File deleted successfully.' });
  } catch (err) {
      console.error('Delete File Error:', err);
      res.status(500).json({ message: 'Server error during file deletion.' });
  }
};

// --- Get File Usage ---
const getFileUsage = async (req, res) => {
  const { id: fileId } = req.params;
  const { id: userId } = req.user;
  try {
    const sql = `
       SELECT DISTINCT cs.name
       FROM chat_sessions cs
       JOIN chat_session_files csf ON cs.id = csf.session_id
       WHERE csf.file_id = @fileId AND cs.user_id = @userId`;
    const result = await query(sql, { fileId, userId });
    res.status(200).json(result.rows.map(row => row.name));
  } catch (error) {
    console.error('Get File Usage Error:', error);
    res.status(500).json({ message: 'Server error while checking file usage.' });
  }
};

// --- Get Collection Usage ---
const getCollectionUsage = async (req, res) => {
  const { name: collectionName } = req.params;
  const { id: userId } = req.user;
  try {
    const sql = `
       SELECT f.original_file_name, cs.name as session_name
       FROM files f
       JOIN chat_session_files csf ON f.id = csf.file_id
       JOIN chat_sessions cs ON csf.session_id = cs.id
       WHERE f.collection = @collectionName AND f.user_id = @userId
       ORDER BY f.original_file_name, cs.name`;
    const result = await query(sql, { collectionName, userId });

    const usageData = result.rows.reduce((acc, row) => {
        if (!acc[row.original_file_name]) acc[row.original_file_name] = [];
        if (!acc[row.original_file_name].includes(row.session_name)) acc[row.original_file_name].push(row.session_name);
        return acc;
    }, {});
    const responseArray = Object.entries(usageData).map(([fileName, sessions]) => ({ fileName, sessions }));
    res.status(200).json(responseArray);
  } catch (error) {
    console.error('Get Collection Usage Error:', error);
    res.status(500).json({ message: 'Server error while checking collection usage.' });
  }
};

// --- Delete Collection ---
const deleteCollection = async (req, res) => {
  const { name: collectionName } = req.params;
  const { id: userId } = req.user;

  try {
    const filesResult = await query('SELECT id, path FROM files WHERE user_id = @userId AND collection = @collectionName', { userId, collectionName });
    if (filesResult.rows.length === 0) {
      return res.status(404).json({ message: 'Collection not found or already empty.' });
    }
    const fileIds = filesResult.rows.map(file => file.id);
    const filePaths = filesResult.rows.map(file => file.path);

    await query('DELETE FROM files WHERE user_id = @userId AND collection = @collectionName', { userId, collectionName });
    
    console.log(`Successfully deleted ${fileIds.length} file records from collection "${collectionName}".`);
    
    // Asynchronously delete chunks and physical files
    triggerChunkDeletion(fileIds);
    filePaths.forEach(filePath => {
        fs.unlink(filePath, (err) => {
            if (err) console.error(`Failed to delete physical file ${filePath}:`, err);
            else console.log(`Successfully deleted physical file ${filePath}.`);
        });
    });
      
    res.status(200).json({ success: true, message: `Collection "${collectionName}" deleted successfully.` });
  } catch (err) {
      console.error(`Error deleting collection "${collectionName}":`, err);
      res.status(500).json({ message: 'Server error during collection deletion.' });
  }
};

module.exports = {
  uploadFile,
  listFiles,
  deleteFile,
  deleteCollection,
  getFileUsage,
  getCollectionUsage,
};