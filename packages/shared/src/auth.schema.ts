import { z } from "zod";

export const AuthSchema = z.object({
  token: z.jwt().meta({
    description:
      "The Bearer token used to authenticate the user through requests",
  }),
});

const authEmail = z.email().meta({
  description: "The email used for the user account",
});

const authPassword = z.string().meta({
  description: "The password used for the user account",
});

export const CreateAuthSchema = z.object({
  email: authEmail,
  password: authPassword,
});

export const VerifyAuthSchema = z.object({
  email: authEmail,
  password: authPassword,
});

export const UpdateAuthSchema = z.object({
  email: authEmail,
  password: authPassword,
});

export type Auth = z.infer<typeof AuthSchema>;
export type CreateAuth = z.infer<typeof CreateAuthSchema>;
export type VerifyAuth = z.infer<typeof VerifyAuthSchema>;
export type UpdateAuth = z.infer<typeof UpdateAuthSchema>;
