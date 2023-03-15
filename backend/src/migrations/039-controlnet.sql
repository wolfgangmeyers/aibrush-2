-- add controlnet type to images table
-- canny, hed, depth, normal, openpose, seg, scribble, fakescribbles, hough
ALTER TABLE images ADD COLUMN controlnet_type text;
