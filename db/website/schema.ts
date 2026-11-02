import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"

// The website's intake tables, as they are in production. The website owns
// them and their migrations, so these definitions are only for reading: they
// are not in `db/schema`, the ERM's migrations never create them, and no ERM
// code writes to them. The columns follow the website's `src/lib/db/schema.ts`
// in imhogen24/imho-heavy-covert. Each file entry is a plain link.

const tracking = {
  requestId: text("request_id").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  adminNotifiedAt: timestamp("admin_notified_at", { withTimezone: true }),
  confirmationSentAt: timestamp("confirmation_sent_at", { withTimezone: true }),
  notifyAttempts: integer("notify_attempts").notNull(),
}

// Tier 1
export const customEngineeringSubmissions = pgTable(
  "custom_engineering_submissions",
  {
    customEngineeringId: text("custom_engineering_id").primaryKey(),
    organizationName: text("organization_name").notNull(),
    contactPerson: text("contact_person").notNull(),
    email: text().notNull(),
    phoneNumber: text("phone_number").notNull(),
    siteLocation: text("site_location").notNull(),
    projectScope: jsonb("project_scope").$type<string[]>().notNull(),
    projectTitle: text("project_title").notNull(),
    primaryObjective: text("primary_objective").notNull(),
    materialInputs: text("material_inputs").notNull(),
    energyAndInformationInputs: text("energy_and_information_inputs").notNull(),
    transformation: text().notNull(),
    outputs: text().notNull(),
    byProducts: text("by_products"),
    humanSystem: text("human_system"),
    activeEnvironment: text("active_environment"),
    budgetExpectations: text("budget_expectations"),
    targetTimeline: text("target_timeline"),
    fileAttachments: jsonb("file_attachments").$type<string[]>().notNull(),
    termsAcceptedAt: timestamp("terms_accepted_at", {
      withTimezone: true,
    }).notNull(),
    ...tracking,
  }
)

// Tier 3. The file column is singular here.
export const draftingDigitizationSubmissions = pgTable(
  "drafting_digitization_submissions",
  {
    draftingDigitizationId: text("drafting_digitization_id").primaryKey(),
    organizationName: text("organization_name").notNull(),
    contactPerson: text("contact_person").notNull(),
    email: text().notNull(),
    phoneNumber: text("phone_number").notNull(),
    siteLocation: text("site_location").notNull(),
    inputMaterialType: text("input_material_type").notNull(),
    assetCondition: text("asset_condition").notNull(),
    draftingServices: jsonb("drafting_services").$type<string[]>().notNull(),
    endGoal: text("end_goal").notNull(),
    draftingStandard: text("drafting_standard").notNull(),
    outputFormats: jsonb("output_formats").$type<string[]>().notNull(),
    fileAttachment: jsonb("file_attachment").$type<string[]>().notNull(),
    termsAcceptedAt: timestamp("terms_accepted_at", {
      withTimezone: true,
    }).notNull(),
    ...tracking,
  }
)

export const websiteTables = [
  customEngineeringSubmissions,
  draftingDigitizationSubmissions,
] as const
