// The web form request as the sheet shows it: groups of labelled values, so a
// person reads it as a table. A value that was not filled in is empty.
export type RequestRow = { label: string; value: string }

export type RequestGroup = { title: string; rows: RequestRow[] }

export type RequestSheet = {
  track: "Tier_1" | "Tier_3"
  requestId: string
  groups: RequestGroup[]
}

// One column of the website's row, shown under a label. A list of choices
// reads as one line.
type Field = { column: string; label: string }

const contact: Field[] = [
  { column: "organization_name", label: "Organisation" },
  { column: "contact_person", label: "Contact person" },
  { column: "email", label: "Email" },
  { column: "phone_number", label: "Phone" },
  { column: "site_location", label: "Site location" },
]

// When the request came in, from the saved copy.
export const submissionFields: Field[] = [
  { column: "created_at", label: "Received" },
  { column: "terms_accepted_at", label: "Terms accepted" },
]

// What each track's web form asks, grouped by what the answers are about.
export const requestLayouts: Record<
  RequestSheet["track"],
  { title: string; fields: Field[] }[]
> = {
  Tier_1: [
    { title: "Contact", fields: contact },
    {
      title: "Project",
      fields: [
        { column: "project_scope", label: "Scope" },
        { column: "project_title", label: "Title" },
        { column: "primary_objective", label: "Primary objective" },
        { column: "budget_expectations", label: "Budget" },
        { column: "target_timeline", label: "Timeline" },
      ],
    },
    {
      title: "Systems",
      fields: [
        { column: "material_inputs", label: "Material inputs" },
        {
          column: "energy_and_information_inputs",
          label: "Energy and information inputs",
        },
        { column: "transformation", label: "Transformation" },
        { column: "outputs", label: "Outputs" },
        { column: "by_products", label: "By-products" },
        { column: "human_system", label: "Human system" },
        { column: "active_environment", label: "Active environment" },
      ],
    },
  ],
  Tier_3: [
    { title: "Contact", fields: contact },
    {
      title: "Source asset",
      fields: [
        { column: "input_material_type", label: "Input material type" },
        { column: "asset_condition", label: "Condition" },
      ],
    },
    {
      title: "Drafting",
      fields: [
        { column: "drafting_services", label: "Services" },
        { column: "end_goal", label: "End goal" },
        { column: "drafting_standard", label: "Standard" },
        { column: "output_formats", label: "Output formats" },
      ],
    },
  ],
}
