import { z } from 'zod';

// Base Media Schema
const BaseMediaSchema = z.object({
  locid: z.string().uuid().optional(),
  subid: z.string().uuid().optional(),
  auth_imp: z.string().optional()
});

// Image Schema
export const ImageSchema = BaseMediaSchema.extend({
  imgsha: z.string(),
  imgnam: z.string(),
  imgnamo: z.string(),
  imgloc: z.string(),
  imgloco: z.string(),
  imgadd: z.string().datetime(),
  meta_exiftool: z.record(z.unknown()).optional(),
  meta_width: z.number().optional(),
  meta_height: z.number().optional(),
  meta_date_taken: z.string().datetime().optional(),
  meta_camera_make: z.string().optional(),
  meta_camera_model: z.string().optional(),
  meta_gps_lat: z.number().optional(),
  meta_gps_lng: z.number().optional()
});

export type Image = z.infer<typeof ImageSchema>;

// Video Schema
export const VideoSchema = BaseMediaSchema.extend({
  vidsha: z.string(),
  vidnam: z.string(),
  vidnamo: z.string(),
  vidloc: z.string(),
  vidloco: z.string(),
  vidadd: z.string().datetime(),
  meta_ffmpeg: z.record(z.unknown()).optional(),
  meta_exiftool: z.record(z.unknown()).optional(),
  meta_duration: z.number().optional(),
  meta_width: z.number().optional(),
  meta_height: z.number().optional(),
  meta_codec: z.string().optional(),
  meta_fps: z.number().optional(),
  meta_date_taken: z.string().datetime().optional()
});

export type Video = z.infer<typeof VideoSchema>;

// Document Schema
export const DocumentSchema = BaseMediaSchema.extend({
  docsha: z.string(),
  docnam: z.string(),
  docnamo: z.string(),
  docloc: z.string(),
  docloco: z.string(),
  docadd: z.string().datetime(),
  meta_exiftool: z.record(z.unknown()).optional(),
  meta_page_count: z.number().optional(),
  meta_author: z.string().optional(),
  meta_title: z.string().optional()
});

export type Document = z.infer<typeof DocumentSchema>;

// Map Schema
export const MapSchema = BaseMediaSchema.extend({
  mapsha: z.string(),
  mapnam: z.string(),
  mapnamo: z.string(),
  maploc: z.string(),
  maploco: z.string(),
  mapadd: z.string().datetime(),
  meta_exiftool: z.record(z.unknown()).optional(),
  meta_map: z.record(z.unknown()).optional(),
  reference: z.string().optional(),
  map_states: z.string().optional(),
  map_verified: z.boolean().default(false)
});

export type Map = z.infer<typeof MapSchema>;
