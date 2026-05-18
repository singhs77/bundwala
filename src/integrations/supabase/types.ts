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
      deep_work: {
        Row: {
          created_at: string
          date: string
          finished_at: string | null
          id: string
          learnings: string | null
          member_id: string
          minutes: number | null
          personal_notes: string | null
          started_at: string | null
          topic: string | null
        }
        Insert: {
          created_at?: string
          date: string
          finished_at?: string | null
          id?: string
          learnings?: string | null
          member_id: string
          minutes?: number | null
          personal_notes?: string | null
          started_at?: string | null
          topic?: string | null
        }
        Update: {
          created_at?: string
          date?: string
          finished_at?: string | null
          id?: string
          learnings?: string | null
          member_id?: string
          minutes?: number | null
          personal_notes?: string | null
          started_at?: string | null
          topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deep_work_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      dw_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          deep_work_id: string
          id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          deep_work_id: string
          id?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          deep_work_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dw_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dw_comments_deep_work_id_fkey"
            columns: ["deep_work_id"]
            isOneToOne: false
            referencedRelation: "deep_work"
            referencedColumns: ["id"]
          },
        ]
      }
      free_days: {
        Row: {
          date: string
          label: string | null
        }
        Insert: {
          date: string
          label?: string | null
        }
        Update: {
          date?: string
          label?: string | null
        }
        Relationships: []
      }
      gym_logs: {
        Row: {
          created_at: string
          date: string
          id: string
          member_id: string
          status: Database["public"]["Enums"]["gym_status"]
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          member_id: string
          status: Database["public"]["Enums"]["gym_status"]
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          member_id?: string
          status?: Database["public"]["Enums"]["gym_status"]
        }
        Relationships: [
          {
            foreignKeyName: "gym_logs_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      macros_logs: {
        Row: {
          calories: number | null
          carbs: number | null
          created_at: string
          date: string
          fat: number | null
          id: string
          member_id: string
          protein: number | null
          sugar: number | null
          water: number | null
        }
        Insert: {
          calories?: number | null
          carbs?: number | null
          created_at?: string
          date: string
          fat?: number | null
          id?: string
          member_id: string
          protein?: number | null
          sugar?: number | null
          water?: number | null
        }
        Update: {
          calories?: number | null
          carbs?: number | null
          created_at?: string
          date?: string
          fat?: number | null
          id?: string
          member_id?: string
          protein?: number | null
          sugar?: number | null
          water?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "macros_logs_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          name: string
          team_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          name: string
          team_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          name?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      scoring_rules: {
        Row: {
          category: string
          points_per_entry: number
          weekly_cap: number
        }
        Insert: {
          category: string
          points_per_entry?: number
          weekly_cap?: number
        }
        Update: {
          category?: string
          points_per_entry?: number
          weekly_cap?: number
        }
        Relationships: []
      }
      sleep_logs: {
        Row: {
          created_at: string
          date: string
          free_day: boolean
          hours: number | null
          id: string
          member_id: string
          sleep_time: string | null
          wake_time: string | null
        }
        Insert: {
          created_at?: string
          date: string
          free_day?: boolean
          hours?: number | null
          id?: string
          member_id: string
          sleep_time?: string | null
          wake_time?: string | null
        }
        Update: {
          created_at?: string
          date?: string
          free_day?: boolean
          hours?: number | null
          id?: string
          member_id?: string
          sleep_time?: string | null
          wake_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sleep_logs_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      sleep_targets: {
        Row: {
          member_id: string
          target_sleep: string | null
          target_wake: string | null
        }
        Insert: {
          member_id: string
          target_sleep?: string | null
          target_wake?: string | null
        }
        Update: {
          member_id?: string
          target_sleep?: string | null
          target_wake?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sleep_targets_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          color: string
          created_at: string
          id: string
          logo_url: string | null
          name: string
          sort_order: number
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          sort_order?: number
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      gym_status: "yes" | "no" | "home"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      gym_status: ["yes", "no", "home"],
    },
  },
} as const
