import os
import logging
import json
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from qdrant_client import QdrantClient, models

# --- Constants ---
COLLECTION_NAME = "doc_assist_collection"
TOP_K_RESULTS = 3
SUMMARY_CHUNK_LIMIT = 30

SUMMARIZATION_KEYWORDS = [
    "summarize", "summary", "overview", "gist", "main points", 
    "key points", "in short", "in brief", "what is this about", "what's this about",
    "tell me about this file", "give me a summary", "can you summarize"
]

class ContextRetriever:
    def __init__(self, db_client: ChatOpenAI, qdrant_client: QdrantClient):
        if not qdrant_client: raise RuntimeError("Qdrant client is not initialized.")
        if not db_client: logging.warning("Databricks client not initialized. Query expansion will be skipped.")

        self.db_client = db_client
        self.qdrant = qdrant_client
        
        self.embedder = OpenAIEmbeddings(
            model=os.getenv("DATABRICKS_EMBEDDING_MODEL"),
            openai_api_base=os.getenv("DATABRICKS_BASE_URL"),
            openai_api_key=os.getenv("DATABRICKS_TOKEN"),
            check_embedding_ctx_length=False
        )

    def _get_expanded_queries(self, query: str) -> list[str]:
        if not self.db_client: return [query]
        
        system_prompt = """You are an expert at query expansion. Based on the user's question, generate a JSON array of 3-5 diverse, specific search queries. Return ONLY the JSON array.
Example: User question: "Safety requirements for thruster control system?"
Response: ["thruster control system safety", "emergency stop procedures", "control system warnings", "operator safety guidelines"]"""
        messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": query}]
        
        try:
            response = self.db_client.invoke(messages, max_tokens=100, temperature=0.3)
            response_text = response.content.strip()
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0]
            expanded_queries = json.loads(response_text)
            if query not in expanded_queries: expanded_queries.append(query)
            return expanded_queries
        except Exception as e:
            logging.error(f"Failed to expand query, falling back to original. Error: {e}")
            return [query]

    def search(self, query: str, user_id: str, file_ids: list[str]) -> list[dict]:
        if not self.qdrant or not file_ids: return []
            
        is_summary_request = any(keyword in query.lower() for keyword in SUMMARIZATION_KEYWORDS)
        
        query_filter = models.Filter(
            must=[
                models.FieldCondition(key="user_id", match=models.MatchValue(value=user_id)),
                models.FieldCondition(key="file_id", match=models.MatchAny(any=file_ids))
            ]
        )
        
        logging.info(f"--- Context Search ---")
        logging.info(f"Query: '{query}', Summary Request: {is_summary_request}")

        try:
            if is_summary_request:
                scroll_results, _ = self.qdrant.scroll(
                    collection_name=COLLECTION_NAME, scroll_filter=query_filter,
                    limit=SUMMARY_CHUNK_LIMIT, with_payload=True, with_vectors=False
                )
                if not scroll_results: return []
                payloads = [record.payload for record in scroll_results]
                return sorted(payloads, key=lambda k: k.get('chunk_index', 0))
            else:
                expanded_queries = self._get_expanded_queries(query)
                all_hits = []
                for eq in expanded_queries:
                    query_vector = self.embedder.embed_query(eq)
                    search_results = self.qdrant.search(
                        collection_name=COLLECTION_NAME, query_vector=query_vector,
                        query_filter=query_filter, limit=TOP_K_RESULTS,
                        with_payload=True, with_vectors=False
                    )
                    all_hits.extend(search_results)
                
                unique_chunks = {}
                for hit in all_hits:
                    chunk_key = (hit.payload.get('file_id'), hit.payload.get('chunk_index'))
                    if all(k is not None for k in chunk_key) and chunk_key not in unique_chunks and hit.payload.get("text"):
                        unique_chunks[chunk_key] = { "text": hit.payload.get("text"), "original_filename": hit.payload.get("original_filename") }
                
                retrieved_chunks = list(unique_chunks.values())
                logging.info(f"Retrieved {len(retrieved_chunks)} unique chunks for query: '{query[:50]}...'")
                return retrieved_chunks

        except Exception as e:
            logging.error(f"Qdrant operation failed for user {user_id}: {e}", exc_info=True)
            return []
