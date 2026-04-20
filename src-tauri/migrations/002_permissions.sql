-- Per-artifact capability grants.
-- `artifact_id` is the SHA-256 content hash (same as artifacts.id).
-- `capability` is a stable id: 'camera', 'geolocation', 'network:https://host', etc.
-- Granting persists; revoking deletes the row.
CREATE TABLE IF NOT EXISTS artifact_permissions (
  artifact_id TEXT NOT NULL,
  capability TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  PRIMARY KEY (artifact_id, capability),
  FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_artifact_permissions_artifact ON artifact_permissions(artifact_id);
