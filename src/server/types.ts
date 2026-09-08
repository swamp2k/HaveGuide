export interface AuthUser {
  id: string;
  username: string;
}

export interface SessionContext {
  id: string;
  tokenHash: string;
  expiresAt: string;
}

export type AppBindings = Env & {
  APP_ENV: string;
  SESSION_DAYS: string;
  MAX_UPLOAD_MB: string;
  ANTHROPIC_MODEL: string;
  ANTHROPIC_API_KEY?: string;
  PLANTNET_API_KEY?: string;
  PLANTNET_PROJECT?: string;
  OPENAI_API_KEY?: string;
  OPENAI_IMAGE_MODEL?: string;
  OPENAI_IMAGE_QUALITY?: string;
};

export interface AppVariables {
  user: AuthUser;
  session: SessionContext;
}

export type AppEnvironment = {
  Bindings: AppBindings;
  Variables: AppVariables;
};
