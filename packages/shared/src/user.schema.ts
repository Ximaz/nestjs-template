import { z } from "zod";

export const UserSchema = z.object({
  id: z.string().meta({ description: "The unique user ID" }),
  email: z.string().meta({ description: "The user email address" }),
  firstName: z
    .string()
    .nullable()
    .default(null)
    .meta({ description: "The user first name" }),
  lastName: z
    .string()
    .nullable()
    .default(null)
    .meta({ description: "The user last name" }),
  picture: z
    .url()
    .nullable()
    .default(null)
    .meta({ description: "The URL to the user profile picture" }),
});

export type User = z.infer<typeof UserSchema>;
