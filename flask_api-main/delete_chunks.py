import os
import logging
from qdrant_client import QdrantClient, models

# --- Constants ---
COLLECTION_NAME = "doc_assist_collection"

class ChunkDeleter:
    """
    Handles the deletion of document chunks from a Qdrant collection.
    """
    def __init__(self, qdrant_client: QdrantClient):
        self.qdrant = qdrant_client

    def delete_by_file_ids(self, file_ids: list[str]):
        """
        Deletes all points from Qdrant that match the given file_ids.
        
        Args:
            file_ids: A list of string file IDs (UUIDs) whose chunks should be deleted.
        """
        if not self.qdrant:
            logging.error("Cannot delete chunks because Qdrant client is not available.")
            return

        if not file_ids:
            logging.warning("No file_ids provided for deletion. Skipping.")
            return

        points_selector = models.FilterSelector(
            filter=models.Filter(
                must=[
                    models.FieldCondition(
                        key="file_id",
                        match=models.MatchAny(
                            any=file_ids
                        )
                    )
                ]
            )
        )
        
        try:
            logging.info(f"Attempting to delete Qdrant points for file_ids: {file_ids}")
            
            delete_result = self.qdrant.delete(
                collection_name=COLLECTION_NAME,
                points_selector=points_selector,
                wait=True
            )
            
            logging.info(f"✅ Qdrant deletion command executed for file_ids: {file_ids}. Result: {delete_result}")
            
        except Exception as e:
            logging.error(f"❌ An error occurred during Qdrant deletion for file_ids {file_ids}: {e}", exc_info=True)
            raise
