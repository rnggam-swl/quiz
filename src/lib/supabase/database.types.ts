export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      attempts: {
        Row: {
          attempt_no: number
          deadline: string | null
          id: string
          max_score: number | null
          max_streak: number | null
          participant_id: string
          question_ids: string[]
          quiz_version_id: string
          score: number | null
          seed: number
          session_id: string
          started_at: string
          status: Database["public"]["Enums"]["attempt_status"]
          submitted_at: string | null
          xp: number | null
        }
        Insert: {
          attempt_no: number
          deadline?: string | null
          id?: string
          max_score?: number | null
          max_streak?: number | null
          participant_id: string
          question_ids: string[]
          quiz_version_id: string
          score?: number | null
          seed: number
          session_id: string
          started_at?: string
          status?: Database["public"]["Enums"]["attempt_status"]
          submitted_at?: string | null
          xp?: number | null
        }
        Update: {
          attempt_no?: number
          deadline?: string | null
          id?: string
          max_score?: number | null
          max_streak?: number | null
          participant_id?: string
          question_ids?: string[]
          quiz_version_id?: string
          score?: number | null
          seed?: number
          session_id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["attempt_status"]
          submitted_at?: string | null
          xp?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "attempts_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempts_quiz_version_id_fkey"
            columns: ["quiz_version_id"]
            isOneToOne: false
            referencedRelation: "quiz_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      battle_answers: {
        Row: {
          answer: Json
          correct: boolean
          id: string
          participant_id: string
          points: number
          reaction_ms: number | null
          received_at: string
          round_id: string
          shadow: boolean
        }
        Insert: {
          answer: Json
          correct: boolean
          id?: string
          participant_id: string
          points?: number
          reaction_ms?: number | null
          received_at?: string
          round_id: string
          shadow: boolean
        }
        Update: {
          answer?: Json
          correct?: boolean
          id?: string
          participant_id?: string
          points?: number
          reaction_ms?: number | null
          received_at?: string
          round_id?: string
          shadow?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "battle_answers_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "battle_answers_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "battle_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      battle_rounds: {
        Row: {
          closes_at: string | null
          id: string
          idx: number
          locked_at: string | null
          opened_at: string | null
          question_id: string
          session_id: string
          status: Database["public"]["Enums"]["round_status"]
          time_limit_ms: number
        }
        Insert: {
          closes_at?: string | null
          id?: string
          idx: number
          locked_at?: string | null
          opened_at?: string | null
          question_id: string
          session_id: string
          status?: Database["public"]["Enums"]["round_status"]
          time_limit_ms: number
        }
        Update: {
          closes_at?: string | null
          id?: string
          idx?: number
          locked_at?: string | null
          opened_at?: string | null
          question_id?: string
          session_id?: string
          status?: Database["public"]["Enums"]["round_status"]
          time_limit_ms?: number
        }
        Relationships: [
          {
            foreignKeyName: "battle_rounds_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      integrity_events: {
        Row: {
          at: string
          attempt_id: string
          id: number
          kind: string
          meta: Json
        }
        Insert: {
          at?: string
          attempt_id: string
          id?: never
          kind: string
          meta?: Json
        }
        Update: {
          at?: string
          attempt_id?: string
          id?: never
          kind?: string
          meta?: Json
        }
        Relationships: [
          {
            foreignKeyName: "integrity_events_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      participants: {
        Row: {
          eliminated_round: number | null
          external_id: string | null
          id: string
          is_spectator: boolean
          joined_at: string
          kicked_at: string | null
          last_seen_at: string | null
          lives: number | null
          nickname: string
          roster_id: string | null
          score: number
          session_id: string
          shadow_score: number
          streak: number
          user_id: string | null
        }
        Insert: {
          eliminated_round: number | null
          external_id?: string | null
          id?: string
          is_spectator?: boolean
          joined_at?: string
          kicked_at?: string | null
          last_seen_at?: string | null
          lives: number | null
          nickname: string
          roster_id?: string | null
          score?: number
          session_id: string
          shadow_score: number
          streak?: number
          user_id?: string | null
        }
        Update: {
          eliminated_round?: number | null
          external_id?: string | null
          id?: string
          is_spectator?: boolean
          joined_at?: string
          kicked_at?: string | null
          last_seen_at?: string | null
          lives?: number | null
          nickname?: string
          roster_id?: string | null
          score?: number
          session_id?: string
          shadow_score?: number
          streak?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "participants_roster_id_fkey"
            columns: ["roster_id"]
            isOneToOne: false
            referencedRelation: "session_roster"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
        }
        Relationships: []
      }
      questions: {
        Row: {
          config: Json
          created_at: string
          explanation: string
          help: string
          id: string
          media: Json
          points: number
          position: number
          prompt: string
          quiz_id: string
          tags: string[]
          time_limit_s: number | null
          type: string
          updated_at: string
        }
        Insert: {
          config: Json
          created_at?: string
          explanation?: string
          help?: string
          id: string
          media?: Json
          points?: number
          position: number
          prompt?: string
          quiz_id: string
          tags?: string[]
          time_limit_s?: number | null
          type: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          explanation?: string
          help?: string
          id?: string
          media?: Json
          points?: number
          position?: number
          prompt?: string
          quiz_id?: string
          tags?: string[]
          time_limit_s?: number | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_embed_secrets: {
        Row: {
          created_at: string
          quiz_id: string
          secret: string
        }
        Insert: {
          created_at?: string
          quiz_id: string
          secret: string
        }
        Update: {
          created_at?: string
          quiz_id?: string
          secret?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_embed_secrets_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: true
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_versions: {
        Row: {
          id: string
          published_at: string
          quiz_id: string
          snapshot: Json
          version: number
        }
        Insert: {
          id?: string
          published_at?: string
          quiz_id: string
          snapshot: Json
          version: number
        }
        Update: {
          id?: string
          published_at?: string
          quiz_id?: string
          snapshot?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "quiz_versions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quizzes: {
        Row: {
          cover_url: string | null
          created_at: string
          description: string
          draft_revision: number
          embed_allowed_origins: string[]
          id: string
          latest_version: number | null
          owner_id: string
          published_revision: number | null
          slug: string | null
          theme: Json
          title: string
          updated_at: string
          visibility: Database["public"]["Enums"]["quiz_visibility"]
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          description?: string
          draft_revision?: number
          embed_allowed_origins?: string[]
          id?: string
          latest_version?: number | null
          owner_id?: string
          published_revision?: number | null
          slug?: string | null
          theme?: Json
          title?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["quiz_visibility"]
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          description?: string
          draft_revision?: number
          embed_allowed_origins?: string[]
          id?: string
          latest_version?: number | null
          owner_id?: string
          published_revision?: number | null
          slug?: string | null
          theme?: Json
          title?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["quiz_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "quizzes_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      responses: {
        Row: {
          answer: Json
          answered_at: string
          attempt_id: string
          correct: number | null
          feedback: string | null
          graded_at: string | null
          graded_by: string | null
          id: string
          points: number
          question_id: string
          rubric_scores: Json | null
          time_ms: number | null
          total: number | null
        }
        Insert: {
          answer: Json
          answered_at?: string
          attempt_id: string
          correct?: number | null
          feedback?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          points?: number
          question_id: string
          rubric_scores?: Json | null
          time_ms?: number | null
          total?: number | null
        }
        Update: {
          answer?: Json
          answered_at?: string
          attempt_id?: string
          correct?: number | null
          feedback?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          points?: number
          question_id?: string
          rubric_scores?: Json | null
          time_ms?: number | null
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "responses_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "responses_graded_by_fkey"
            columns: ["graded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      round_winners: {
        Row: {
          participant_id: string
          round_id: string
          won_at: string
        }
        Insert: {
          participant_id: string
          round_id: string
          won_at?: string
        }
        Update: {
          participant_id?: string
          round_id?: string
          won_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "round_winners_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_winners_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: true
            referencedRelation: "battle_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      session_roster: {
        Row: {
          created_at: string
          extra_time_pct: number
          id: string
          identifier: string
          name: string
          session_id: string
        }
        Insert: {
          created_at?: string
          extra_time_pct?: number
          id?: string
          identifier: string
          name: string
          session_id: string
        }
        Update: {
          created_at?: string
          extra_time_pct?: number
          id?: string
          identifier?: string
          name?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_roster_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          auto_advance: boolean
          closes_at: string | null
          code: string | null
          created_at: string
          current_round: number | null
          host_id: string
          id: string
          is_default: boolean
          lobby_locked: boolean
          mode: Database["public"]["Enums"]["session_mode"]
          opens_at: string | null
          paused_at: string | null
          paused_remaining_ms: number | null
          phase: Database["public"]["Enums"]["live_phase"] | null
          phase_closes_at: string | null
          phase_opened_at: string | null
          policy: Json
          question_ids: string[] | null
          quiz_id: string
          quiz_version_id: string | null
          results_released_at: string | null
          seed: number | null
          state_version: number
          status: Database["public"]["Enums"]["session_status"]
          title: string | null
          updated_at: string
        }
        Insert: {
          auto_advance?: boolean
          closes_at?: string | null
          code?: string | null
          created_at?: string
          current_round?: number | null
          host_id?: string
          id?: string
          is_default?: boolean
          lobby_locked?: boolean
          mode: Database["public"]["Enums"]["session_mode"]
          opens_at?: string | null
          paused_at?: string | null
          paused_remaining_ms?: number | null
          phase?: Database["public"]["Enums"]["live_phase"] | null
          phase_closes_at?: string | null
          phase_opened_at?: string | null
          policy?: Json
          question_ids?: string[] | null
          quiz_id: string
          quiz_version_id?: string | null
          results_released_at?: string | null
          seed?: number | null
          state_version?: number
          status?: Database["public"]["Enums"]["session_status"]
          title?: string | null
          updated_at?: string
        }
        Update: {
          auto_advance?: boolean
          closes_at?: string | null
          code?: string | null
          created_at?: string
          current_round?: number | null
          host_id?: string
          id?: string
          is_default?: boolean
          lobby_locked?: boolean
          mode?: Database["public"]["Enums"]["session_mode"]
          opens_at?: string | null
          paused_at?: string | null
          paused_remaining_ms?: number | null
          phase?: Database["public"]["Enums"]["live_phase"] | null
          phase_closes_at?: string | null
          phase_opened_at?: string | null
          policy?: Json
          question_ids?: string[] | null
          quiz_id?: string
          quiz_version_id?: string | null
          results_released_at?: string | null
          seed?: number | null
          state_version?: number
          status?: Database["public"]["Enums"]["session_status"]
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_quiz_version_id_fkey"
            columns: ["quiz_version_id"]
            isOneToOne: false
            referencedRelation: "quiz_versions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      advance_live: {
        Args: { p_action: string; p_session_id: string; p_version: number }
        Returns: {
          auto_advance: boolean
          closes_at: string | null
          code: string | null
          created_at: string
          current_round: number | null
          host_id: string
          id: string
          is_default: boolean
          lobby_locked: boolean
          mode: Database["public"]["Enums"]["session_mode"]
          opens_at: string | null
          paused_at: string | null
          paused_remaining_ms: number | null
          phase: Database["public"]["Enums"]["live_phase"] | null
          phase_closes_at: string | null
          phase_opened_at: string | null
          policy: Json
          question_ids: string[] | null
          quiz_id: string
          quiz_version_id: string | null
          results_released_at: string | null
          seed: number | null
          state_version: number
          status: Database["public"]["Enums"]["session_status"]
          title: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      end_exam: {
        Args: { p_session_id: string }
        Returns: {
          auto_advance: boolean
          closes_at: string | null
          code: string | null
          created_at: string
          current_round: number | null
          host_id: string
          id: string
          is_default: boolean
          lobby_locked: boolean
          mode: Database["public"]["Enums"]["session_mode"]
          opens_at: string | null
          paused_at: string | null
          paused_remaining_ms: number | null
          phase: Database["public"]["Enums"]["live_phase"] | null
          phase_closes_at: string | null
          phase_opened_at: string | null
          policy: Json
          question_ids: string[] | null
          quiz_id: string
          quiz_version_id: string | null
          results_released_at: string | null
          seed: number | null
          state_version: number
          status: Database["public"]["Enums"]["session_status"]
          title: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ensure_practice_session: {
        Args: { p_policy?: Json; p_quiz_id: string }
        Returns: {
          auto_advance: boolean
          closes_at: string | null
          code: string | null
          created_at: string
          current_round: number | null
          host_id: string
          id: string
          is_default: boolean
          lobby_locked: boolean
          mode: Database["public"]["Enums"]["session_mode"]
          opens_at: string | null
          paused_at: string | null
          paused_remaining_ms: number | null
          phase: Database["public"]["Enums"]["live_phase"] | null
          phase_closes_at: string | null
          phase_opened_at: string | null
          policy: Json
          question_ids: string[] | null
          quiz_id: string
          quiz_version_id: string | null
          results_released_at: string | null
          seed: number | null
          state_version: number
          status: Database["public"]["Enums"]["session_status"]
          title: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      expire_attempts: { Args: never; Returns: number }
      extend_attempt: {
        Args: { p_attempt_id: string; p_minutes: number }
        Returns: {
          attempt_no: number
          deadline: string | null
          id: string
          max_score: number | null
          max_streak: number | null
          participant_id: string
          question_ids: string[]
          quiz_version_id: string
          score: number | null
          seed: number
          session_id: string
          started_at: string
          status: Database["public"]["Enums"]["attempt_status"]
          submitted_at: string | null
          xp: number | null
        }
        SetofOptions: {
          from: "*"
          to: "attempts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      generate_session_code: { Args: never; Returns: string }
      grade_response: {
        Args: {
          p_feedback?: string
          p_ratio: number
          p_response_id: string
          p_rubric?: Json
        }
        Returns: {
          answer: Json
          answered_at: string
          attempt_id: string
          correct: number | null
          feedback: string | null
          graded_at: string | null
          graded_by: string | null
          id: string
          points: number
          question_id: string
          rubric_scores: Json | null
          time_ms: number | null
          total: number | null
        }
        SetofOptions: {
          from: "*"
          to: "responses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      host_owns_attempt: { Args: { p_attempt_id: string }; Returns: boolean }
      join_exam: {
        Args: {
          p_identifier?: string
          p_nickname: string
          p_session_id: string
          p_user_id?: string
        }
        Returns: {
          eliminated_round: number | null
          external_id: string | null
          id: string
          is_spectator: boolean
          joined_at: string
          kicked_at: string | null
          last_seen_at: string | null
          lives: number | null
          nickname: string
          roster_id: string | null
          score: number
          session_id: string
          shadow_score: number
          streak: number
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "participants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      join_live: {
        Args: { p_nickname: string; p_session_id: string }
        Returns: {
          eliminated_round: number | null
          external_id: string | null
          id: string
          is_spectator: boolean
          joined_at: string
          kicked_at: string | null
          last_seen_at: string | null
          lives: number | null
          nickname: string
          roster_id: string | null
          score: number
          session_id: string
          shadow_score: number
          streak: number
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "participants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      join_session: {
        Args: {
          p_external_id?: string
          p_nickname: string
          p_session_id: string
        }
        Returns: {
          eliminated_round: number | null
          external_id: string | null
          id: string
          is_spectator: boolean
          joined_at: string
          kicked_at: string | null
          last_seen_at: string | null
          lives: number | null
          nickname: string
          roster_id: string | null
          score: number
          session_id: string
          shadow_score: number
          streak: number
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "participants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      kick_participant: {
        Args: { p_participant_id: string; p_session_id: string }
        Returns: undefined
      }
      live_finish: { Args: { p_session_id: string }; Returns: undefined }
      live_state: {
        Args: { p_participant_id?: string; p_session_id: string }
        Returns: Json
      }
      live_time_limit_ms: {
        Args: {
          p_question_id: string
          p_session: Database["public"]["Tables"]["sessions"]["Row"]
        }
        Returns: number
      }
      log_integrity_events: {
        Args: { p_attempt_id: string; p_events: Json }
        Returns: number
      }
      owns_quiz: { Args: { p_quiz_id: string }; Returns: boolean }
      owns_session: { Args: { p_session_id: string }; Returns: boolean }
      publish_quiz: {
        Args: { p_base_revision: number; p_quiz_id: string; p_slug: string }
        Returns: {
          slug: string
          version: number
        }[]
      }
      record_battle_answer: {
        Args: {
          p_answer: Json
          p_correct: boolean
          p_participant_id: string
          p_penalty?: number
          p_points: number
          p_question_id: string
        }
        Returns: Json
      }
      record_live_answer: {
        Args: {
          p_answer: Json
          p_base_points: number
          p_correct: number
          p_participant_id: string
          p_question_id: string
          p_total: number
        }
        Returns: Json
      }
      record_royale_answer: {
        Args: {
          p_answer: Json
          p_base_points: number
          p_correct: number
          p_participant_id: string
          p_question_id: string
          p_total: number
        }
        Returns: Json
      }
      record_response: {
        Args: {
          p_allow_change: boolean
          p_answer: Json
          p_attempt_id: string
          p_correct: number
          p_points: number
          p_question_id: string
          p_time_ms: number
          p_total: number
        }
        Returns: {
          answer: Json
          answered_at: string
          attempt_id: string
          correct: number | null
          feedback: string | null
          graded_at: string | null
          graded_by: string | null
          id: string
          points: number
          question_id: string
          rubric_scores: Json | null
          time_ms: number | null
          total: number | null
        }
        SetofOptions: {
          from: "*"
          to: "responses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reopen_attempt: {
        Args: { p_attempt_id: string; p_minutes: number }
        Returns: {
          attempt_no: number
          deadline: string | null
          id: string
          max_score: number | null
          max_streak: number | null
          participant_id: string
          question_ids: string[]
          quiz_version_id: string
          score: number | null
          seed: number
          session_id: string
          started_at: string
          status: Database["public"]["Enums"]["attempt_status"]
          submitted_at: string | null
          xp: number | null
        }
        SetofOptions: {
          from: "*"
          to: "attempts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reset_attempt: { Args: { p_attempt_id: string }; Returns: undefined }
      royale_standings: {
        Args: { p_session_id: string }
        Returns: {
          alive: boolean
          avg_ms: number
          eliminated_round: number
          lives: number
          nickname: string
          participant_id: string
          rank: number
          score: number
          shadow_score: number
          watcher: boolean
        }[]
      }
      save_quiz_draft: {
        Args: {
          p_base_revision: number
          p_questions: Json
          p_quiz: Json
          p_quiz_id: string
        }
        Returns: number
      }
      start_attempt: {
        Args: {
          p_duration_s?: number
          p_max_attempts: number
          p_max_score?: number
          p_participant_id: string
          p_question_ids: string[]
          p_quiz_version_id: string
          p_seed: number
        }
        Returns: {
          attempt_no: number
          deadline: string | null
          id: string
          max_score: number | null
          max_streak: number | null
          participant_id: string
          question_ids: string[]
          quiz_version_id: string
          score: number | null
          seed: number
          session_id: string
          started_at: string
          status: Database["public"]["Enums"]["attempt_status"]
          submitted_at: string | null
          xp: number | null
        }
        SetofOptions: {
          from: "*"
          to: "attempts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_attempt: {
        Args: {
          p_attempt_id: string
          p_max_score: number
          p_max_streak: number
          p_xp: number
        }
        Returns: {
          attempt_no: number
          deadline: string | null
          id: string
          max_score: number | null
          max_streak: number | null
          participant_id: string
          question_ids: string[]
          quiz_version_id: string
          score: number | null
          seed: number
          session_id: string
          started_at: string
          status: Database["public"]["Enums"]["attempt_status"]
          submitted_at: string | null
          xp: number | null
        }
        SetofOptions: {
          from: "*"
          to: "attempts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_live_settings: {
        Args: {
          p_auto_advance?: boolean
          p_lobby_locked?: boolean
          p_session_id: string
        }
        Returns: {
          auto_advance: boolean
          closes_at: string | null
          code: string | null
          created_at: string
          current_round: number | null
          host_id: string
          id: string
          is_default: boolean
          lobby_locked: boolean
          mode: Database["public"]["Enums"]["session_mode"]
          opens_at: string | null
          paused_at: string | null
          paused_remaining_ms: number | null
          phase: Database["public"]["Enums"]["live_phase"] | null
          phase_closes_at: string | null
          phase_opened_at: string | null
          policy: Json
          question_ids: string[] | null
          quiz_id: string
          quiz_version_id: string | null
          results_released_at: string | null
          seed: number | null
          state_version: number
          status: Database["public"]["Enums"]["session_status"]
          title: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      attempt_status: "in_progress" | "submitted" | "expired"
      live_phase:
        | "lobby"
        | "countdown"
        | "open"
        | "reveal"
        | "leaderboard"
        | "podium"
        | "ended"
      quiz_visibility: "private" | "unlisted" | "public"
      round_status:
        | "pending"
        | "countdown"
        | "open"
        | "resolving"
        | "locked"
        | "revealed"
      session_mode:
        | "practice"
        | "exam"
        | "live"
        | "battle_buzzer"
        | "battle_royale"
      session_status:
        | "draft"
        | "scheduled"
        | "lobby"
        | "running"
        | "paused"
        | "ended"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      attempt_status: ["in_progress", "submitted", "expired"],
      live_phase: [
        "lobby",
        "countdown",
        "open",
        "reveal",
        "leaderboard",
        "podium",
        "ended",
      ],
      quiz_visibility: ["private", "unlisted", "public"],
      round_status: [
        "pending",
        "countdown",
        "open",
        "resolving",
        "locked",
        "revealed",
      ],
      session_mode: [
        "practice",
        "exam",
        "live",
        "battle_buzzer",
        "battle_royale",
      ],
      session_status: [
        "draft",
        "scheduled",
        "lobby",
        "running",
        "paused",
        "ended",
      ],
    },
  },
} as const
