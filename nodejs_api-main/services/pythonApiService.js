const axios = require('axios');

const pythonApi = axios.create({
  baseURL: process.env.PYTHON_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 180000, // 180 second (3 minute) timeout for AI responses and processing
});

/**
 * Calls the Python service to extract text from an uploaded file.
 * This function is now critical and will throw an error on failure.
 * @param {object} extractionData - An object containing all necessary data for extraction.
 * @returns {Promise<object>} A promise that resolves with the Python service's response.
 * @throws {Error} Throws an error if the call to the Python service fails.
 */
const triggerExtraction = async (extractionData) => {
  const { fileId } = extractionData;
  try {
    const payloadSizeInBytes = Buffer.byteLength(JSON.stringify(extractionData), 'utf8');
    const payloadSizeInMB = (payloadSizeInBytes / (1024 * 1024)).toFixed(2);
    
    console.log(`Calling Python service for fileId: ${fileId}. Payload size: ${payloadSizeInMB} MB.`);

    const response = await pythonApi.post('/extract', extractionData);

    console.log(`Python service acknowledged extraction for fileId ${fileId}:`, response.data);
    return response.data;
  } catch (error) {
    console.error(`❌ Error calling Python extraction service for fileId ${fileId}.`);
    let userMessage = 'The document processing service is unavailable or failed.';
    
    if (error.code === 'ECONNREFUSED' || (error.request && !error.response)) {
      console.error('Connection error. Is the Python service running and accessible from the Node server?');
      userMessage = 'Could not connect to the document processing service. Please ensure it is running and accessible.';
    } else if (error.code === 'ECONNABORTED') {
      console.error('Timeout error. The Python service took too long to respond.');
      userMessage = 'The document processing service timed out. The file may be too large or the service is under heavy load.';
    } else if (error.response) {
      console.error('Error Response Status:', error.response.status);
      console.error('Error Response Data:', JSON.stringify(error.response.data, null, 2));
      const pythonError = error.response.data.error || 'Request failed';
      userMessage = `The document processing service returned an error: ${pythonError}`;
    } else {
      console.error('Error Message:', error.message);
    }
    
    // Throw a new error with a user-friendly message for the controller to catch and handle.
    throw new Error(userMessage);
  }
};


/**
 * Calls the Python service to generate a chat response.
 * @param {string} prompt - The user's prompt.
 * @param {string[]} fileIds - An array of file IDs to use as context.
 * @param {object[]} chatHistory - An array of previous messages in the session.
 * @param {number} userId - The ID of the user making the request.
 * @param {string[]} memories - An array of user's persistent memories.
 */
const generateChatResponse = async (prompt, fileIds, chatHistory, userId, memories) => {
    try {
        console.log('Calling Python service to generate chat response...');
        const response = await pythonApi.post('/generate', {
            prompt,
            file_ids: fileIds,
            chat_history: chatHistory,
            user_id: userId,
            memories: memories,
        });
        console.log('Python service responded with a chat message.');
        // Expecting python to return { text: '...', files_used: [...] }
        return response.data;
    } catch (error) {
        console.error('Error calling Python generation service:', error.response ? error.response.data : error.message);
        throw new Error('Failed to get a response from the AI service.');
    }
};

/**
 * Calls the Python service to generate a title for a chat.
 * @param {string} prompt - The initial prompt of the chat session.
 * @returns {Promise<{title: string}>} A promise that resolves with the generated title.
 */
const generateTitle = async (prompt) => {
    try {
        console.log('Calling Python service to generate a chat title...');
        const response = await pythonApi.post('/generate_title', { prompt });
        return response.data; // Expecting { title: "Generated Title" }
    } catch (error) {
        console.error('Error calling Python title generation service:', error.response ? error.response.data : error.message);
        throw new Error('Failed to generate a title from the AI service.');
    }
};

/**
 * Calls the Python service to delete vector chunks associated with file IDs.
 * @param {number[]} fileIds - An array of file IDs to delete from the vector DB.
 */
const triggerChunkDeletion = async (fileIds) => {
  if (!fileIds || fileIds.length === 0) {
    return;
  }
  try {
    console.log(`Calling Python service to delete chunks for file IDs: [${fileIds.join(', ')}]`);
    
    // Fire-and-forget, but log the outcome.
    const response = await pythonApi.post('/delete_chunks', {
      file_ids: fileIds,
    });
    
    console.log('Python service acknowledged chunk deletion:', response.data);
  } catch (error) {
     console.error(`Error calling Python chunk deletion service for file IDs [${fileIds.join(', ')}]:`, error.response ? error.response.data : error.message);
     // In a production app, you might add this to a retry queue.
  }
};

module.exports = {
  triggerExtraction,
  generateChatResponse,
  triggerChunkDeletion,
  generateTitle,
};