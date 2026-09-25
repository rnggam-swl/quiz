// Placeholder until the first migration lands (P1-01).
// Regenerate with `pnpm db:types` — do not edit by hand.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: { [_ in never]: never };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
