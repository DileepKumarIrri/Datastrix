from flask import Flask, request, jsonify
from flask_cors import CORS
import logging
import os
import base64
from dotenv import load_dotenv
from qdrant_client import QdrantClient
from langchain_openai import ChatOpenAI

from vector_generator import VectorGenerator
from delete_chunks import ChunkDeleter
from search_context import ContextRetriever

# Load environment variables from a .env file if it exists
load_dotenv()

# Configure basic logging to print to console
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

app = Flask(__name__)
# Set a large-enough value for max content length to allow for base64-encoded files. e.g., 50MB
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024
CORS(app)

# --- Initialize Services ---
vector_generator = None
chunk_deleter = None
context_retriever = None
db_client = None # Databricks LLM client
qdrant_client = None # Qdrant vector DB client


try:
    # Initialize Databricks client for LLM calls using the OpenAI client
    DATABRICKS_BASE_URL = os.getenv("DATABRICKS_BASE_URL")
    DATABRICKS_TOKEN = os.getenv("DATABRICKS_TOKEN")
    DATABRICKS_CHAT_MODEL = os.getenv("DATABRICKS_CHAT_MODEL")
    
    if DATABRICKS_BASE_URL and DATABRICKS_TOKEN and DATABRICKS_CHAT_MODEL:
        db_client = ChatOpenAI(
            model=DATABRICKS_CHAT_MODEL,
            openai_api_key=DATABRICKS_TOKEN,
            openai_api_base=DATABRICKS_BASE_URL,
        )
        logging.info("✅ Databricks chat client initialized successfully via OpenAI client.")
    else:
        logging.warning("⚠️ Databricks credentials not found. AI generation will not work.")

    # Initialize Qdrant client for vector DB operations
    QDRANT_URL = os.getenv("QDRANT_URL")
    QDRANT_API_KEY = os.getenv("QDRANT_API_KEY")
    if QDRANT_URL:
        # Use a timeout for cloud connections
        qdrant_client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY, timeout=60)
        logging.info("✅ Qdrant client initialized successfully.")
    else:
        logging.warning("⚠️ Qdrant URL not found. Vector database operations will not work.")

    # Instantiate services, passing the shared client instances
    if qdrant_client:
        vector_generator = VectorGenerator(qdrant_client)
        chunk_deleter = ChunkDeleter(qdrant_client)
        context_retriever = ContextRetriever(db_client=db_client, qdrant_client=qdrant_client)

except Exception as e:
    logging.critical(f"Could not initialize a required service. The application may not function correctly. Error: {e}", exc_info=True)


@app.route('/extract', methods=['POST'])
def extract_text_from_file():
    """
    Receives file content and user metadata from the Node.js backend, and passes it
    to the VectorGenerator service for processing and storage in Qdrant.
    """
    logging.info("--- /extract endpoint hit ---")

    if not vector_generator:
         logging.error("Vector processing service is not available.")
         return jsonify({"error": "Vector processing service is not available."}), 503

    if not request.data:
        logging.error("Request body is empty.")
        return jsonify({"error": "Request body is empty"}), 400

    try:
        data = request.get_json()
        if data is None:
            logging.error("request.get_json() returned None. The payload might be empty or not valid JSON.")
            return jsonify({"error": "Received non-JSON or empty payload."}), 400
    except Exception as e:
        logging.error(f"Failed to parse JSON body: {e}", exc_info=True)
        return jsonify({"error": f"Failed to parse JSON body: {e}"}), 400

    logging.info(f"Successfully parsed JSON. Received keys: {list(data.keys())}")
    
    file_id = data.get('fileId')
    user_id = data.get('userId')
    user_name = data.get('userName')
    collection = data.get('collection')
    file_content_b64 = data.get('fileContent')
    original_file_name = data.get('originalFileName')
    timestamp = data.get('timestamp')

    if not all([file_id, user_id, file_content_b64, collection, user_name, original_file_name]):
        logging.error(f"Missing required data in request body for fileId: {file_id}")
        return jsonify({"error": "Missing required data: fileId, userId, userName, fileContent, originalFileName, and collection are required."}), 400

    try:
        file_content_bytes = base64.b64decode(file_content_b64)
    except Exception as e:
        logging.error(f"Failed to decode base64 file content for fileId {file_id}: {e}")
        return jsonify({"error": "Invalid base64 encoding for fileContent."}), 400

    try:
        vector_generator.process_document(
            user_id=user_id,
            user_name=user_name,
            collection_name=collection,
            original_filename=original_file_name,
            timestamp=timestamp,
            file_content_bytes=file_content_bytes,
            file_id=file_id
        )
    except Exception as e:
        logging.error(f"VectorGenerator failed for fileId {file_id}: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500

    return jsonify({
        "status": "success",
        "message": f"Extraction process initiated for fileId {file_id}.",
        "fileId": file_id
    }), 202

@app.route('/delete_chunks', methods=['POST'])
def delete_vector_chunks():
    """
    Receives a list of file_ids from the Node.js backend and triggers
    their deletion from the Qdrant vector database.
    """
    if not chunk_deleter:
         return jsonify({"error": "Chunk deletion service is not available."}), 503

    if not request.is_json:
        return jsonify({"error": "Request must be JSON"}), 400

    data = request.get_json()
    file_ids = data.get('file_ids')

    if not file_ids or not isinstance(file_ids, list):
        return jsonify({"error": "A list of 'file_ids' is required."}), 400
    
    logging.info(f"Received request to delete chunks for file_ids: {file_ids}")

    try:
        chunk_deleter.delete_by_file_ids(file_ids)
        return jsonify({
            "status": "success",
            "message": "Chunk deletion process initiated.",
            "file_ids": file_ids
        }), 202
    except Exception as e:
        logging.error(f"Chunk deletion failed for file_ids {file_ids}: {e}", exc_info=True)
        return jsonify({"error": "An internal error occurred during chunk deletion."}), 500


@app.route('/generate', methods=['POST'])
def generate_response():
    """
    Generates an AI response using RAG. It retrieves context from documents,
    considers chat history, and then calls a Databricks model.
    """
    if not request.is_json:
        return jsonify({"error": "Request must be JSON"}), 400
    
    if not context_retriever or not db_client:
        return jsonify({"error": "AI generation service is not fully available. Check server logs."}), 503
        
    data = request.get_json()
    logging.info(f"Received generation request: {data}")

    prompt = data.get('prompt')
    file_ids = data.get('file_ids', [])
    chat_history = data.get('chat_history', [])
    user_id = data.get('user_id')
    memories = data.get('memories', [])

    if not all([prompt, user_id]):
        return jsonify({"error": "prompt and user_id are required."}), 400
        
    context = ""
    files_used = []
    if file_ids:
        try:
            retrieved_chunks = context_retriever.search(prompt, user_id, file_ids)
            if retrieved_chunks:
                context_texts = [chunk['text'] for chunk in retrieved_chunks]
                context = "\n---\n".join(context_texts)
                
                # Robustly create a unique, sorted list of filenames.
                # This ensures the data type is always a list, preventing JSON serialization errors.
                unique_filenames = {
                    chunk['original_filename'] 
                    for chunk in retrieved_chunks 
                    if isinstance(chunk, dict) and chunk.get('original_filename')
                }
                files_used = sorted(list(unique_filenames))

        except Exception as e:
            logging.error(f"Context retrieval failed for user {user_id}: {e}", exc_info=True)
            context = "Failed to retrieve context from documents."

    memory_section = ""
    if memories:
        formatted_memories = "\n".join([f"- {m}" for m in memories])
        memory_section = f"""
**PERSISTENT USER MEMORIES (Always consider these for context and personalization):**
{formatted_memories}
"""

    system_prompt = f"""You are an expert AI assistant. Your primary function is to answer user questions based on the provided document context and chat history.
{memory_section}
**CRITICAL INSTRUCTIONS:**
1.  **You MUST use ONLY GitHub-Flavored Markdown for all formatting.** This includes lists, bold/italic text, and tables.
2.  **You are STRICTLY FORBIDDEN from using any HTML tags.** Do not generate `<table>`, `<tr>`, `<td>`, or any other HTML element.
3.  **For tables, you MUST use the following Markdown format:**
    ```
    | Header 1 | Header 2 |
    |----------|----------|
    | Cell 1   | Cell 2   |
    | Cell 3   | Cell 4   |
    ```
4.  Base your answers ONLY on the information given in the "CONTEXT FROM DOCUMENTS" section.
5.  If the context does not contain the answer, you MUST state that the information was not found in the provided documents. Do not invent information.
6.  Keep your responses concise and directly related to the user's question and if you dont find the context, just give a generic answer saying "I'm sorry, I can't assist with that because no relevant information was found in the document."

CONTEXT FROM DOCUMENTS:
{context if context else "No context provided."}
"""
    messages = [{"role": "system", "content": system_prompt}]

    for msg in chat_history:
        # The Databricks API expects the role 'assistant' for AI responses.
        role = "assistant" if msg['sender'] == 'ai' else 'user'
        messages.append({"role": role, "content": msg['message']})

    messages.append({"role": "user", "content": prompt})
    
    try:
        logging.info(f"Sending request to Databricks chat model: {db_client.model_name}")
        response = db_client.invoke(messages)
        response_text = response.content.strip()

        logging.info(f"Generated Databricks response for user {user_id}")

        return jsonify({
            "text": response_text,
            "files_used": files_used
        })
    except Exception as e:
        logging.error(f"Error invoking Databricks model for user {user_id}: {e}", exc_info=True)
        return jsonify({"error": "Failed to generate AI response due to an internal error with the model service."}), 500

@app.route('/generate_title', methods=['POST'])
def generate_title():
    """Generates a short, concise title for a chat session based on the initial prompt."""
    if not db_client:
        return jsonify({"error": "AI title generation service is not available."}), 503
        
    data = request.get_json()
    prompt = data.get('prompt')
    if not prompt:
        return jsonify({"error": "A 'prompt' is required."}), 400
        
    try:
        system_prompt = "You are a title generator. Based on the user's first message, create a short, concise title for the chat session. The title should be no more than 5-7 words. Do not use quotation marks in the title."
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ]
        
        response = db_client.invoke(messages)
        # Clean up potential quotation marks from the title
        title = response.content.strip().replace('"', '').replace("'", "")
        
        return jsonify({"title": title})

    except Exception as e:
        logging.error(f"Error invoking Databricks for title generation: {e}", exc_info=True)
        return jsonify({"error": "Failed to generate title."}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)