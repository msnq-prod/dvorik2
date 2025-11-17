# Мармеладный дворик Admin Panel

## Project Overview
This is a loyalty program admin panel for "Мармеладный дворик" (Marmalade Manor). It provides a comprehensive system for managing customers, discounts, campaigns, and analytics.

**Purpose**: Admin dashboard for managing loyalty programs, customer data, and marketing campaigns  
**Current State**: Fully set up and running in Replit environment with PostgreSQL database

## Technology Stack

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite 5
- **Routing**: Wouter
- **UI Components**: Radix UI + Tailwind CSS
- **State Management**: TanStack Query (React Query)
- **Forms**: React Hook Form with Zod validation
- **Styling**: Tailwind CSS with custom theme system

### Backend
- **Runtime**: Node.js with TypeScript
- **Framework**: Express 4
- **Database**: PostgreSQL (Neon)
- **ORM**: Drizzle ORM
- **Validation**: Zod
- **Session**: Express Session with PostgreSQL store

### Development Tools
- **Language**: TypeScript 5.6
- **Package Manager**: npm
- **Dev Server**: tsx (for TypeScript execution)
- **Build**: Vite (frontend) + esbuild (backend)

## Project Structure

```
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/    # UI components (Radix UI wrappers)
│   │   ├── pages/         # Page components
│   │   ├── hooks/         # Custom React hooks
│   │   └── lib/           # Utilities and query client
│   ├── public/            # Static assets
│   └── index.html         # HTML entry point
├── server/                # Backend Express application
│   ├── index.ts          # Server entry point
│   ├── routes.ts         # API route handlers
│   ├── storage.ts        # Database access layer
│   ├── db.ts             # Database connection
│   └── vite.ts           # Vite dev server integration
├── shared/               # Shared code between client and server
│   └── schema.ts         # Drizzle database schema
└── attached_assets/      # Additional project files
```

## Database Schema

The project uses the following main tables:
- **users**: Customer/user management with Telegram integration
- **admins**: Admin user accounts with role-based access
- **cashiers**: Cashier accounts for in-store operations
- **discount_templates**: Templates for discount creation
- **discounts**: Individual discount codes and their status
- **campaigns**: Marketing campaigns
- **broadcasts**: Message broadcasting to users
- **settings**: Application configuration
- **event_logs**: Audit log for all important events

## Available Scripts

- `npm run dev` - Start development server (both frontend and backend)
- `npm run build` - Build for production
- `npm start` - Run production server
- `npm run db:push` - Sync database schema with Drizzle
- `npm run check` - Type check TypeScript

## Environment Variables

The project uses the following environment variables:
- `DATABASE_URL` - PostgreSQL connection string (automatically provided by Replit)
- `PORT` - Server port (default: 5000)
- `NODE_ENV` - Environment mode (development/production)

## Features

### Current Implementation
1. **Dashboard**: Overview with key metrics and analytics
2. **Users Management**: View and manage customer accounts
3. **Discount Templates**: Create and manage discount templates
4. **Discount Operations** (NEW):
   - Issue discounts from templates with automatic code generation (Cyrillic 3 letters + 4 digits)
   - Validate discount codes for cashiers
   - Redeem discounts with full transaction logging
   - Check active discounts for users
   - Recurrence control (monthly/weekly) to prevent duplicate issuance
5. **Cashiers**: Manage cashier accounts with Telegram ID lookup
6. **Broadcasts**: Send messages to user segments
   - Calculate target audience size before sending
   - Preview audience members
   - Flexible filtering (subscribed, active discounts, tags, etc.)
7. **Campaigns**: Marketing campaign management
8. **Logs**: Event logging and audit trail
9. **Settings**: Application configuration
10. **Theme Support**: Light/dark mode with theme toggle
11. **Telegram Bot API** (NEW): Complete REST API for bot integration

### Planned Features (from specification)
1. Two Telegram bots (main bot for customers, bot for cashiers)
2. Referral program
3. Birthday greetings and reminders automation
4. Background job processing (Bull queue)
5. Analytics dashboard enhancements
6. Admin panel UI for discount management

## Development Notes

### Replit Configuration
- Frontend and backend run on the same port (5000) in development
- Vite dev server is integrated with Express
- HMR (Hot Module Replacement) configured for Replit proxy
- Database migrations handled via Drizzle Kit

### Code Style
- TypeScript strict mode enabled
- ESM modules throughout
- Consistent import/export patterns
- Zod schemas for validation
- Drizzle ORM for type-safe database queries

## Recent Changes
- **2025-11-17**: Discount and Broadcast Management API Implementation
  - **Storage Layer Extensions**:
    - Added `issueDiscount()` with template validation and recurrence checking
    - Added `redeemDiscount()` with atomic transaction handling
    - Added `validateDiscount()` for cashier verification
    - Added `generateDiscountCode()` with collision-resistant Cyrillic code generation
    - Added `expireDiscounts()` for automated expiration
    - Added `calculateBroadcastAudience()` with flexible filtering
    - Added `getUsersForBroadcast()` for audience preview
    - Added Telegram ID lookup methods for users and cashiers
  - **API Endpoints**:
    - Discount operations: issue, redeem, validate, expire
    - User/cashier lookup by Telegram ID
    - Broadcast audience calculation and preview
    - Complete CRUD for all entities
  - **Documentation**:
    - Created comprehensive Telegram Bot API documentation (docs/telegram-bot-api.md)
    - Documented all workflows for bot developers
    - Added example requests and responses
  - **Testing**: All endpoints tested and validated with edge cases

- **2024-11-17**: Initial Replit setup
  - Moved project from subdirectory to root
  - Configured Vite for Replit proxy (host: 0.0.0.0, HMR clientPort: 443)
  - Created .gitignore for Node.js project
  - Set up PostgreSQL database
  - Configured development workflow on port 5000
  - Configured deployment settings (autoscale)

## User Preferences
None recorded yet.

## Next Steps (from specification document)
The attached specification document (in Russian) outlines a comprehensive development plan including:
- Stage A: Environment normalization and documentation
- Stage B: Data model expansion (additional tables and relationships)
- Stage C: Data layer implementation (storage.ts functions)
- Stage D: Telegram bot integration
- Stage E: Admin panel UI enhancements
- Stage F: Background jobs and automation
- Stage G: Analytics and reporting

## API Documentation

### Telegram Bot Integration
Complete REST API documentation is available in `docs/telegram-bot-api.md`. This includes:
- User and cashier management endpoints
- Discount operations (issue, validate, redeem)
- Broadcast audience calculation
- Common workflow examples for bot developers
- Error handling and validation schemas

### Key API Endpoints
- `GET /api/users/telegram/:telegramId` - Get user by Telegram ID
- `GET /api/cashiers/telegram/:telegramId` - Get cashier by Telegram ID
- `POST /api/discounts/issue` - Issue discount from template
- `POST /api/discounts/validate` - Validate discount code
- `POST /api/discounts/redeem` - Redeem discount code
- `GET /api/discounts/user/:userId/active` - Get user's active discounts
- `POST /api/broadcasts/calculate-audience` - Calculate broadcast audience size

## Support
For issues or questions, refer to:
- Design guidelines: `design_guidelines.md`
- Specification document: `attached_assets/Pasted-1-dvorikfinal--1763399150715_1763399150716.txt`
- Telegram Bot API: `docs/telegram-bot-api.md`
