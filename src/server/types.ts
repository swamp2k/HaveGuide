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
};

export interface AppVariables {
  user: AuthUser;
  session: SessionContext;
}

export type AppEnvironment = {
  Bindings: AppBindings;
  Variables: AppVariables;
};
