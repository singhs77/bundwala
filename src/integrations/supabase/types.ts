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
      activity_audit: {
        Row: {
          action: string
          created_at: string
          id: string
          member_id: string | null
          payload: Json | null
          row_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          member_id?: string | null
          payload?: Json | null
          row_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          member_id?: string | null
          payload?: Json | null
          row_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      admin_settings: {
        Row: {
          id: number
          password_hash: string | null
        }
        Insert: {
          id?: number
          password_hash?: string | null
        }
        Update: {
          id?: number
          password_hash?: string | null
        }
        Relationships: []
      }
      announcements: {
        Row: {
          body: string
          created_at: string
          id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      baseline_scores: {
        Row: {
          deep_work: number
          gym: number
          macros: number
          member_id: string
          sleep: number
          updated_at: string
        }
        Insert: {
          deep_work?: number
          gym?: number
          macros?: number
          member_id: string
          sleep?: number
          updated_at?: string
        }
        Update: {
          deep_work?: number
          gym?: number
          macros?: number
          member_id?: string
          sleep?: number
          updated_at?: string
        }
        Relationships: []
      }
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
      deep_work_bonuses: {
        Row: {
          created_at: string
          date: string
          id: string
          member_id: string
          points: number
          reason: string | null
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          member_id: string
          points?: number
          reason?: string | null
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          member_id?: string
          points?: number
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deep_work_bonuses_member_id_fkey"
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
          water: string | null
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
          water?: string | null
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
          water?: string | null
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
      member_credentials: {
        Row: {
          member_id: string
          password_hash: string
          updated_at: string
        }
        Insert: {
          member_id: string
          password_hash: string
          updated_at?: string
        }
        Update: {
          member_id?: string
          password_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_credentials_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_sessions: {
        Row: {
          created_at: string
          expires_at: string
          member_id: string
          token: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          member_id: string
          token?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          member_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_sessions_member_id_fkey"
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
          calorie_goal: number | null
          created_at: string
          has_password: boolean
          id: string
          is_demo: boolean
          name: string
          team_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          calorie_goal?: number | null
          created_at?: string
          has_password?: boolean
          id?: string
          is_demo?: boolean
          name: string
          team_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          calorie_goal?: number | null
          created_at?: string
          has_password?: boolean
          id?: string
          is_demo?: boolean
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
      monthly_snapshots: {
        Row: {
          deep_work: number
          gym: number
          macros: number
          member_id: string
          month: string
          sleep: number
          updated_at: string
        }
        Insert: {
          deep_work?: number
          gym?: number
          macros?: number
          member_id: string
          month: string
          sleep?: number
          updated_at?: string
        }
        Update: {
          deep_work?: number
          gym?: number
          macros?: number
          member_id?: string
          month?: string
          sleep?: number
          updated_at?: string
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          id: number
          last_sent_date: string | null
          reminder_body: string
          reminder_time: string
          reminder_title: string
          updated_at: string
        }
        Insert: {
          id?: number
          last_sent_date?: string | null
          reminder_body?: string
          reminder_time?: string
          reminder_title?: string
          updated_at?: string
        }
        Update: {
          id?: number
          last_sent_date?: string | null
          reminder_body?: string
          reminder_time?: string
          reminder_title?: string
          updated_at?: string
        }
        Relationships: []
      }
      password_reset_requests: {
        Row: {
          id: string
          member_id: string
          requested_at: string
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          id?: string
          member_id: string
          requested_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          id?: string
          member_id?: string
          requested_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "password_reset_requests_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "password_reset_requests_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          enabled: boolean
          endpoint: string
          id: string
          last_reminder_date: string | null
          member_id: string
          p256dh: string
          reminder_local_time: string | null
          tz_offset_minutes: number
        }
        Insert: {
          auth: string
          created_at?: string
          enabled?: boolean
          endpoint: string
          id?: string
          last_reminder_date?: string | null
          member_id: string
          p256dh: string
          reminder_local_time?: string | null
          tz_offset_minutes?: number
        }
        Update: {
          auth?: string
          created_at?: string
          enabled?: boolean
          endpoint?: string
          id?: string
          last_reminder_date?: string | null
          member_id?: string
          p256dh?: string
          reminder_local_time?: string | null
          tz_offset_minutes?: number
        }
        Relationships: []
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
      _member_from_token: { Args: { _token: string }; Returns: string }
      add_dw_comment: {
        Args: { _body: string; _deep_work_id: string; _token: string }
        Returns: undefined
      }
      admin_add_free_day: {
        Args: { _date: string; _label: string; _password: string }
        Returns: undefined
      }
      admin_clear_member_password: {
        Args: { _member_id: string; _password: string }
        Returns: undefined
      }
      admin_delete_announcement: {
        Args: { _id: string; _password: string }
        Returns: undefined
      }
      admin_list_password_resets: {
        Args: { _password: string }
        Returns: {
          id: string
          member_id: string
          member_name: string
          requested_at: string
        }[]
      }
      admin_list_subscriptions: {
        Args: { _password: string }
        Returns: {
          auth: string
          endpoint: string
          id: string
          member_id: string
          p256dh: string
        }[]
      }
      admin_post_announcement: {
        Args: { _body: string; _password: string }
        Returns: string
      }
      admin_remove_free_day: {
        Args: { _date: string; _password: string }
        Returns: undefined
      }
      admin_set_password: {
        Args: { _current: string; _new: string }
        Returns: boolean
      }
      admin_update_notification_settings: {
        Args: {
          _body: string
          _password: string
          _time: string
          _title: string
        }
        Returns: undefined
      }
      admin_upsert_rule: {
        Args: {
          _cap: number
          _category: string
          _password: string
          _points: number
        }
        Returns: undefined
      }
      admin_verify: { Args: { _password: string }; Returns: boolean }
      delete_deep_work: {
        Args: { _id: string; _token: string }
        Returns: undefined
      }
      delete_push_subscription: {
        Args: { _endpoint: string; _token: string }
        Returns: undefined
      }
      delete_push_subscription_by_endpoint: {
        Args: { _endpoint: string }
        Returns: undefined
      }
      delete_sleep: {
        Args: { _date: string; _token: string }
        Returns: undefined
      }
      demo_login: {
        Args: never
        Returns: {
          member_id: string
          token: string
        }[]
      }
      get_notification_settings: {
        Args: never
        Returns: {
          reminder_body: string
          reminder_time: string
          reminder_title: string
        }[]
      }
      list_due_reminders: {
        Args: never
        Returns: {
          auth: string
          body: string
          endpoint: string
          id: string
          p256dh: string
          title: string
        }[]
      }
      log_deep_work: {
        Args: {
          _date: string
          _learnings: string
          _minutes: number
          _personal_notes: string
          _token: string
          _topic: string
        }
        Returns: string
      }
      log_gym: {
        Args: { _date: string; _status: string; _token: string }
        Returns: undefined
      }
      log_macros: {
        Args: {
          _calories: number
          _carbs: number
          _date: string
          _fat: number
          _protein: number
          _sugar: number
          _token: string
          _water: string
        }
        Returns: undefined
      }
      log_sleep: {
        Args: {
          _date: string
          _hours: number
          _sleep_time: string
          _token: string
          _wake_time: string
        }
        Returns: undefined
      }
      mark_global_reminder_sent: { Args: never; Returns: undefined }
      mark_reminder_sent: { Args: { _id: string }; Returns: undefined }
      member_logout: { Args: { _token: string }; Returns: undefined }
      member_rename: {
        Args: { _new_name: string; _token: string }
        Returns: undefined
      }
      member_set_avatar: {
        Args: { _token: string; _url: string }
        Returns: undefined
      }
      member_set_calorie_goal: {
        Args: { _goal: number; _token: string }
        Returns: undefined
      }
      member_set_password: {
        Args: {
          _current_password: string
          _member_id: string
          _new_password: string
        }
        Returns: string
      }
      member_set_team: {
        Args: { _team_id: string; _token: string }
        Returns: undefined
      }
      member_verify_password: {
        Args: { _member_id: string; _password: string }
        Returns: string
      }
      request_password_reset: {
        Args: { _member_id: string }
        Returns: undefined
      }
      reset_demo_data: { Args: never; Returns: undefined }
      touch_session: { Args: { _token: string }; Returns: undefined }
      trigger_demo_reset: { Args: never; Returns: undefined }
      update_push_reminder: {
        Args: {
          _enabled: boolean
          _endpoint: string
          _reminder_local_time: string
          _token: string
          _tz_offset_minutes: number
        }
        Returns: undefined
      }
      upsert_push_subscription: {
        Args: {
          _auth: string
          _enabled: boolean
          _endpoint: string
          _p256dh: string
          _reminder_local_time: string
          _token: string
          _tz_offset_minutes: number
        }
        Returns: undefined
      }
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
