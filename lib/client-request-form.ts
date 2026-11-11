import { z } from "zod"

// The client's web form on the ERM: the same questions, options and rules as
// the IMHOGEN website (imho-heavy-covert, src/lib/schemas/custom-engineering
// and drafting-digitization), so a request reads the same whichever way it
// came in. Answers are saved under the website's column names. Files are not
// asked here: the ERM has no file upload, and the website's are optional.

export type Tier = "Tier_1" | "Tier_3"

export const scopeOptions = ["Product Design", "Process / Factory Design"]

export const inputMaterialOptions = [
  "Physical Part / Machine",
  "Legacy 2D Drawings/PDFs",
  "Hand Sketches / Concepts",
  "Existing 3D Models",
]

export const draftingServiceOptions = [
  "3D Solid Modeling (STEP/IGES)",
  "2D Manufacturing Drawings (GD&T)",
  "General Arrangement / Assembly",
  "Exploded Views for Manuals",
  "Automated BOM Extraction",
]

export const draftingStandardOptions = ["ISO", "ASME", "No Preference"]

export const outputFormatOptions = ["PDF", "DWG", "DXF", "STEP", "Native CAD"]

function text(min: number, max: number, message: string) {
  return z
    .string({ error: message })
    .trim()
    .min(min, { error: message })
    .max(max, { error: `Keep it under ${max} characters` })
}

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Keep it under ${max} characters` })
    .optional()

function choices(options: string[], message: string) {
  return z
    .array(z.string(), { error: message })
    .min(1, { error: message })
    .refine((picked) => picked.every((one) => options.includes(one)), {
      error: "Choose from the list",
    })
}

const contact = {
  organization_name: text(2, 200, "Enter the organisation's name"),
  contact_person: text(2, 150, "Enter the contact person and their title"),
  email: z.email({ error: "Enter an email address" }),
  phone_number: text(7, 20, "Enter a phone number"),
  site_location: text(
    5,
    500,
    "Enter the physical address or project site, at least 5 characters"
  ),
}

export const tier1Schema = z.object({
  ...contact,
  project_scope: choices(scopeOptions, "Choose at least one scale of support"),
  project_title: text(2, 200, "Enter a project title"),
  primary_objective: text(
    10,
    2000,
    "Share at least 10 characters on the objective or problem to solve"
  ),
  material_inputs: text(5, 2000, "Describe the material inputs"),
  energy_and_information_inputs: text(
    5,
    2000,
    "Describe the energy and information inputs"
  ),
  transformation: text(
    10,
    2000,
    "Describe what must happen to the raw material"
  ),
  outputs: text(5, 2000, "Describe the final product and target throughput"),
  by_products: optional(2000),
  human_system: optional(1000),
  active_environment: optional(1000),
  budget_expectations: optional(500),
  target_timeline: optional(500),
})

export const tier3Schema = z.object({
  ...contact,
  input_material_type: z
    .string({ error: "Choose the primary input type" })
    .refine((value) => inputMaterialOptions.includes(value), {
      error: "Choose the primary input type",
    }),
  asset_condition: text(
    10,
    2000,
    "Describe the asset's condition in at least 10 characters"
  ),
  drafting_services: choices(
    draftingServiceOptions,
    "Choose at least one drafting service"
  ),
  end_goal: text(3, 500, "Describe the end goal or main use"),
  drafting_standard: z
    .string({ error: "Choose a drafting standard" })
    .refine((value) => draftingStandardOptions.includes(value), {
      error: "Choose a drafting standard",
    }),
  output_formats: choices(
    outputFormatOptions,
    "Choose at least one output format"
  ),
})

export const schemaFor = { Tier_1: tier1Schema, Tier_3: tier3Schema }

export type ClientAnswers = Record<string, string | string[]>

// How each question is asked, section by section, as on the website.
export type Question = {
  column: string
  label: string
  kind: "text" | "longText" | "email" | "pick" | "choose"
  options?: string[]
  hint?: string
  optional?: boolean
}

const contactQuestions: Question[] = [
  { column: "organization_name", label: "Organisation", kind: "text" },
  {
    column: "contact_person",
    label: "Contact person and title",
    kind: "text",
  },
  { column: "email", label: "Email", kind: "email" },
  { column: "phone_number", label: "Phone", kind: "text" },
  { column: "site_location", label: "Project site", kind: "longText" },
]

export const questionsFor: Record<
  Tier,
  { title: string; questions: Question[] }[]
> = {
  Tier_1: [
    { title: "Client information", questions: contactQuestions },
    {
      title: "Project scope",
      questions: [
        {
          column: "project_scope",
          label: "Scale of support",
          kind: "choose",
          options: scopeOptions,
        },
        { column: "project_title", label: "Project title", kind: "text" },
        {
          column: "primary_objective",
          label: "Primary objective or problem to solve",
          kind: "longText",
        },
      ],
    },
    {
      title: "Systems engineering core",
      questions: [
        {
          column: "material_inputs",
          label: "Material inputs",
          kind: "longText",
        },
        {
          column: "energy_and_information_inputs",
          label: "Energy and information inputs",
          kind: "longText",
        },
        {
          column: "transformation",
          label: "Transformation",
          kind: "longText",
        },
        { column: "outputs", label: "Outputs", kind: "longText" },
        {
          column: "by_products",
          label: "By-products",
          kind: "longText",
          optional: true,
        },
      ],
    },
    {
      title: "Operating environment and constraints",
      questions: [
        {
          column: "human_system",
          label: "Human system",
          kind: "longText",
          optional: true,
        },
        {
          column: "active_environment",
          label: "Active environment",
          kind: "longText",
          optional: true,
        },
        {
          column: "budget_expectations",
          label: "Budget",
          kind: "text",
          optional: true,
        },
        {
          column: "target_timeline",
          label: "Timeline",
          kind: "text",
          optional: true,
        },
      ],
    },
  ],
  Tier_3: [
    { title: "Client information", questions: contactQuestions },
    {
      title: "The source asset",
      questions: [
        {
          column: "input_material_type",
          label: "Input material type",
          kind: "pick",
          options: inputMaterialOptions,
        },
        {
          column: "asset_condition",
          label: "Asset condition or description",
          kind: "longText",
        },
      ],
    },
    {
      title: "Deliverables and end goal",
      questions: [
        {
          column: "drafting_services",
          label: "Drafting services",
          kind: "choose",
          options: draftingServiceOptions,
        },
        { column: "end_goal", label: "End goal", kind: "longText" },
      ],
    },
    {
      title: "Technical preferences",
      questions: [
        {
          column: "drafting_standard",
          label: "Drafting standard",
          kind: "pick",
          options: draftingStandardOptions,
        },
        {
          column: "output_formats",
          label: "Output formats",
          kind: "choose",
          options: outputFormatOptions,
        },
      ],
    },
  ],
}
