-- Add the new params jsonb column
ALTER TABLE images ADD COLUMN params jsonb;

-- Update the table to populate the params column
UPDATE images SET
  params = jsonb_build_object(
    'prompt', array_to_string(phrases, ', '),
    'steps', iterations,
    'negative_prompt', array_to_string(negative_phrases, ', '),
    'width', width,
    'height', height,
    'denoising_strength', stable_diffusion_strength,
    'controlnet_type', controlnet_type,
    'augmentation', augmentation
  );

-- Remove the unwanted columns
ALTER TABLE images
  DROP phrases,
  DROP iterations,
  DROP current_iterations,
  DROP negative_phrases,
  DROP width,
  DROP height,
  DROP stable_diffusion_strength,
  DROP controlnet_type,
  DROP augmentation,
  DROP enable_video,
  DROP enable_zoom,
  DROP zoom_frequency,
  DROP zoom_scale,
  DROP zoom_shift_x,
  DROP zoom_shift_y,
  DROP glid_3_xl_skip_iterations,
  DROP glid_3_xl_clip_guidance,
  DROP glid_3_xl_clip_guidance_scale,
  DROP uncrop_offset_x,
  DROP uncrop_offset_y,
  DROP worker_id;
