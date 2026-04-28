import { z } from "zod";

export const HealthSchema = z.object({
  status: z
    .literal(["ok", "error"])
    .meta({ description: "The current state of the application." }),
  uptime: z.number().meta({
    description: "The delta between UNIX timestamp of request and start time",
  }),
  timestamp: z.iso.datetime().meta({
    description: "The current timestamp in the application location",
  }),
});

export type Health = z.infer<typeof HealthSchema>;
