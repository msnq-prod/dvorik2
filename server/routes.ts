import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  insertUserSchema,
  updateUserSchema,
  insertAdminSchema,
  updateAdminSchema,
  insertCashierSchema,
  updateCashierSchema,
  insertDiscountTemplateSchema,
  updateDiscountTemplateSchema,
  insertDiscountSchema,
  updateDiscountSchema,
  insertCampaignSchema,
  updateCampaignSchema,
  insertBroadcastSchema,
  updateBroadcastSchema,
  insertSettingSchema,
  insertEventLogSchema,
  targetAudienceSchema,
} from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // ============================================================================
  // DASHBOARD
  // ============================================================================

  app.get("/api/dashboard/stats", async (req: Request, res: Response) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
  });

  // ============================================================================
  // USERS
  // ============================================================================

  app.get("/api/users", async (req: Request, res: Response) => {
    try {
      const {
        status,
        isSubscribed,
        source,
        search,
        limit = "50",
        offset = "0",
      } = req.query;

      const users = await storage.getUsers({
        status: status as string,
        isSubscribed: isSubscribed === "true" ? true : isSubscribed === "false" ? false : undefined,
        source: source as string,
        search: search as string,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
      });

      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.get("/api/users/stats", async (req: Request, res: Response) => {
    try {
      const count = await storage.getUsersCount();
      res.json({ total: count });
    } catch (error) {
      console.error("Error fetching user stats:", error);
      res.status(500).json({ error: "Failed to fetch user stats" });
    }
  });

  app.get("/api/users/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const user = await storage.getUser(id);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  app.get("/api/users/telegram/:telegramId", async (req: Request, res: Response) => {
    try {
      const telegramId = parseInt(req.params.telegramId, 10);
      const user = await storage.getUserByTelegramId(telegramId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json(user);
    } catch (error) {
      console.error("Error fetching user by telegram ID:", error);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  app.post("/api/users", async (req: Request, res: Response) => {
    try {
      const data = insertUserSchema.parse(req.body);
      const user = await storage.createUser(data);
      res.status(201).json(user);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating user:", error);
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  app.put("/api/users/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const data = updateUserSchema.parse(req.body);
      const user = await storage.updateUser(id, data);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json(user);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating user:", error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // ============================================================================
  // ADMINS
  // ============================================================================

  app.get("/api/admins", async (req: Request, res: Response) => {
    try {
      const admins = await storage.getAdmins();
      res.json(admins);
    } catch (error) {
      console.error("Error fetching admins:", error);
      res.status(500).json({ error: "Failed to fetch admins" });
    }
  });

  app.post("/api/admins", async (req: Request, res: Response) => {
    try {
      const data = insertAdminSchema.parse(req.body);
      const admin = await storage.createAdmin(data);
      res.status(201).json(admin);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating admin:", error);
      res.status(500).json({ error: "Failed to create admin" });
    }
  });

  app.put("/api/admins/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const data = updateAdminSchema.parse(req.body);
      const admin = await storage.updateAdmin(id, data);
      
      if (!admin) {
        return res.status(404).json({ error: "Admin not found" });
      }
      
      res.json(admin);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating admin:", error);
      res.status(500).json({ error: "Failed to update admin" });
    }
  });

  // ============================================================================
  // CASHIERS
  // ============================================================================

  app.get("/api/cashiers", async (req: Request, res: Response) => {
    try {
      const { isActive } = req.query;
      const cashiers = await storage.getCashiers({
        isActive: isActive === "true" ? true : isActive === "false" ? false : undefined,
      });
      res.json(cashiers);
    } catch (error) {
      console.error("Error fetching cashiers:", error);
      res.status(500).json({ error: "Failed to fetch cashiers" });
    }
  });

  app.get("/api/cashiers/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const cashier = await storage.getCashier(id);
      
      if (!cashier) {
        return res.status(404).json({ error: "Cashier not found" });
      }
      
      res.json(cashier);
    } catch (error) {
      console.error("Error fetching cashier:", error);
      res.status(500).json({ error: "Failed to fetch cashier" });
    }
  });

  app.get("/api/cashiers/telegram/:telegramId", async (req: Request, res: Response) => {
    try {
      const telegramId = parseInt(req.params.telegramId, 10);
      const cashier = await storage.getCashierByTelegramId(telegramId);
      
      if (!cashier) {
        return res.status(404).json({ error: "Cashier not found" });
      }
      
      res.json(cashier);
    } catch (error) {
      console.error("Error fetching cashier by telegram ID:", error);
      res.status(500).json({ error: "Failed to fetch cashier" });
    }
  });

  app.post("/api/cashiers", async (req: Request, res: Response) => {
    try {
      const data = insertCashierSchema.parse(req.body);
      const cashier = await storage.createCashier(data);
      res.status(201).json(cashier);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating cashier:", error);
      res.status(500).json({ error: "Failed to create cashier" });
    }
  });

  app.put("/api/cashiers/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const data = updateCashierSchema.parse(req.body);
      const cashier = await storage.updateCashier(id, data);
      
      if (!cashier) {
        return res.status(404).json({ error: "Cashier not found" });
      }
      
      res.json(cashier);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating cashier:", error);
      res.status(500).json({ error: "Failed to update cashier" });
    }
  });

  // ============================================================================
  // DISCOUNT TEMPLATES
  // ============================================================================

  app.get("/api/discount-templates", async (req: Request, res: Response) => {
    try {
      const { event, isActive } = req.query;
      const templates = await storage.getDiscountTemplates({
        event: event as string,
        isActive: isActive === "true" ? true : isActive === "false" ? false : undefined,
      });
      res.json(templates);
    } catch (error) {
      console.error("Error fetching discount templates:", error);
      res.status(500).json({ error: "Failed to fetch discount templates" });
    }
  });

  app.get("/api/discount-templates/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const template = await storage.getDiscountTemplate(id);
      
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      res.json(template);
    } catch (error) {
      console.error("Error fetching discount template:", error);
      res.status(500).json({ error: "Failed to fetch discount template" });
    }
  });

  app.post("/api/discount-templates", async (req: Request, res: Response) => {
    try {
      const data = insertDiscountTemplateSchema.parse(req.body);
      const template = await storage.createDiscountTemplate(data);
      res.status(201).json(template);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating discount template:", error);
      res.status(500).json({ error: "Failed to create discount template" });
    }
  });

  app.put("/api/discount-templates/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const data = updateDiscountTemplateSchema.parse(req.body);
      const template = await storage.updateDiscountTemplate(id, data);
      
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      res.json(template);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating discount template:", error);
      res.status(500).json({ error: "Failed to update discount template" });
    }
  });

  app.delete("/api/discount-templates/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const success = await storage.deleteDiscountTemplate(id);
      
      if (!success) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting discount template:", error);
      res.status(500).json({ error: "Failed to delete discount template" });
    }
  });

  // ============================================================================
  // DISCOUNTS
  // ============================================================================

  app.get("/api/discounts", async (req: Request, res: Response) => {
    try {
      const {
        userId,
        status,
        campaignId,
        limit = "50",
        offset = "0",
      } = req.query;

      const discounts = await storage.getDiscounts({
        userId: userId ? parseInt(userId as string, 10) : undefined,
        status: status as string,
        campaignId: campaignId ? parseInt(campaignId as string, 10) : undefined,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
      });

      res.json(discounts);
    } catch (error) {
      console.error("Error fetching discounts:", error);
      res.status(500).json({ error: "Failed to fetch discounts" });
    }
  });

  app.get("/api/discounts/code/:code", async (req: Request, res: Response) => {
    try {
      const { code } = req.params;
      const discount = await storage.getDiscountByCode(code);
      
      if (!discount) {
        return res.status(404).json({ error: "Discount not found" });
      }
      
      res.json(discount);
    } catch (error) {
      console.error("Error fetching discount:", error);
      res.status(500).json({ error: "Failed to fetch discount" });
    }
  });

  app.post("/api/discounts", async (req: Request, res: Response) => {
    try {
      const data = insertDiscountSchema.parse(req.body);
      const discount = await storage.createDiscount(data);
      res.status(201).json(discount);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating discount:", error);
      res.status(500).json({ error: "Failed to create discount" });
    }
  });

  app.put("/api/discounts/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const data = updateDiscountSchema.parse(req.body);
      const discount = await storage.updateDiscount(id, data);
      
      if (!discount) {
        return res.status(404).json({ error: "Discount not found" });
      }
      
      res.json(discount);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating discount:", error);
      res.status(500).json({ error: "Failed to update discount" });
    }
  });

  // Specialized discount operations
  app.post("/api/discounts/issue", async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        userId: z.number(),
        templateId: z.number(),
        campaignId: z.number().optional(),
      });
      const data = schema.parse(req.body);
      const result = await storage.issueDiscount(data.userId, data.templateId, data.campaignId);
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      
      res.status(201).json(result.discount);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error issuing discount:", error);
      res.status(500).json({ error: "Failed to issue discount" });
    }
  });

  app.post("/api/discounts/redeem", async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        code: z.string(),
        cashierId: z.number(),
      });
      const data = schema.parse(req.body);
      const result = await storage.redeemDiscount(data.code, data.cashierId);
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      
      res.json({
        success: true,
        discount: result.discount,
        user: result.user,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error redeeming discount:", error);
      res.status(500).json({ error: "Failed to redeem discount" });
    }
  });

  app.post("/api/discounts/validate", async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        code: z.string(),
      });
      const data = schema.parse(req.body);
      const result = await storage.validateDiscount(data.code);
      
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error validating discount:", error);
      res.status(500).json({ error: "Failed to validate discount" });
    }
  });

  app.get("/api/discounts/user/:userId/active", async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId, 10);
      const discounts = await storage.getUserActiveDiscounts(userId);
      res.json(discounts);
    } catch (error) {
      console.error("Error fetching user active discounts:", error);
      res.status(500).json({ error: "Failed to fetch user active discounts" });
    }
  });

  app.post("/api/discounts/expire", async (req: Request, res: Response) => {
    try {
      const count = await storage.expireDiscounts();
      res.json({ count });
    } catch (error) {
      console.error("Error expiring discounts:", error);
      res.status(500).json({ error: "Failed to expire discounts" });
    }
  });

  // ============================================================================
  // CAMPAIGNS
  // ============================================================================

  app.get("/api/campaigns", async (req: Request, res: Response) => {
    try {
      const { isActive } = req.query;
      const campaigns = await storage.getCampaigns({
        isActive: isActive === "true" ? true : isActive === "false" ? false : undefined,
      });
      res.json(campaigns);
    } catch (error) {
      console.error("Error fetching campaigns:", error);
      res.status(500).json({ error: "Failed to fetch campaigns" });
    }
  });

  app.get("/api/campaigns/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const campaign = await storage.getCampaign(id);
      
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      res.json(campaign);
    } catch (error) {
      console.error("Error fetching campaign:", error);
      res.status(500).json({ error: "Failed to fetch campaign" });
    }
  });

  app.post("/api/campaigns", async (req: Request, res: Response) => {
    try {
      const data = insertCampaignSchema.parse(req.body);
      const campaign = await storage.createCampaign(data);
      res.status(201).json(campaign);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating campaign:", error);
      res.status(500).json({ error: "Failed to create campaign" });
    }
  });

  app.put("/api/campaigns/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const data = updateCampaignSchema.parse(req.body);
      const campaign = await storage.updateCampaign(id, data);
      
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      res.json(campaign);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating campaign:", error);
      res.status(500).json({ error: "Failed to update campaign" });
    }
  });

  app.delete("/api/campaigns/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const success = await storage.deleteCampaign(id);
      
      if (!success) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting campaign:", error);
      res.status(500).json({ error: "Failed to delete campaign" });
    }
  });

  // ============================================================================
  // BROADCASTS
  // ============================================================================

  app.get("/api/broadcasts", async (req: Request, res: Response) => {
    try {
      const {
        status,
        limit = "50",
        offset = "0",
      } = req.query;

      const broadcasts = await storage.getBroadcasts({
        status: status as string,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
      });

      res.json(broadcasts);
    } catch (error) {
      console.error("Error fetching broadcasts:", error);
      res.status(500).json({ error: "Failed to fetch broadcasts" });
    }
  });

  app.get("/api/broadcasts/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const broadcast = await storage.getBroadcast(id);
      
      if (!broadcast) {
        return res.status(404).json({ error: "Broadcast not found" });
      }
      
      res.json(broadcast);
    } catch (error) {
      console.error("Error fetching broadcast:", error);
      res.status(500).json({ error: "Failed to fetch broadcast" });
    }
  });

  app.post("/api/broadcasts", async (req: Request, res: Response) => {
    try {
      const data = insertBroadcastSchema.parse(req.body);
      const broadcast = await storage.createBroadcast(data);
      res.status(201).json(broadcast);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating broadcast:", error);
      res.status(500).json({ error: "Failed to create broadcast" });
    }
  });

  app.put("/api/broadcasts/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const data = updateBroadcastSchema.parse(req.body);
      const broadcast = await storage.updateBroadcast(id, data);
      
      if (!broadcast) {
        return res.status(404).json({ error: "Broadcast not found" });
      }
      
      res.json(broadcast);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating broadcast:", error);
      res.status(500).json({ error: "Failed to update broadcast" });
    }
  });

  app.get("/api/broadcasts/:id/logs", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const logs = await storage.getBroadcastLogs(id);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching broadcast logs:", error);
      res.status(500).json({ error: "Failed to fetch broadcast logs" });
    }
  });

  // Specialized broadcast operations
  app.post("/api/broadcasts/calculate-audience", async (req: Request, res: Response) => {
    try {
      const { targetAudience } = req.body;
      const validatedAudience = targetAudienceSchema.parse(targetAudience);
      const count = await storage.calculateBroadcastAudience(validatedAudience);
      res.json({ count });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error calculating broadcast audience:", error);
      res.status(500).json({ error: "Failed to calculate broadcast audience" });
    }
  });

  app.post("/api/broadcasts/:id/preview-audience", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const broadcast = await storage.getBroadcast(id);
      
      if (!broadcast) {
        return res.status(404).json({ error: "Broadcast not found" });
      }
      
      const users = await storage.getUsersForBroadcast(broadcast.targetAudience);
      res.json({ users, count: users.length });
    } catch (error) {
      console.error("Error previewing broadcast audience:", error);
      res.status(500).json({ error: "Failed to preview broadcast audience" });
    }
  });

  // ============================================================================
  // SETTINGS
  // ============================================================================

  app.get("/api/settings", async (req: Request, res: Response) => {
    try {
      const settings = await storage.getSettings();
      res.json(settings);
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.get("/api/settings/:key", async (req: Request, res: Response) => {
    try {
      const { key } = req.params;
      const setting = await storage.getSetting(key);
      
      if (!setting) {
        return res.status(404).json({ error: "Setting not found" });
      }
      
      res.json(setting);
    } catch (error) {
      console.error("Error fetching setting:", error);
      res.status(500).json({ error: "Failed to fetch setting" });
    }
  });

  app.put("/api/settings/:key", async (req: Request, res: Response) => {
    try {
      const { key } = req.params;
      const data = insertSettingSchema.extend({ key: z.string() }).parse({
        key,
        ...req.body,
      });
      const setting = await storage.upsertSetting(data);
      res.json(setting);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error upserting setting:", error);
      res.status(500).json({ error: "Failed to upsert setting" });
    }
  });

  // ============================================================================
  // EVENT LOGS
  // ============================================================================

  app.get("/api/event-logs", async (req: Request, res: Response) => {
    try {
      const {
        eventType,
        userId,
        cashierId,
        limit = "100",
        offset = "0",
      } = req.query;

      const logs = await storage.getEventLogs({
        eventType: eventType as string,
        userId: userId ? parseInt(userId as string, 10) : undefined,
        cashierId: cashierId ? parseInt(cashierId as string, 10) : undefined,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
      });

      res.json(logs);
    } catch (error) {
      console.error("Error fetching event logs:", error);
      res.status(500).json({ error: "Failed to fetch event logs" });
    }
  });

  app.post("/api/event-logs", async (req: Request, res: Response) => {
    try {
      const data = insertEventLogSchema.parse(req.body);
      const log = await storage.createEventLog(data);
      res.status(201).json(log);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating event log:", error);
      res.status(500).json({ error: "Failed to create event log" });
    }
  });

  // ============================================================================
  // TELEGRAM BOT WEBHOOKS (Placeholder for Task 3)
  // ============================================================================

  app.post("/api/bot/main/webhook", async (req: Request, res: Response) => {
    try {
      // TODO: Implement Telegram bot webhook handler for client bot
      console.log("Received webhook from main bot:", req.body);
      res.status(200).send("OK");
    } catch (error) {
      console.error("Error processing main bot webhook:", error);
      res.status(500).json({ error: "Failed to process webhook" });
    }
  });

  app.post("/api/bot/cashier/webhook", async (req: Request, res: Response) => {
    try {
      // TODO: Implement Telegram bot webhook handler for cashier bot
      console.log("Received webhook from cashier bot:", req.body);
      res.status(200).send("OK");
    } catch (error) {
      console.error("Error processing cashier bot webhook:", error);
      res.status(500).json({ error: "Failed to process webhook" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
