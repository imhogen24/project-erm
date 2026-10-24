// The website shares the production database and keeps its own history in
// drizzle.__drizzle_migrations. The ERM keeps its history in its own schema, so
// neither app can skip the other's migrations. The schema is not called "erm":
// the local database role is named erm, and a schema with the same name would
// become the default place for new tables.
export const migrationsSchema = "erm_migrations"

export const migrationsTable = "__drizzle_migrations"
