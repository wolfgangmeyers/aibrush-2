-- update images.model records to 'vqgan_imagenet_f16_16384' and also default to that value instead of null
UPDATE images SET model = 'vqgan_imagenet_f16_16384' WHERE model IS NULL;
ALTER TABLE images ALTER COLUMN model SET DEFAULT 'vqgan_imagenet_f16_16384';
