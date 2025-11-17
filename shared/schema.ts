import { sql } from "drizzle-orm";
import { 
  pgTable, 
  bigint, 
  varchar, 
  text, 
  timestamp, 
  boolean, 
  integer, 
  decimal,
  date,
  jsonb,
  pgEnum,
  index,
  uniqueIndex
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================================================
// ENUMS
// ============================================================================

export const genderEnum = pgEnum("gender", ["male", "female", "unknown"]);
export const userStatusEnum = pgEnum("user_status", ["active", "blocked"]);
export const adminRoleEnum = pgEnum("admin_role", ["owner", "marketing", "readonly"]);
export const discountEventEnum = pgEnum("discount_event", ["subscription", "birthday", "manual", "campaign", "reminder"]);
export const discountValueTypeEnum = pgEnum("discount_value_type", ["percent", "fixed"]);
export const discountUsageTypeEnum = pgEnum("discount_usage_type", ["single", "shared"]);
export const discountStatusEnum = pgEnum("discount_status", ["active", "used", "expired", "cancelled"]);
export const broadcastStatusEnum = pgEnum("broadcast_status", ["draft", "scheduled", "sending", "completed", "failed", "cancelled"]);
export const eventTypeEnum = pgEnum("event_type", [
  "user_registered",
  "user_birthday_set",
  "discount_issued",
  "discount_redeemed",
  "discount_redemption_attempt",
  "broadcast_created",
  "broadcast_sent",
  "broadcast_failed",
  "cashier_registered",
  "cashier_approved",
  "campaign_created",
  "subscription_checked",
  "error"
]);

// ============================================================================
// USERS
// ============================================================================

export const users = pgTable("users", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull().unique(),
  username: varchar("username", { length: 255 }),
  firstName: varchar("first_name", { length: 255 }),
  lastName: varchar("last_name", { length: 255 }),
  phone: varchar("phone", { length: 32 }),
  gender: genderEnum("gender").notNull().default("unknown"),
  birthday: date("birthday"),
  isSubscribed: boolean("is_subscribed").notNull().default(false),
  subscriptionCheckedAt: timestamp("subscription_checked_at"),
  source: varchar("source", { length: 255 }), // offline, tgchannel, instagram, ref_12, etc.
  tags: jsonb("tags").$type<string[]>().default([]),
  status: userStatusEnum("status").notNull().default("active"),
  lastActivityAt: timestamp("last_activity_at"),
  isTest: boolean("is_test").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  telegramIdIdx: uniqueIndex("users_telegram_id_idx").on(table.telegramId),
  isSubscribedIdx: index("users_is_subscribed_idx").on(table.isSubscribed),
  birthdayIdx: index("users_birthday_idx").on(table.birthday),
  sourceIdx: index("users_source_idx").on(table.source),
  createdAtIdx: index("users_created_at_idx").on(table.createdAt),
}));

export const usersRelations = relations(users, ({ many }) => ({
  discounts: many(discounts),
  eventLogs: many(eventLogs),
}));

// ============================================================================
// ADMINS
// ============================================================================

export const admins = pgTable("admins", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull().unique(),
  email: varchar("email", { length: 255 }),
  name: varchar("name", { length: 255 }),
  role: adminRoleEnum("role").notNull().default("readonly"),
  canBroadcastFromChat: boolean("can_broadcast_from_chat").notNull().default(false),
  notificationGroups: jsonb("notification_groups").$type<string[]>().default([]), // ["errors", "broadcasts", "cashier_logs"]
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const adminsRelations = relations(admins, ({ many }) => ({
  approvedCashiers: many(cashiers),
}));

// ============================================================================
// CASHIERS
// ============================================================================

export const cashiers = pgTable("cashiers", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  isActive: boolean("is_active").notNull().default(false),
  approvedByAdminId: bigint("approved_by_admin_id", { mode: "number" }).references(() => admins.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  telegramIdIdx: uniqueIndex("cashiers_telegram_id_idx").on(table.telegramId),
}));

export const cashiersRelations = relations(cashiers, ({ one, many }) => ({
  approvedBy: one(admins, {
    fields: [cashiers.approvedByAdminId],
    references: [admins.id],
  }),
  eventLogs: many(eventLogs),
}));

// ============================================================================
// DISCOUNT TEMPLATES
// ============================================================================

export const discountTemplates = pgTable("discount_templates", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  value: decimal("value", { precision: 10, scale: 2 }).notNull(),
  valueType: discountValueTypeEnum("value_type").notNull().default("percent"),
  durationDays: integer("duration_days").notNull().default(7),
  recurrence: jsonb("recurrence").$type<{ type: string; value?: number }>(), // { type: "monthly" } or { type: "days", value: 30 }
  event: discountEventEnum("event").notNull(),
  usageType: discountUsageTypeEnum("usage_type").notNull().default("single"),
  reminders: jsonb("reminders").$type<number[]>().default([]), // [7, 30] days after issuance
  messageTemplate: text("message_template"), // Custom message template for this discount type
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  nameIdx: uniqueIndex("discount_templates_name_idx").on(table.name),
  eventIdx: index("discount_templates_event_idx").on(table.event),
}));

export const discountTemplatesRelations = relations(discountTemplates, ({ many }) => ({
  discounts: many(discounts),
}));

// ============================================================================
// DISCOUNTS
// ============================================================================

export const discounts = pgTable("discounts", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  code: varchar("code", { length: 20 }).notNull().unique(), // АБВ1234 (3 Cyrillic + 4 digits)
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
  templateId: bigint("template_id", { mode: "number" }).notNull().references(() => discountTemplates.id),
  campaignId: bigint("campaign_id", { mode: "number" }).references(() => campaigns.id),
  value: decimal("value", { precision: 10, scale: 2 }).notNull(),
  valueType: discountValueTypeEnum("value_type").notNull(),
  status: discountStatusEnum("status").notNull().default("active"),
  issuedAt: timestamp("issued_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  usedByCashierId: bigint("used_by_cashier_id", { mode: "number" }).references(() => cashiers.id),
  isTest: boolean("is_test").notNull().default(false),
}, (table) => ({
  codeIdx: uniqueIndex("discounts_code_idx").on(table.code),
  userIdIdx: index("discounts_user_id_idx").on(table.userId),
  statusIdx: index("discounts_status_idx").on(table.status),
  expiresAtIdx: index("discounts_expires_at_idx").on(table.expiresAt),
}));

export const discountsRelations = relations(discounts, ({ one }) => ({
  user: one(users, {
    fields: [discounts.userId],
    references: [users.id],
  }),
  template: one(discountTemplates, {
    fields: [discounts.templateId],
    references: [discountTemplates.id],
  }),
  campaign: one(campaigns, {
    fields: [discounts.campaignId],
    references: [campaigns.id],
  }),
  usedBy: one(cashiers, {
    fields: [discounts.usedByCashierId],
    references: [cashiers.id],
  }),
}));

// ============================================================================
// CAMPAIGNS (Referral)
// ============================================================================

export const campaigns = pgTable("campaigns", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 50 }).notNull().unique(), // ref_12_abc
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdByAdminId: bigint("created_by_admin_id", { mode: "number" }).references(() => admins.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  codeIdx: uniqueIndex("campaigns_code_idx").on(table.code),
}));

export const campaignsRelations = relations(campaigns, ({ many }) => ({
  discounts: many(discounts),
}));

// ============================================================================
// BROADCASTS
// ============================================================================

export const broadcasts = pgTable("broadcasts", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 255 }).notNull(),
  message: text("message").notNull(),
  mediaUrl: text("media_url"),
  mediaType: varchar("media_type", { length: 20 }), // photo, video, document
  buttons: jsonb("buttons").$type<{ text: string; url: string }[]>().default([]),
  targetAudience: jsonb("target_audience").$type<{
    all?: boolean;
    subscribed?: boolean;
    gender?: string;
    ageFrom?: number;
    ageTo?: number;
    tags?: string[];
    source?: string;
  }>().notNull(),
  status: broadcastStatusEnum("status").notNull().default("draft"),
  scheduledAt: timestamp("scheduled_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  totalRecipients: integer("total_recipients").default(0),
  sentCount: integer("sent_count").default(0),
  failedCount: integer("failed_count").default(0),
  createdByAdminId: bigint("created_by_admin_id", { mode: "number" }).references(() => admins.id),
  fromChatMode: boolean("from_chat_mode").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  statusIdx: index("broadcasts_status_idx").on(table.status),
  scheduledAtIdx: index("broadcasts_scheduled_at_idx").on(table.scheduledAt),
}));

export const broadcastsRelations = relations(broadcasts, ({ many }) => ({
  logs: many(broadcastLogs),
}));

// ============================================================================
// BROADCAST LOGS
// ============================================================================

export const broadcastLogs = pgTable("broadcast_logs", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  broadcastId: bigint("broadcast_id", { mode: "number" }).notNull().references(() => broadcasts.id, { onDelete: "cascade" }),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
  success: boolean("success").notNull(),
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
}, (table) => ({
  broadcastIdIdx: index("broadcast_logs_broadcast_id_idx").on(table.broadcastId),
  userIdIdx: index("broadcast_logs_user_id_idx").on(table.userId),
}));

export const broadcastLogsRelations = relations(broadcastLogs, ({ one }) => ({
  broadcast: one(broadcasts, {
    fields: [broadcastLogs.broadcastId],
    references: [broadcasts.id],
  }),
  user: one(users, {
    fields: [broadcastLogs.userId],
    references: [users.id],
  }),
}));

// ============================================================================
// SETTINGS
// ============================================================================

export const settings = pgTable("settings", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  key: varchar("key", { length: 255 }).notNull().unique(),
  value: jsonb("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  keyIdx: uniqueIndex("settings_key_idx").on(table.key),
}));

// ============================================================================
// EVENT LOGS
// ============================================================================

export const eventLogs = pgTable("event_logs", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  eventType: eventTypeEnum("event_type").notNull(),
  userId: bigint("user_id", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
  cashierId: bigint("cashier_id", { mode: "number" }).references(() => cashiers.id, { onDelete: "set null" }),
  discountId: bigint("discount_id", { mode: "number" }).references(() => discounts.id, { onDelete: "set null" }),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  message: text("message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  eventTypeIdx: index("event_logs_event_type_idx").on(table.eventType),
  userIdIdx: index("event_logs_user_id_idx").on(table.userId),
  cashierIdIdx: index("event_logs_cashier_id_idx").on(table.cashierId),
  createdAtIdx: index("event_logs_created_at_idx").on(table.createdAt),
}));

export const eventLogsRelations = relations(eventLogs, ({ one }) => ({
  user: one(users, {
    fields: [eventLogs.userId],
    references: [users.id],
  }),
  cashier: one(cashiers, {
    fields: [eventLogs.cashierId],
    references: [cashiers.id],
  }),
  discount: one(discounts, {
    fields: [eventLogs.discountId],
    references: [discounts.id],
  }),
}));

// ============================================================================
// INSERT & SELECT SCHEMAS
// ============================================================================

// Users
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const updateUserSchema = insertUserSchema.partial();
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpdateUser = z.infer<typeof updateUserSchema>;
export type User = typeof users.$inferSelect;

// Admins
export const insertAdminSchema = createInsertSchema(admins).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const updateAdminSchema = insertAdminSchema.partial();
export type InsertAdmin = z.infer<typeof insertAdminSchema>;
export type UpdateAdmin = z.infer<typeof updateAdminSchema>;
export type Admin = typeof admins.$inferSelect;

// Cashiers
export const insertCashierSchema = createInsertSchema(cashiers).omit({
  id: true,
  createdAt: true,
});
export const updateCashierSchema = insertCashierSchema.partial();
export type InsertCashier = z.infer<typeof insertCashierSchema>;
export type UpdateCashier = z.infer<typeof updateCashierSchema>;
export type Cashier = typeof cashiers.$inferSelect;

// Discount Templates
export const insertDiscountTemplateSchema = createInsertSchema(discountTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const updateDiscountTemplateSchema = insertDiscountTemplateSchema.partial();
export type InsertDiscountTemplate = z.infer<typeof insertDiscountTemplateSchema>;
export type UpdateDiscountTemplate = z.infer<typeof updateDiscountTemplateSchema>;
export type DiscountTemplate = typeof discountTemplates.$inferSelect;

// Discounts
export const insertDiscountSchema = createInsertSchema(discounts).omit({
  id: true,
  issuedAt: true,
});
export const updateDiscountSchema = insertDiscountSchema.partial();
export type InsertDiscount = z.infer<typeof insertDiscountSchema>;
export type UpdateDiscount = z.infer<typeof updateDiscountSchema>;
export type Discount = typeof discounts.$inferSelect;

// Campaigns
export const insertCampaignSchema = createInsertSchema(campaigns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const updateCampaignSchema = insertCampaignSchema.partial();
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type UpdateCampaign = z.infer<typeof updateCampaignSchema>;
export type Campaign = typeof campaigns.$inferSelect;

// Broadcasts
export const insertBroadcastSchema = createInsertSchema(broadcasts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  startedAt: true,
  completedAt: true,
});
export const updateBroadcastSchema = insertBroadcastSchema.partial();
export type InsertBroadcast = z.infer<typeof insertBroadcastSchema>;
export type UpdateBroadcast = z.infer<typeof updateBroadcastSchema>;
export type Broadcast = typeof broadcasts.$inferSelect;

// Broadcast Logs
export const insertBroadcastLogSchema = createInsertSchema(broadcastLogs).omit({
  id: true,
  sentAt: true,
});
export type InsertBroadcastLog = z.infer<typeof insertBroadcastLogSchema>;
export type BroadcastLog = typeof broadcastLogs.$inferSelect;

// Settings
export const insertSettingSchema = createInsertSchema(settings).omit({
  id: true,
  updatedAt: true,
});
export type InsertSetting = z.infer<typeof insertSettingSchema>;
export type Setting = typeof settings.$inferSelect;

// Event Logs
export const insertEventLogSchema = createInsertSchema(eventLogs).omit({
  id: true,
  createdAt: true,
});
export type InsertEventLog = z.infer<typeof insertEventLogSchema>;
export type EventLog = typeof eventLogs.$inferSelect;

// ============================================================================
// UTILITY SCHEMAS
// ============================================================================

export const targetAudienceSchema = z.object({
  all: z.boolean().optional(),
  subscribed: z.boolean().optional(),
  gender: z.enum(["male", "female", "unknown"]).optional(),
  ageFrom: z.number().optional(),
  ageTo: z.number().optional(),
  tags: z.array(z.string()).optional(),
  source: z.string().optional(),
  hasActiveDiscounts: z.boolean().optional(),
  registeredAfter: z.string().optional(),
  registeredBefore: z.string().optional(),
});

export type TargetAudience = z.infer<typeof targetAudienceSchema>;
