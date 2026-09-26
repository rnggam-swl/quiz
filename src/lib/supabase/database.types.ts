// Hand-written in the `supabase gen types typescript` format to match
// supabase/migrations/20260926000000_content.sql, because generation needs a
// running database. Once Supabase runs locally, regenerate with `pnpm db:types`.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string;
          id: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name: string;
          id: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string;
          id?: string;
        };
        Relationships: [];
      };
      questions: {
        Row: {
          config: Json;
          created_at: string;
          explanation: string;
          help: string;
          id: string;
          media: Json;
          points: number;
          position: number;
          prompt: string;
          quiz_id: string;
          tags: string[];
          time_limit_s: number | null;
          type: string;
          updated_at: string;
        };
        Insert: {
          config: Json;
          created_at?: string;
          explanation?: string;
          help?: string;
          id: string;
          media?: Json;
          points?: number;
          position: number;
          prompt?: string;
          quiz_id: string;
          tags?: string[];
          time_limit_s?: number | null;
          type: string;
          updated_at?: string;
        };
        Update: {
          config?: Json;
          created_at?: string;
          explanation?: string;
          help?: string;
          id?: string;
          media?: Json;
          points?: number;
          position?: number;
          prompt?: string;
          quiz_id?: string;
          tags?: string[];
          time_limit_s?: number | null;
          type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "questions_quiz_id_fkey";
            columns: ["quiz_id"];
            isOneToOne: false;
            referencedRelation: "quizzes";
            referencedColumns: ["id"];
          },
        ];
      };
      quiz_versions: {
        Row: {
          id: string;
          published_at: string;
          quiz_id: string;
          snapshot: Json;
          version: number;
        };
        Insert: {
          id?: string;
          published_at?: string;
          quiz_id: string;
          snapshot: Json;
          version: number;
        };
        Update: {
          id?: string;
          published_at?: string;
          quiz_id?: string;
          snapshot?: Json;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "quiz_versions_quiz_id_fkey";
            columns: ["quiz_id"];
            isOneToOne: false;
            referencedRelation: "quizzes";
            referencedColumns: ["id"];
          },
        ];
      };
      quizzes: {
        Row: {
          cover_url: string | null;
          created_at: string;
          description: string;
          draft_revision: number;
          embed_allowed_origins: string[];
          id: string;
          latest_version: number | null;
          owner_id: string;
          published_revision: number | null;
          slug: string | null;
          theme: Json;
          title: string;
          updated_at: string;
          visibility: Database["public"]["Enums"]["quiz_visibility"];
        };
        Insert: {
          cover_url?: string | null;
          created_at?: string;
          description?: string;
          draft_revision?: number;
          embed_allowed_origins?: string[];
          id?: string;
          latest_version?: number | null;
          owner_id?: string;
          published_revision?: number | null;
          slug?: string | null;
          theme?: Json;
          title?: string;
          updated_at?: string;
          visibility?: Database["public"]["Enums"]["quiz_visibility"];
        };
        Update: {
          cover_url?: string | null;
          created_at?: string;
          description?: string;
          draft_revision?: number;
          embed_allowed_origins?: string[];
          id?: string;
          latest_version?: number | null;
          owner_id?: string;
          published_revision?: number | null;
          slug?: string | null;
          theme?: Json;
          title?: string;
          updated_at?: string;
          visibility?: Database["public"]["Enums"]["quiz_visibility"];
        };
        Relationships: [
          {
            foreignKeyName: "quizzes_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      owns_quiz: {
        Args: { p_quiz_id: string };
        Returns: boolean;
      };
      publish_quiz: {
        Args: { p_base_revision: number; p_quiz_id: string; p_slug: string };
        Returns: { slug: string; version: number }[];
      };
      save_quiz_draft: {
        Args: { p_base_revision: number; p_questions: Json; p_quiz: Json; p_quiz_id: string };
        Returns: number;
      };
    };
    Enums: {
      quiz_visibility: "private" | "unlisted" | "public";
    };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];
