const sql = require('mssql');
const { v4: uuidv4 } = require('uuid');

// Check for environment variables
const requiredEnv = ['MSSQL_SERVER', 'MSSQL_DATABASE', 'MSSQL_USER', 'MSSQL_PASSWORD'];
for (const envVar of requiredEnv) {
    if (!process.env[envVar]) {
        console.error(`FATAL ERROR: Environment variable ${envVar} is not set.`);
        process.exit(1);
    }
}

const config = {
    server: process.env.MSSQL_SERVER,
    database: process.env.MSSQL_DATABASE,
    user: process.env.MSSQL_USER,   
    password: process.env.MSSQL_PASSWORD,
    port: parseInt(process.env.MSSQL_PORT || '1433', 10),
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    },
    options: {
        encrypt: true,
        trustServerCertificate: false,
        // Increase the connection timeout from the default 15 seconds to 30 seconds.
        // This provides more time for the connection to establish, especially during
        // application startup or on networks with higher latency.
        connectTimeout: 30000
    }
};

const poolPromise = new sql.ConnectionPool(config)
  .connect()
  .then(pool => {
    console.log('✅ Connected to Azure SQL');
    return pool;
  })
  .catch(err => {
      console.error('❌ Database Connection Failed! Check your .env file.', err);
      process.exit(1);
  });


const tableCreationQueries = [
  `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='users' and xtype='U')
    CREATE TABLE users (
        id NVARCHAR(255) PRIMARY KEY,
        firebase_uid NVARCHAR(255) UNIQUE NOT NULL,
        email NVARCHAR(255) UNIQUE NOT NULL,
        name NVARCHAR(255),
        organization_name NVARCHAR(255),
        designation NVARCHAR(255),
        role NVARCHAR(50) DEFAULT 'user',
        created_at DATETIME2 DEFAULT GETUTCDATE()
    )`,
  `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='files' and xtype='U')
    CREATE TABLE files (
        id NVARCHAR(255) PRIMARY KEY,
        user_id NVARCHAR(255) FOREIGN KEY REFERENCES users(id) ON DELETE CASCADE,
        file_name NVARCHAR(255) NOT NULL,
        original_file_name NVARCHAR(255) NOT NULL,
        collection NVARCHAR(255) NOT NULL,
        path NVARCHAR(1024) NOT NULL,
        created_at DATETIME2 DEFAULT GETUTCDATE()
    )`,
  `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='chat_sessions' and xtype='U')
    CREATE TABLE chat_sessions (
        id NVARCHAR(255) PRIMARY KEY,
        user_id NVARCHAR(255) FOREIGN KEY REFERENCES users(id) ON DELETE CASCADE,
        name NVARCHAR(255) NOT NULL,
        created_at DATETIME2 DEFAULT GETUTCDATE()
    )`,
  `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='chat_messages' and xtype='U')
    CREATE TABLE chat_messages (
        id NVARCHAR(255) PRIMARY KEY,
        session_id NVARCHAR(255) FOREIGN KEY REFERENCES chat_sessions(id) ON DELETE CASCADE,
        sender NVARCHAR(50) NOT NULL,
        message NVARCHAR(MAX) NOT NULL,
        files_used NVARCHAR(MAX) NULL,
        created_at DATETIME2 DEFAULT GETUTCDATE()
    )`,
    // Removed CHECK (ISJSON(files_used) > 0) to support NULL values, which is required
  `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='chat_session_files' and xtype='U')
    CREATE TABLE chat_session_files (
        session_id NVARCHAR(255) FOREIGN KEY REFERENCES chat_sessions(id) ON DELETE CASCADE,
        file_id NVARCHAR(255) FOREIGN KEY REFERENCES files(id),
        PRIMARY KEY (session_id, file_id)
    )`,
  `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='user_memories' and xtype='U')
    CREATE TABLE user_memories (
        id NVARCHAR(255) PRIMARY KEY,
        user_id NVARCHAR(255) FOREIGN KEY REFERENCES users(id) ON DELETE CASCADE,
        content NVARCHAR(MAX) NOT NULL,
        created_at DATETIME2 DEFAULT GETUTCDATE()
    )`
];

const initializeDatabase = async () => {
  const pool = await poolPromise;
  try {
    console.log('Checking and initializing Azure SQL database schema...');
    for (const queryText of tableCreationQueries) {
        await pool.request().query(queryText);
    }
    console.log('Database schema is ready.');
  } catch (err) {
    console.error('Error during Azure SQL database initialization:', err);
    throw err;
  }
};

const getRequest = async () => {
    const pool = await poolPromise;
    return pool.request();
}

/**
 * Executes a SQL query.
 * @param {string} queryString The SQL query string with named parameters (e.g., SELECT * FROM users WHERE id = @id)
 * @param {object} params An object mapping parameter names to their values (e.g., { id: '123' })
 * @returns {Promise<{rows: Array<object>, rowCount: number}>} A promise that resolves with the query results.
 */
const query = async (queryString, params) => {
    try {
        const request = await getRequest();
        if (params) {
            for (const key in params) {
                // mssql library will infer the type, which is usually fine.
                request.input(key, params[key]);
            }
        }
        const result = await request.query(queryString);
        // Normalize the response to be similar to node-postgres
        return { 
            rows: result.recordset, 
            rowCount: result.rowsAffected.reduce((a, b) => a + b, 0) || result.recordset.length 
        };
    } catch (err) {
        console.error("MSSQL Error:", err.message);
        console.error("Query:", queryString);
        console.error("Params:", params);
        throw err;
    }
};


module.exports = {
  sql,
  query,
  initializeDatabase,
  uuidv4,
  poolPromise
};