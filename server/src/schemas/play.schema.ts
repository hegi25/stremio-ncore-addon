import { z } from 'zod';

export const playSchema = z.object({
  deviceToken: z.string(),
  ncoreId: z.string(),
  infoHash: z.string(),
  filePath: z.string(),
});

export type PlaySchema = z.infer<typeof playSchema>;
