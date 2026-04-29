import { z } from "zod";

const oauthProvider = z.string().meta({
  description: "The OAuth2.0 provider the authentication relies on",
});

const oauthRedirectUri = z.string().meta({
  description:
    "The frontend URL to which the user is redirected after authorization, usually the callback endpoint",
});

export const OAuthSchema = z.object({
  url: z.url().meta({
    description: "The OAuth2.0 redirection URL used to authenticate the user",
  }),
});

export const CreateOAuthSchema = z.object({
  provider: oauthProvider,
  redirectUri: oauthRedirectUri,
});

export const CreateOAuthCallbackSchema = z.object({
  provider: oauthProvider,
  redirectUri: oauthRedirectUri,
  code: z.string().meta({
    description:
      "The OAuth2.0 callback code returned by the provider upon authorization",
  }),
});

export type OAuth = z.infer<typeof OAuthSchema>;
export type CreateOAuth = z.infer<typeof CreateOAuthSchema>;
export type CreateOAuthCallback = z.infer<typeof CreateOAuthCallbackSchema>;
