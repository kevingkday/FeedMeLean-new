import type { User } from '../shared/types';

export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  AI_PROVIDER?: string;
  AI_MODEL?: string;
  AI_API_KEY?: string;
  ADMIN_EMAIL?: string;
  RESEND_API_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  RECAPTCHA_SITE_KEY?: string;
  RECAPTCHA_SECRET_KEY?: string;
  AZURE_BLOB_CONNECTION_STRING?: string;
  AZURE_BLOB_CONTAINER?: string;
  APP_ENV?: string;
}

export interface Variables {
  user: User;
  sessionId: string;
}

export type AppContext = {
  Bindings: Env;
  Variables: Variables;
};

