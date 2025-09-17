require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { URL } = require('url');
const { initializeDatabase } = require('./config/db');
require('./config/firebase'); // Initialize Firebase Admin SDK

// --- Environment Variable Validation ---
const pythonApiUrl = process.env.PYTHON_API_URL;
if (!pythonApiUrl) {
  console.error('FATAL ERROR: PYTHON_API_URL is not defined in the environment.');
  process.exit(1);
}
try {
  new URL(pythonApiUrl);
} catch (error) {
  console.error(`FATAL ERROR: Invalid PYTHON_API_URL: "${pythonApiUrl}"`);
  process.exit(1);
}

// Check for O365 email configuration if real emails are intended
const requiredO365Env = ['O365_TENANT_ID', 'O365_CLIENT_ID', 'O365_CLIENT_SECRET', 'O365_USER_EMAIL'];
for (const envVar of requiredO365Env) {
    if (!process.env[envVar]) {
        console.error(`FATAL ERROR: O365 environment variable ${envVar} is not set. Real email functionality will fail.`);
        process.exit(1);
    }
}


console.log(`Python service URL configured to: ${pythonApiUrl}`);
// --- End Validation ---

// Import routes
const authRoutes = require('./routes/authRoutes');
const fileRoutes = require('./routes/fileRoutes');
const chatRoutes = require('./routes/chatRoutes');
const memoryRoutes = require('./routes/memoryRoutes');

const app = express();
const port = process.env.PORT || 3001;

// --- MIDDLEWARE ---
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- API ROUTES ---
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/memories', memoryRoutes);

// --- GLOBAL ERROR HANDLER (optional but good practice) ---
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send({ message: 'Something went wrong!', error: err.message });
});

// --- Asynchronous Server Startup ---
const startServer = async () => {
  try {
    // Wait for the database schema to be initialized before starting the server
    await initializeDatabase();
    
    app.listen(port, () => {
      console.log(`Node.js backend server listening at http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Failed to start server due to database initialization error:', error);
    process.exit(1);
  }
};

startServer();