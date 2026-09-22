/**
 * Types matching supabase/migrations/20260923040000_templates_schema.sql.
 * Templates are the app's first fully hand-authored entity: user-written
 * reusable text snippets (title + body), inert — nothing consumes them
 * automatically yet.
 */

export interface Template {
  id: string;
  workspace_id: string;
  title: string;
  body: string;
  created_at: string; // timestamptz → ISO string
  updated_at: string;
}
