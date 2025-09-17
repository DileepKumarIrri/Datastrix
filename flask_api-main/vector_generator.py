import os
import logging
import uuid
import io
import tiktoken
import pdfplumber
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings
from qdrant_client import QdrantClient, models

# --- Constants & Initializations ---
COLLECTION_NAME = "doc_assist_collection"
EMBEDDING_DIM = 1024  # Dimension for databricks-bge-large-en
TEXT_CHUNK_SIZE = 512
TEXT_CHUNK_OVERLAP = 50

# --- Tokenizer for chunking ---
try:
    tokenizer = tiktoken.get_encoding("cl100k_base")
except Exception:
    tokenizer = tiktoken.get_encoding("gpt2")  # Fallback

def count_tokens(text: str) -> int:
    """Counts the number of tokens in a string."""
    return len(tokenizer.encode(text))

class VectorGenerator:
    """
    Handles the entire pipeline of processing a document:
    - Extracts text from PDF files.
    - Splits text into manageable chunks.
    - Generates embeddings for each chunk.
    - Stores the data in a Qdrant vector database.
    """
    def __init__(self, qdrant_client: QdrantClient):
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=TEXT_CHUNK_SIZE,
            chunk_overlap=TEXT_CHUNK_OVERLAP,
            length_function=count_tokens
        )
        
        self.embedder = OpenAIEmbeddings(
            model=os.getenv("DATABRICKS_EMBEDDING_MODEL"),
            openai_api_base=os.getenv("DATABRICKS_BASE_URL"),
            openai_api_key=os.getenv("DATABRICKS_TOKEN"),
            check_embedding_ctx_length=False
        )
        self.qdrant = qdrant_client
        self._get_or_create_collection()

    def _get_or_create_collection(self):
        """
        Ensures the Qdrant collection exists and has the correct vector and payload index configuration.
        This method is designed to be idempotent.
        """
        try:
            collection_exists = False
            try:
                self.qdrant.get_collection(collection_name=COLLECTION_NAME)
                collection_exists = True
            except Exception as e:
                if "404" in str(e) or "not found" in str(e).lower() or (hasattr(e, 'status_code') and e.status_code == 404):
                    logging.info(f"Qdrant collection '{COLLECTION_NAME}' not found. It will be created.")
                else:
                    raise

            if not collection_exists:
                logging.info(f"Creating collection '{COLLECTION_NAME}' with vector size {EMBEDDING_DIM}...")
                self.qdrant.recreate_collection(
                    collection_name=COLLECTION_NAME,
                    vectors_config=models.VectorParams(size=EMBEDDING_DIM, distance=models.Distance.COSINE),
                    timeout=120
                )
                logging.info(f"Creating payload indexes on 'user_id' and 'file_id'...")
                self.qdrant.create_payload_index(collection_name=COLLECTION_NAME, field_name="user_id", field_schema=models.PayloadSchemaType.KEYWORD, wait=True)
                self.qdrant.create_payload_index(collection_name=COLLECTION_NAME, field_name="file_id", field_schema=models.PayloadSchemaType.KEYWORD, wait=True)
                logging.info("✅ Qdrant collection and payload indexes created successfully.")
            else:
                # --- Verify existing collection and idempotently create indexes ---
                logging.info(f"Verifying existing Qdrant collection '{COLLECTION_NAME}'...")
                collection_info = self.qdrant.get_collection(collection_name=COLLECTION_NAME)

                # 1. Verify vector dimensions
                current_dim = collection_info.config.params.vectors.size
                if current_dim != EMBEDDING_DIM:
                    logging.warning(f"CRITICAL: Vector dimension mismatch! Expected {EMBEDDING_DIM} but found {current_dim}. Deleting and recreating collection.")
                    self.qdrant.delete_collection(collection_name=COLLECTION_NAME, timeout=60)
                    self._get_or_create_collection() # Recurse to recreate
                    return

                # 2. Idempotently create payload indexes
                logging.info("Ensuring required payload indexes exist...")
                try:
                    # This call is idempotent. It will do nothing if the index already exists with the same parameters.
                    self.qdrant.create_payload_index(
                        collection_name=COLLECTION_NAME,
                        field_name="user_id",
                        field_schema=models.PayloadSchemaType.KEYWORD,
                        wait=True
                    )
                    self.qdrant.create_payload_index(
                        collection_name=COLLECTION_NAME,
                        field_name="file_id",
                        field_schema=models.PayloadSchemaType.KEYWORD,
                        wait=True
                    )
                    logging.info(f"✅ Payload indexes for 'user_id' and 'file_id' are confirmed.")
                except Exception as index_error:
                    logging.error(f"❌ Failed to create required payload index. This could be due to a conflicting index configuration. Error: {index_error}", exc_info=True)
                    raise

        except Exception as e:
            logging.error(f"❌ Failed to initialize Qdrant collection: {e}", exc_info=True)
            raise

    def _extract_text_from_file(self, file_content_bytes: bytes, original_filename: str) -> str:
        """Extracts text from PDF file bytes using pdfplumber."""
        full_text = []
        try:
            with pdfplumber.open(io.BytesIO(file_content_bytes)) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        full_text.append(page_text)
            return "\n\n".join(full_text)
        except Exception as e:
            logging.error(f"Failed to extract text from {original_filename}: {e}", exc_info=True)
            raise ValueError(f"Could not process PDF content for {original_filename}.")

    def process_document(self, user_id: str, user_name: str, collection_name: str, original_filename: str, timestamp: str, file_content_bytes: bytes, file_id: str):
        """Main method to process a single document from its byte content."""
        logging.info(f"--- Document Ingestion Start for file_id: {file_id} ---")
        
        try:
            scroll_response, _ = self.qdrant.scroll(
                collection_name=COLLECTION_NAME,
                scroll_filter=models.Filter(
                    must=[
                        models.FieldCondition(key="file_id", match=models.MatchValue(value=file_id)),
                        models.FieldCondition(key="user_id", match=models.MatchValue(value=user_id))
                    ]
                ),
                limit=1, with_payload=False, with_vectors=False
            )
            if scroll_response:
                logging.warning(f"⚠️ Document with file_id '{file_id}' for user_id '{user_id}' already processed. Skipping.")
                return

            text_content = self._extract_text_from_file(file_content_bytes, original_filename)
            if not text_content or not text_content.strip():
                logging.warning(f"⚠️ No text content found in '{original_filename}'. Skipping.")
                return

            chunks = self.text_splitter.split_text(text_content)
            if not chunks:
                 logging.warning(f"⚠️ Text splitting resulted in 0 chunks for '{original_filename}'.")
                 return
            
            embeddings = self.embedder.embed_documents(chunks)
            
            points_to_insert = [
                models.PointStruct(
                    id=str(uuid.uuid4()),
                    vector=embeddings[i],
                    payload={
                        "file_id": file_id,
                        "user_id": user_id,
                        "user_name": user_name,
                        "collection_name": collection_name,
                        "original_filename": original_filename,
                        "timestamp": timestamp,
                        "chunk_index": i,
                        "text": chunk_text
                    }
                )
                for i, chunk_text in enumerate(chunks)
            ]

            if points_to_insert:
                self.qdrant.upsert(
                    collection_name=COLLECTION_NAME,
                    points=points_to_insert,
                    wait=True
                )
                logging.info(f"✅ Stored {len(points_to_insert)} chunks for '{original_filename}' in Qdrant.")
            
        except Exception as e:
            logging.error(f"❌ Error processing document '{original_filename}': {e}", exc_info=True)
            raise
        finally:
            logging.info(f"--- Document Ingestion End ---")