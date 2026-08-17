import type { User } from "../../shared/types";
import type { ApiClient } from "./api";

export type View = "dashboard" | "products" | "stock" | "inventory" | "labels" | "schedule" | "reports" | "users" | "saby" | "audit";
export type NavigationIntent =
  | "stock-receipt"
  | "stock-search"
  | "stock-low"
  | "inventory-start"
  | "labels-print"
  | `schedule-date:${string}`
  | `stock-receipt-draft:${string}`;
export type AuthMode = "demo" | "telegram-test" | "telegram-webapp";
export type SessionData = { user: User; permissions: string[] };

export type DevConfig = {
  telegramTestMode: boolean;
  users: Array<Pick<User, "id" | "telegramUserId" | "firstName" | "lastName" | "username" | "role" | "status">>;
};

export type PageProps = {
  client: ApiClient;
  session: SessionData;
  intent?: NavigationIntent;
  onIntentHandled?: () => void;
  onNavigate?: (view: View, intent?: NavigationIntent) => void;
};
