import { eq, desc, and, or, gte, lte, sql, inArray } from "drizzle-orm";
import { db } from "./db";
import * as schema from "@shared/schema";
import type {
  User,
  InsertUser,
  Admin,
  InsertAdmin,
  Cashier,
  InsertCashier,
  DiscountTemplate,
  InsertDiscountTemplate,
  Discount,
  InsertDiscount,
  Campaign,
  InsertCampaign,
  Broadcast,
  InsertBroadcast,
  BroadcastLog,
  InsertBroadcastLog,
  Setting,
  InsertSetting,
  EventLog,
  InsertEventLog,
} from "@shared/schema";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByTelegramId(telegramId: number): Promise<User | undefined>;
  getUsers(filters?: {
    status?: string;
    isSubscribed?: boolean;
    source?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, user: Partial<InsertUser>): Promise<User | undefined>;
  getUsersCount(): Promise<number>;

  // Admins
  getAdmin(id: number): Promise<Admin | undefined>;
  getAdminByTelegramId(telegramId: number): Promise<Admin | undefined>;
  getAdmins(): Promise<Admin[]>;
  createAdmin(admin: InsertAdmin): Promise<Admin>;
  updateAdmin(id: number, admin: Partial<InsertAdmin>): Promise<Admin | undefined>;

  // Cashiers
  getCashier(id: number): Promise<Cashier | undefined>;
  getCashierByTelegramId(telegramId: number): Promise<Cashier | undefined>;
  getCashiers(filters?: { isActive?: boolean }): Promise<Cashier[]>;
  createCashier(cashier: InsertCashier): Promise<Cashier>;
  updateCashier(id: number, cashier: Partial<InsertCashier>): Promise<Cashier | undefined>;

  // Discount Templates
  getDiscountTemplate(id: number): Promise<DiscountTemplate | undefined>;
  getDiscountTemplateByName(name: string): Promise<DiscountTemplate | undefined>;
  getDiscountTemplates(filters?: { event?: string; isActive?: boolean }): Promise<DiscountTemplate[]>;
  createDiscountTemplate(template: InsertDiscountTemplate): Promise<DiscountTemplate>;
  updateDiscountTemplate(id: number, template: Partial<InsertDiscountTemplate>): Promise<DiscountTemplate | undefined>;
  deleteDiscountTemplate(id: number): Promise<boolean>;

  // Discounts
  getDiscount(id: number): Promise<Discount | undefined>;
  getDiscountByCode(code: string): Promise<Discount | undefined>;
  getDiscounts(filters?: {
    userId?: number;
    status?: string;
    campaignId?: number;
    limit?: number;
    offset?: number;
  }): Promise<Discount[]>;
  createDiscount(discount: InsertDiscount): Promise<Discount>;
  updateDiscount(id: number, discount: Partial<InsertDiscount>): Promise<Discount | undefined>;
  getActiveDiscountsCount(): Promise<number>;
  generateDiscountCode(): Promise<string>;
  issueDiscount(userId: number, templateId: number, campaignId?: number): Promise<{ success: boolean; discount?: Discount; error?: string }>;
  redeemDiscount(code: string, cashierId: number): Promise<{ success: boolean; discount?: Discount; error?: string; user?: User }>;
  validateDiscount(code: string): Promise<{ valid: boolean; discount?: Discount; error?: string; user?: User }>;
  expireDiscounts(): Promise<number>;
  getUserActiveDiscounts(userId: number): Promise<Discount[]>;

  // Campaigns
  getCampaign(id: number): Promise<Campaign | undefined>;
  getCampaignByCode(code: string): Promise<Campaign | undefined>;
  getCampaigns(filters?: { isActive?: boolean }): Promise<Campaign[]>;
  createCampaign(campaign: InsertCampaign): Promise<Campaign>;
  updateCampaign(id: number, campaign: Partial<InsertCampaign>): Promise<Campaign | undefined>;
  deleteCampaign(id: number): Promise<boolean>;

  // Broadcasts
  getBroadcast(id: number): Promise<Broadcast | undefined>;
  getBroadcasts(filters?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<Broadcast[]>;
  createBroadcast(broadcast: InsertBroadcast): Promise<Broadcast>;
  updateBroadcast(id: number, broadcast: Partial<InsertBroadcast>): Promise<Broadcast | undefined>;
  calculateBroadcastAudience(targetAudience: any): Promise<number>;
  getUsersForBroadcast(targetAudience: any): Promise<User[]>;

  // Broadcast Logs
  getBroadcastLogs(broadcastId: number): Promise<BroadcastLog[]>;
  createBroadcastLog(log: InsertBroadcastLog): Promise<BroadcastLog>;

  // Settings
  getSetting(key: string): Promise<Setting | undefined>;
  getSettings(): Promise<Setting[]>;
  upsertSetting(setting: InsertSetting): Promise<Setting>;

  // Event Logs
  getEventLogs(filters?: {
    eventType?: string;
    userId?: number;
    cashierId?: number;
    limit?: number;
    offset?: number;
  }): Promise<EventLog[]>;
  createEventLog(log: InsertEventLog): Promise<EventLog>;

  // Statistics
  getDashboardStats(): Promise<{
    totalUsers: number;
    activeDiscounts: number;
    totalDiscountsIssued: number;
    subscribedUsers: number;
  }>;
}

export class PostgresStorage implements IStorage {
  // ============================================================================
  // USERS
  // ============================================================================

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
    return user;
  }

  async getUserByTelegramId(telegramId: number): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.telegramId, telegramId))
      .limit(1);
    return user;
  }

  async getUsers(filters?: {
    status?: string;
    isSubscribed?: boolean;
    source?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<User[]> {
    let query = db.select().from(schema.users);

    const conditions = [];
    if (filters?.status) {
      conditions.push(eq(schema.users.status, filters.status as any));
    }
    if (filters?.isSubscribed !== undefined) {
      conditions.push(eq(schema.users.isSubscribed, filters.isSubscribed));
    }
    if (filters?.source) {
      conditions.push(eq(schema.users.source, filters.source));
    }
    if (filters?.search) {
      conditions.push(
        or(
          sql`${schema.users.firstName} ILIKE ${`%${filters.search}%`}`,
          sql`${schema.users.lastName} ILIKE ${`%${filters.search}%`}`,
          sql`${schema.users.username} ILIKE ${`%${filters.search}%`}`,
          sql`${schema.users.phone} ILIKE ${`%${filters.search}%`}`
        )!
      );
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)!) as any;
    }

    query = query.orderBy(desc(schema.users.createdAt)) as any;

    if (filters?.limit) {
      query = query.limit(filters.limit) as any;
    }
    if (filters?.offset) {
      query = query.offset(filters.offset) as any;
    }

    return query;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(schema.users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: number, updateData: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db
      .update(schema.users)
      .set(updateData)
      .where(eq(schema.users.id, id))
      .returning();
    return user;
  }

  async getUsersCount(): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.users);
    return result.count;
  }

  // ============================================================================
  // ADMINS
  // ============================================================================

  async getAdmin(id: number): Promise<Admin | undefined> {
    const [admin] = await db.select().from(schema.admins).where(eq(schema.admins.id, id)).limit(1);
    return admin;
  }

  async getAdminByTelegramId(telegramId: number): Promise<Admin | undefined> {
    const [admin] = await db
      .select()
      .from(schema.admins)
      .where(eq(schema.admins.telegramId, telegramId))
      .limit(1);
    return admin;
  }

  async getAdmins(): Promise<Admin[]> {
    return db.select().from(schema.admins).orderBy(desc(schema.admins.createdAt));
  }

  async createAdmin(insertAdmin: InsertAdmin): Promise<Admin> {
    const [admin] = await db.insert(schema.admins).values(insertAdmin).returning();
    return admin;
  }

  async updateAdmin(id: number, updateData: Partial<InsertAdmin>): Promise<Admin | undefined> {
    const [admin] = await db
      .update(schema.admins)
      .set(updateData)
      .where(eq(schema.admins.id, id))
      .returning();
    return admin;
  }

  // ============================================================================
  // CASHIERS
  // ============================================================================

  async getCashier(id: number): Promise<Cashier | undefined> {
    const [cashier] = await db
      .select()
      .from(schema.cashiers)
      .where(eq(schema.cashiers.id, id))
      .limit(1);
    return cashier;
  }

  async getCashierByTelegramId(telegramId: number): Promise<Cashier | undefined> {
    const [cashier] = await db
      .select()
      .from(schema.cashiers)
      .where(eq(schema.cashiers.telegramId, telegramId))
      .limit(1);
    return cashier;
  }

  async getCashiers(filters?: { isActive?: boolean }): Promise<Cashier[]> {
    let query = db.select().from(schema.cashiers);

    if (filters?.isActive !== undefined) {
      query = query.where(eq(schema.cashiers.isActive, filters.isActive)) as any;
    }

    return query.orderBy(desc(schema.cashiers.createdAt));
  }

  async createCashier(insertCashier: InsertCashier): Promise<Cashier> {
    const [cashier] = await db.insert(schema.cashiers).values(insertCashier).returning();
    return cashier;
  }

  async updateCashier(id: number, updateData: Partial<InsertCashier>): Promise<Cashier | undefined> {
    const [cashier] = await db
      .update(schema.cashiers)
      .set(updateData)
      .where(eq(schema.cashiers.id, id))
      .returning();
    return cashier;
  }

  // ============================================================================
  // DISCOUNT TEMPLATES
  // ============================================================================

  async getDiscountTemplate(id: number): Promise<DiscountTemplate | undefined> {
    const [template] = await db
      .select()
      .from(schema.discountTemplates)
      .where(eq(schema.discountTemplates.id, id))
      .limit(1);
    return template;
  }

  async getDiscountTemplateByName(name: string): Promise<DiscountTemplate | undefined> {
    const [template] = await db
      .select()
      .from(schema.discountTemplates)
      .where(eq(schema.discountTemplates.name, name))
      .limit(1);
    return template;
  }

  async getDiscountTemplates(filters?: {
    event?: string;
    isActive?: boolean;
  }): Promise<DiscountTemplate[]> {
    let query = db.select().from(schema.discountTemplates);

    const conditions = [];
    if (filters?.event) {
      conditions.push(eq(schema.discountTemplates.event, filters.event as any));
    }
    if (filters?.isActive !== undefined) {
      conditions.push(eq(schema.discountTemplates.isActive, filters.isActive));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)!) as any;
    }

    return query.orderBy(desc(schema.discountTemplates.createdAt));
  }

  async createDiscountTemplate(insertTemplate: InsertDiscountTemplate): Promise<DiscountTemplate> {
    const [template] = await db
      .insert(schema.discountTemplates)
      .values(insertTemplate)
      .returning();
    return template;
  }

  async updateDiscountTemplate(
    id: number,
    updateData: Partial<InsertDiscountTemplate>
  ): Promise<DiscountTemplate | undefined> {
    const [template] = await db
      .update(schema.discountTemplates)
      .set(updateData)
      .where(eq(schema.discountTemplates.id, id))
      .returning();
    return template;
  }

  async deleteDiscountTemplate(id: number): Promise<boolean> {
    const result = await db
      .delete(schema.discountTemplates)
      .where(eq(schema.discountTemplates.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // ============================================================================
  // DISCOUNTS
  // ============================================================================

  async getDiscount(id: number): Promise<Discount | undefined> {
    const [discount] = await db
      .select()
      .from(schema.discounts)
      .where(eq(schema.discounts.id, id))
      .limit(1);
    return discount;
  }

  async getDiscountByCode(code: string): Promise<Discount | undefined> {
    const [discount] = await db
      .select()
      .from(schema.discounts)
      .where(eq(schema.discounts.code, code))
      .limit(1);
    return discount;
  }

  async getDiscounts(filters?: {
    userId?: number;
    status?: string;
    campaignId?: number;
    limit?: number;
    offset?: number;
  }): Promise<Discount[]> {
    let query = db.select().from(schema.discounts);

    const conditions = [];
    if (filters?.userId) {
      conditions.push(eq(schema.discounts.userId, filters.userId));
    }
    if (filters?.status) {
      conditions.push(eq(schema.discounts.status, filters.status as any));
    }
    if (filters?.campaignId) {
      conditions.push(eq(schema.discounts.campaignId, filters.campaignId));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)!) as any;
    }

    query = query.orderBy(desc(schema.discounts.issuedAt)) as any;

    if (filters?.limit) {
      query = query.limit(filters.limit) as any;
    }
    if (filters?.offset) {
      query = query.offset(filters.offset) as any;
    }

    return query;
  }

  async createDiscount(insertDiscount: InsertDiscount): Promise<Discount> {
    const [discount] = await db.insert(schema.discounts).values(insertDiscount).returning();
    return discount;
  }

  async updateDiscount(
    id: number,
    updateData: Partial<InsertDiscount>
  ): Promise<Discount | undefined> {
    const [discount] = await db
      .update(schema.discounts)
      .set(updateData)
      .where(eq(schema.discounts.id, id))
      .returning();
    return discount;
  }

  async getActiveDiscountsCount(): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.discounts)
      .where(eq(schema.discounts.status, "active"));
    return result.count;
  }

  // ============================================================================
  // CAMPAIGNS
  // ============================================================================

  async getCampaign(id: number): Promise<Campaign | undefined> {
    const [campaign] = await db
      .select()
      .from(schema.campaigns)
      .where(eq(schema.campaigns.id, id))
      .limit(1);
    return campaign;
  }

  async getCampaignByCode(code: string): Promise<Campaign | undefined> {
    const [campaign] = await db
      .select()
      .from(schema.campaigns)
      .where(eq(schema.campaigns.code, code))
      .limit(1);
    return campaign;
  }

  async getCampaigns(filters?: { isActive?: boolean }): Promise<Campaign[]> {
    let query = db.select().from(schema.campaigns);

    if (filters?.isActive !== undefined) {
      query = query.where(eq(schema.campaigns.isActive, filters.isActive)) as any;
    }

    return query.orderBy(desc(schema.campaigns.createdAt));
  }

  async createCampaign(insertCampaign: InsertCampaign): Promise<Campaign> {
    const [campaign] = await db.insert(schema.campaigns).values(insertCampaign).returning();
    return campaign;
  }

  async updateCampaign(
    id: number,
    updateData: Partial<InsertCampaign>
  ): Promise<Campaign | undefined> {
    const [campaign] = await db
      .update(schema.campaigns)
      .set(updateData)
      .where(eq(schema.campaigns.id, id))
      .returning();
    return campaign;
  }

  async deleteCampaign(id: number): Promise<boolean> {
    const result = await db.delete(schema.campaigns).where(eq(schema.campaigns.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // ============================================================================
  // BROADCASTS
  // ============================================================================

  async getBroadcast(id: number): Promise<Broadcast | undefined> {
    const [broadcast] = await db
      .select()
      .from(schema.broadcasts)
      .where(eq(schema.broadcasts.id, id))
      .limit(1);
    return broadcast;
  }

  async getBroadcasts(filters?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<Broadcast[]> {
    let query = db.select().from(schema.broadcasts);

    if (filters?.status) {
      query = query.where(eq(schema.broadcasts.status, filters.status as any)) as any;
    }

    query = query.orderBy(desc(schema.broadcasts.createdAt)) as any;

    if (filters?.limit) {
      query = query.limit(filters.limit) as any;
    }
    if (filters?.offset) {
      query = query.offset(filters.offset) as any;
    }

    return query;
  }

  async createBroadcast(insertBroadcast: InsertBroadcast): Promise<Broadcast> {
    const [broadcast] = await db.insert(schema.broadcasts).values(insertBroadcast).returning();
    return broadcast;
  }

  async updateBroadcast(
    id: number,
    updateData: Partial<InsertBroadcast>
  ): Promise<Broadcast | undefined> {
    const [broadcast] = await db
      .update(schema.broadcasts)
      .set(updateData)
      .where(eq(schema.broadcasts.id, id))
      .returning();
    return broadcast;
  }

  // ============================================================================
  // BROADCAST LOGS
  // ============================================================================

  async getBroadcastLogs(broadcastId: number): Promise<BroadcastLog[]> {
    return db
      .select()
      .from(schema.broadcastLogs)
      .where(eq(schema.broadcastLogs.broadcastId, broadcastId))
      .orderBy(desc(schema.broadcastLogs.sentAt));
  }

  async createBroadcastLog(insertLog: InsertBroadcastLog): Promise<BroadcastLog> {
    const [log] = await db.insert(schema.broadcastLogs).values(insertLog).returning();
    return log;
  }

  // ============================================================================
  // SETTINGS
  // ============================================================================

  async getSetting(key: string): Promise<Setting | undefined> {
    const [setting] = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, key))
      .limit(1);
    return setting;
  }

  async getSettings(): Promise<Setting[]> {
    return db.select().from(schema.settings).orderBy(schema.settings.key);
  }

  async upsertSetting(insertSetting: InsertSetting): Promise<Setting> {
    const [setting] = await db
      .insert(schema.settings)
      .values(insertSetting)
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: insertSetting.value, updatedAt: new Date() },
      })
      .returning();
    return setting;
  }

  // ============================================================================
  // EVENT LOGS
  // ============================================================================

  async getEventLogs(filters?: {
    eventType?: string;
    userId?: number;
    cashierId?: number;
    limit?: number;
    offset?: number;
  }): Promise<EventLog[]> {
    let query = db.select().from(schema.eventLogs);

    const conditions = [];
    if (filters?.eventType) {
      conditions.push(eq(schema.eventLogs.eventType, filters.eventType as any));
    }
    if (filters?.userId) {
      conditions.push(eq(schema.eventLogs.userId, filters.userId));
    }
    if (filters?.cashierId) {
      conditions.push(eq(schema.eventLogs.cashierId, filters.cashierId));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)!) as any;
    }

    query = query.orderBy(desc(schema.eventLogs.createdAt)) as any;

    if (filters?.limit) {
      query = query.limit(filters.limit) as any;
    }
    if (filters?.offset) {
      query = query.offset(filters.offset) as any;
    }

    return query;
  }

  async createEventLog(insertLog: InsertEventLog): Promise<EventLog> {
    const [log] = await db.insert(schema.eventLogs).values(insertLog).returning();
    return log;
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  async getDashboardStats(): Promise<{
    totalUsers: number;
    activeDiscounts: number;
    totalDiscountsIssued: number;
    subscribedUsers: number;
  }> {
    const [usersCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.users);

    const [activeDiscountsCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.discounts)
      .where(eq(schema.discounts.status, "active"));

    const [totalDiscountsCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.discounts);

    const [subscribedCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.users)
      .where(eq(schema.users.isSubscribed, true));

    return {
      totalUsers: usersCount.count,
      activeDiscounts: activeDiscountsCount.count,
      totalDiscountsIssued: totalDiscountsCount.count,
      subscribedUsers: subscribedCount.count,
    };
  }

  // ============================================================================
  // SPECIALIZED DISCOUNT OPERATIONS
  // ============================================================================

  async generateDiscountCode(): Promise<string> {
    const cyrillicLetters = "АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ";
    
    for (let attempts = 0; attempts < 10; attempts++) {
      let code = "";
      
      // 3 Cyrillic letters
      for (let i = 0; i < 3; i++) {
        code += cyrillicLetters[Math.floor(Math.random() * cyrillicLetters.length)];
      }
      
      // 4 digits
      for (let i = 0; i < 4; i++) {
        code += Math.floor(Math.random() * 10);
      }
      
      // Check if code already exists
      const existing = await this.getDiscountByCode(code);
      if (!existing) {
        return code;
      }
    }
    
    throw new Error("Failed to generate unique discount code after 10 attempts");
  }

  async issueDiscount(
    userId: number,
    templateId: number,
    campaignId?: number
  ): Promise<{ success: boolean; discount?: Discount; error?: string }> {
    try {
      // Get template
      const template = await this.getDiscountTemplate(templateId);
      if (!template) {
        return { success: false, error: "Template not found" };
      }

      if (!template.isActive) {
        return { success: false, error: "Template is not active" };
      }

      // Check if user exists
      const user = await this.getUser(userId);
      if (!user) {
        return { success: false, error: "User not found" };
      }

      // Check usage limits based on template recurrence
      if (template.recurrence) {
        const existingDiscounts = await this.getDiscounts({
          userId,
          limit: 1000,
        });

        const discountsForTemplate = existingDiscounts.filter(
          (d) => d.templateId === templateId
        );

        if (template.recurrence.type === "monthly") {
          // Check if user already got discount this month
          const now = new Date();
          const thisMonth = discountsForTemplate.find((d) => {
            const issuedDate = new Date(d.issuedAt);
            return (
              issuedDate.getMonth() === now.getMonth() &&
              issuedDate.getFullYear() === now.getFullYear()
            );
          });
          if (thisMonth) {
            return { success: false, error: "User already received this discount this month" };
          }
        } else if (template.recurrence.type === "days" && template.recurrence.value) {
          // Check if enough days passed since last discount
          const lastDiscount = discountsForTemplate[0];
          if (lastDiscount) {
            const daysSince = Math.floor(
              (Date.now() - new Date(lastDiscount.issuedAt).getTime()) / (1000 * 60 * 60 * 24)
            );
            if (daysSince < template.recurrence.value) {
              return {
                success: false,
                error: `User can receive this discount again in ${template.recurrence.value - daysSince} days`,
              };
            }
          }
        }
      }

      // Generate unique code
      const code = await this.generateDiscountCode();

      // Calculate expiration date
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + template.durationDays);

      // Create discount
      const discount = await this.createDiscount({
        code,
        userId,
        templateId,
        campaignId,
        value: template.value,
        valueType: template.valueType,
        status: "active",
        expiresAt,
        isTest: user.isTest,
      });

      // Log event
      await this.createEventLog({
        eventType: "discount_issued",
        userId,
        discountId: discount.id,
        metadata: {
          templateId,
          templateName: template.name,
          code: discount.code,
          value: discount.value,
          valueType: discount.valueType,
          expiresAt: discount.expiresAt,
          campaignId,
        },
        message: `Discount ${code} issued to user ${userId} from template ${template.name}`,
      });

      return { success: true, discount };
    } catch (error) {
      console.error("Error issuing discount:", error);
      return { success: false, error: String(error) };
    }
  }

  async redeemDiscount(
    code: string,
    cashierId: number
  ): Promise<{ success: boolean; discount?: Discount; error?: string; user?: User }> {
    try {
      // Validate first
      const validation = await this.validateDiscount(code);
      if (!validation.valid) {
        // Log failed redemption attempt
        await this.createEventLog({
          eventType: "discount_redemption_attempt",
          cashierId,
          metadata: {
            code,
            reason: validation.error,
            success: false,
          },
          message: `Failed redemption attempt for code ${code}: ${validation.error}`,
        });
        return { success: false, error: validation.error };
      }

      const discount = validation.discount!;
      const user = validation.user!;

      // Update discount status
      const updatedDiscount = await this.updateDiscount(discount.id, {
        status: "used",
        usedAt: new Date(),
        usedByCashierId: cashierId,
      });

      if (!updatedDiscount) {
        return { success: false, error: "Failed to update discount" };
      }

      // Log successful redemption
      await this.createEventLog({
        eventType: "discount_redeemed",
        userId: user.id,
        cashierId,
        discountId: discount.id,
        metadata: {
          code,
          value: discount.value,
          valueType: discount.valueType,
          success: true,
        },
        message: `Discount ${code} redeemed by cashier ${cashierId} for user ${user.id}`,
      });

      return { success: true, discount: updatedDiscount, user };
    } catch (error) {
      console.error("Error redeeming discount:", error);
      return { success: false, error: String(error) };
    }
  }

  async validateDiscount(
    code: string
  ): Promise<{ valid: boolean; discount?: Discount; error?: string; user?: User }> {
    try {
      const discount = await this.getDiscountByCode(code);
      if (!discount) {
        return { valid: false, error: "Discount code not found" };
      }

      if (discount.status !== "active") {
        return { valid: false, error: `Discount is ${discount.status}`, discount };
      }

      const now = new Date();
      if (discount.expiresAt < now) {
        // Auto-expire
        await this.updateDiscount(discount.id, { status: "expired" });
        return { valid: false, error: "Discount has expired", discount };
      }

      const user = await this.getUser(discount.userId);
      if (!user) {
        return { valid: false, error: "User not found", discount };
      }

      return { valid: true, discount, user };
    } catch (error) {
      console.error("Error validating discount:", error);
      return { valid: false, error: String(error) };
    }
  }

  async expireDiscounts(): Promise<number> {
    try {
      const now = new Date();
      const result = await db
        .update(schema.discounts)
        .set({ status: "expired" })
        .where(
          and(
            eq(schema.discounts.status, "active"),
            lte(schema.discounts.expiresAt, now)
          )!
        );
      return result.rowCount || 0;
    } catch (error) {
      console.error("Error expiring discounts:", error);
      return 0;
    }
  }

  async getUserActiveDiscounts(userId: number): Promise<Discount[]> {
    return this.getDiscounts({
      userId,
      status: "active",
      limit: 1000,
    });
  }

  // ============================================================================
  // BROADCAST AUDIENCE OPERATIONS
  // ============================================================================

  private buildAudienceQuery(targetAudience: any) {
    let query = db.select().from(schema.users);
    const conditions = [];

    if (targetAudience.all) {
      return query;
    }

    if (targetAudience.subscribed !== undefined) {
      conditions.push(eq(schema.users.isSubscribed, targetAudience.subscribed));
    }

    if (targetAudience.gender) {
      conditions.push(eq(schema.users.gender, targetAudience.gender));
    }

    if (targetAudience.source) {
      conditions.push(eq(schema.users.source, targetAudience.source));
    }

    if (targetAudience.tags && targetAudience.tags.length > 0) {
      conditions.push(
        sql`${schema.users.tags} ?& array[${sql.join(
          targetAudience.tags.map((tag: string) => sql`${tag}`),
          sql`, `
        )}]`
      );
    }

    if (targetAudience.ageFrom || targetAudience.ageTo) {
      const today = new Date();
      if (targetAudience.ageTo) {
        const minBirthdate = new Date(today.getFullYear() - targetAudience.ageTo, today.getMonth(), today.getDate());
        conditions.push(gte(schema.users.birthday, minBirthdate.toISOString().split('T')[0]));
      }
      if (targetAudience.ageFrom) {
        const maxBirthdate = new Date(today.getFullYear() - targetAudience.ageFrom, today.getMonth(), today.getDate());
        conditions.push(lte(schema.users.birthday, maxBirthdate.toISOString().split('T')[0]));
      }
    }

    if (targetAudience.registeredAfter) {
      conditions.push(gte(schema.users.createdAt, new Date(targetAudience.registeredAfter)));
    }

    if (targetAudience.registeredBefore) {
      conditions.push(lte(schema.users.createdAt, new Date(targetAudience.registeredBefore)));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)!) as any;
    }

    return query;
  }

  async calculateBroadcastAudience(targetAudience: any): Promise<number> {
    try {
      const query = this.buildAudienceQuery(targetAudience);
      const users = await query;
      
      // If hasActiveDiscounts filter is set, filter in-memory
      if (targetAudience.hasActiveDiscounts !== undefined) {
        const userIds = users.map((u) => u.id);
        const activeDiscounts = await db
          .select({ userId: schema.discounts.userId })
          .from(schema.discounts)
          .where(
            and(
              inArray(schema.discounts.userId, userIds),
              eq(schema.discounts.status, "active")
            )!
          );
        
        const usersWithDiscounts = new Set(activeDiscounts.map((d) => d.userId));
        
        if (targetAudience.hasActiveDiscounts) {
          return Array.from(usersWithDiscounts).length;
        } else {
          return users.filter((u) => !usersWithDiscounts.has(u.id)).length;
        }
      }
      
      return users.length;
    } catch (error) {
      console.error("Error calculating broadcast audience:", error);
      return 0;
    }
  }

  async getUsersForBroadcast(targetAudience: any): Promise<User[]> {
    try {
      const query = this.buildAudienceQuery(targetAudience);
      const users = await query;
      
      // If hasActiveDiscounts filter is set, filter in-memory
      if (targetAudience.hasActiveDiscounts !== undefined) {
        const userIds = users.map((u) => u.id);
        const activeDiscounts = await db
          .select({ userId: schema.discounts.userId })
          .from(schema.discounts)
          .where(
            and(
              inArray(schema.discounts.userId, userIds),
              eq(schema.discounts.status, "active")
            )!
          );
        
        const usersWithDiscounts = new Set(activeDiscounts.map((d) => d.userId));
        
        if (targetAudience.hasActiveDiscounts) {
          return users.filter((u) => usersWithDiscounts.has(u.id));
        } else {
          return users.filter((u) => !usersWithDiscounts.has(u.id));
        }
      }
      
      return users;
    } catch (error) {
      console.error("Error getting users for broadcast:", error);
      return [];
    }
  }
}

export const storage = new PostgresStorage();
