-- Fix existing MinIO URLs that use internal Docker hostname
UPDATE whatsapp_messages
SET media_url = REPLACE(media_url, 'http://minio:9000/', 'http://82.25.70.124:9000/')
WHERE media_url LIKE 'http://minio:9000/%';