

const express = require('express');
const router = express.Router();
const { uploadFile, listFiles, deleteFile, deleteCollection, getFileUsage, getCollectionUsage } = require('../controllers/fileController');
const { protect } = require('../middleware/authMiddleware');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

// Ensure base uploads directory exists
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer configuration for file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // The `protect` middleware should have already run and attached `req.user`.
    if (!req.user || !req.user.id) {
      console.error('[Multer Storage] Auth check failed. req.user is not available.');
      return cb(new Error('User authentication failed, cannot determine upload directory.'));
    }

    const userId = req.user.id;
    const userUploadDir = path.join(uploadDir, String(userId));
    
    console.log(`[Multer Storage] Preparing to store file for userId: ${userId}`);
    
    try {
      if (!fs.existsSync(userUploadDir)){
          fs.mkdirSync(userUploadDir, { recursive: true });
          console.log(`[Multer Storage] Created directory: ${userUploadDir}`);
      }
      cb(null, userUploadDir);
    } catch (error) {
       console.error(`[Multer Storage] Failed to create directory for user ${userId}:`, error);
       cb(error);
    }
  },
  filename: (req, file, cb) => {
    // Create a unique filename to prevent overwrites
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
    // A more robust check for allowed file types
    const allowedMimeTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    const allowedExtensions = ['.pdf', '.docx'];

    const fileExtension = path.extname(file.originalname).toLowerCase();
    
    // Check both the reported mimetype and the file extension for safety
    if (allowedMimeTypes.includes(file.mimetype) && allowedExtensions.includes(fileExtension)) {
        return cb(null, true); // Accept the file
    }
    
    // Reject the file
    cb(new Error('File type not supported. Only PDF and DOCX are allowed.'));
};


const upload = multer({ storage, fileFilter });

// --- Custom Middleware to handle Multer errors gracefully ---
const handleUploadMiddleware = (req, res, next) => {
  const uploadHandler = upload.single('file');
  
  console.log('[Upload Middleware] Running multer upload handler...');
  uploadHandler(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      // A Multer-specific error occurred (e.g., file too large).
      console.error('[Multer Error]', err);
      return res.status(400).json({ message: `File upload error: ${err.message}` });
    } else if (err) {
      // A custom error occurred (e.g., from our fileFilter or storage engine).
      console.error('[Upload Middleware Error]', err.message);
      return res.status(400).json({ message: err.message });
    }
    
    console.log('[Upload Middleware] Multer processed the file successfully.');
    // Everything went fine, proceed to the controller.
    next();
  });
};

// @route   POST /api/files/upload
// @desc    Upload a file
// @access  Private
router.post('/upload', protect, handleUploadMiddleware, uploadFile);

// @route   GET /api/files/list
// @desc    List user's files
// @access  Private
router.get('/list', protect, listFiles);

// @route   GET /api/files/:id/sessions
// @desc    Get chat sessions where a file is used
// @access  Private
router.get('/:id/sessions', protect, getFileUsage);

// @route   DELETE /api/files/:id
// @desc    Delete a file
// @access  Private
router.delete('/:id', protect, deleteFile);

// @route   GET /api/files/collections/:name/usage
// @desc    Get chat sessions where files from a collection are used
// @access  Private
router.get('/collections/:name/usage', protect, getCollectionUsage);

// @route   DELETE /api/files/collections/:name
// @desc    Delete an entire collection
// @access  Private
router.delete('/collections/:name', protect, deleteCollection);

module.exports = router;
