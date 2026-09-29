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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      commitments: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          delivery_evidence_path: string | null
          delivery_note: string | null
          delivery_reported_at: string | null
          id: string
          need_id: string
          note: string | null
          quantity: number
          status: Database["public"]["Enums"]["commitment_status"]
          supporter_id: string
          updated_at: string
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          delivery_evidence_path?: string | null
          delivery_note?: string | null
          delivery_reported_at?: string | null
          id?: string
          need_id: string
          note?: string | null
          quantity: number
          status?: Database["public"]["Enums"]["commitment_status"]
          supporter_id: string
          updated_at?: string
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          delivery_evidence_path?: string | null
          delivery_note?: string | null
          delivery_reported_at?: string | null
          id?: string
          need_id?: string
          note?: string | null
          quantity?: number
          status?: Database["public"]["Enums"]["commitment_status"]
          supporter_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commitments_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitments_need_id_fkey"
            columns: ["need_id"]
            isOneToOne: false
            referencedRelation: "need_progress"
            referencedColumns: ["need_id"]
          },
          {
            foreignKeyName: "commitments_need_id_fkey"
            columns: ["need_id"]
            isOneToOne: false
            referencedRelation: "needs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitments_supporter_id_fkey"
            columns: ["supporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hedera_events: {
        Row: {
          actor_role: Database["public"]["Enums"]["user_role"]
          attempts: number
          commitment_id: string | null
          consensus_timestamp: string | null
          created_at: string
          event_type: Database["public"]["Enums"]["hedera_event_type"]
          id: string
          need_id: string
          payload: Json
          payload_canonical: string
          payload_hash: string
          school_id: string
          sequence_number: number | null
          submission_error: string | null
          submission_status: Database["public"]["Enums"]["hedera_submission_status"]
          submitted_at: string | null
          topic_id: string | null
          transaction_id: string | null
        }
        Insert: {
          actor_role: Database["public"]["Enums"]["user_role"]
          attempts?: number
          commitment_id?: string | null
          consensus_timestamp?: string | null
          created_at?: string
          event_type: Database["public"]["Enums"]["hedera_event_type"]
          id?: string
          need_id: string
          payload: Json
          payload_canonical: string
          payload_hash: string
          school_id: string
          sequence_number?: number | null
          submission_error?: string | null
          submission_status?: Database["public"]["Enums"]["hedera_submission_status"]
          submitted_at?: string | null
          topic_id?: string | null
          transaction_id?: string | null
        }
        Update: {
          actor_role?: Database["public"]["Enums"]["user_role"]
          attempts?: number
          commitment_id?: string | null
          consensus_timestamp?: string | null
          created_at?: string
          event_type?: Database["public"]["Enums"]["hedera_event_type"]
          id?: string
          need_id?: string
          payload?: Json
          payload_canonical?: string
          payload_hash?: string
          school_id?: string
          sequence_number?: number | null
          submission_error?: string | null
          submission_status?: Database["public"]["Enums"]["hedera_submission_status"]
          submitted_at?: string | null
          topic_id?: string | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hedera_events_commitment_id_fkey"
            columns: ["commitment_id"]
            isOneToOne: false
            referencedRelation: "commitments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hedera_events_need_id_fkey"
            columns: ["need_id"]
            isOneToOne: false
            referencedRelation: "need_progress"
            referencedColumns: ["need_id"]
          },
          {
            foreignKeyName: "hedera_events_need_id_fkey"
            columns: ["need_id"]
            isOneToOne: false
            referencedRelation: "needs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hedera_events_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      needs: {
        Row: {
          category: Database["public"]["Enums"]["need_category"]
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string
          event_date: string | null
          goal_quantity: number
          goal_unit: string
          id: string
          kind: Database["public"]["Enums"]["need_kind"]
          priority: Database["public"]["Enums"]["need_priority"]
          school_id: string
          status: Database["public"]["Enums"]["need_status"]
          title: string
          updated_at: string
          validated_at: string | null
          validated_by: string | null
        }
        Insert: {
          category: Database["public"]["Enums"]["need_category"]
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          event_date?: string | null
          goal_quantity: number
          goal_unit: string
          id?: string
          kind?: Database["public"]["Enums"]["need_kind"]
          priority?: Database["public"]["Enums"]["need_priority"]
          school_id: string
          status?: Database["public"]["Enums"]["need_status"]
          title: string
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["need_category"]
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          event_date?: string | null
          goal_quantity?: number
          goal_unit?: string
          id?: string
          kind?: Database["public"]["Enums"]["need_kind"]
          priority?: Database["public"]["Enums"]["need_priority"]
          school_id?: string
          status?: Database["public"]["Enums"]["need_status"]
          title?: string
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "needs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "needs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "needs_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          org_name: string | null
          org_type: Database["public"]["Enums"]["org_type"] | null
          role: Database["public"]["Enums"]["user_role"]
          school_id: string | null
          show_publicly: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id: string
          org_name?: string | null
          org_type?: Database["public"]["Enums"]["org_type"] | null
          role?: Database["public"]["Enums"]["user_role"]
          school_id?: string | null
          show_publicly?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          org_name?: string | null
          org_type?: Database["public"]["Enums"]["org_type"] | null
          role?: Database["public"]["Enums"]["user_role"]
          school_id?: string | null
          show_publicly?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          cover_image_path: string | null
          created_at: string
          department: string
          description: string
          id: string
          is_demo: boolean
          latitude: number
          longitude: number
          municipality: string
          name: string
          slug: string
          students_range: string | null
          updated_at: string
          vereda: string | null
        }
        Insert: {
          cover_image_path?: string | null
          created_at?: string
          department?: string
          description?: string
          id?: string
          is_demo?: boolean
          latitude: number
          longitude: number
          municipality: string
          name: string
          slug: string
          students_range?: string | null
          updated_at?: string
          vereda?: string | null
        }
        Update: {
          cover_image_path?: string | null
          created_at?: string
          department?: string
          description?: string
          id?: string
          is_demo?: boolean
          latitude?: number
          longitude?: number
          municipality?: string
          name?: string
          slug?: string
          students_range?: string | null
          updated_at?: string
          vereda?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      impact_feed: {
        Row: {
          commitment_id: string | null
          consensus_timestamp: string | null
          created_at: string | null
          event_id: string | null
          event_type: Database["public"]["Enums"]["hedera_event_type"] | null
          need_id: string | null
          need_kind: Database["public"]["Enums"]["need_kind"] | null
          need_title: string | null
          school_id: string | null
          school_is_demo: boolean | null
          school_municipality: string | null
          school_name: string | null
          school_slug: string | null
          submission_status:
            | Database["public"]["Enums"]["hedera_submission_status"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "hedera_events_commitment_id_fkey"
            columns: ["commitment_id"]
            isOneToOne: false
            referencedRelation: "commitments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hedera_events_need_id_fkey"
            columns: ["need_id"]
            isOneToOne: false
            referencedRelation: "need_progress"
            referencedColumns: ["need_id"]
          },
          {
            foreignKeyName: "hedera_events_need_id_fkey"
            columns: ["need_id"]
            isOneToOne: false
            referencedRelation: "needs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hedera_events_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      need_progress: {
        Row: {
          active_commitments: number | null
          committed_quantity: number | null
          confirmed_quantity: number | null
          goal_quantity: number | null
          need_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      current_user_school_id: { Args: never; Returns: string }
    }
    Enums: {
      commitment_status:
        | "committed"
        | "delivery_reported"
        | "confirmed"
        | "cancelled"
      hedera_event_type:
        | "NEED_CREATED"
        | "NEED_VALIDATED"
        | "COMMITMENT_CREATED"
        | "DELIVERY_REPORTED"
        | "SCHOOL_CONFIRMED"
      hedera_submission_status: "pending" | "submitted" | "failed"
      need_category:
        | "infraestructura"
        | "conectividad"
        | "mobiliario"
        | "materiales"
        | "agua_saneamiento"
        | "mantenimiento"
        | "comunitaria"
      need_kind: "need" | "campaign"
      need_priority: "alta" | "media" | "baja"
      need_status:
        | "pending_validation"
        | "published"
        | "completed"
        | "cancelled"
      org_type: "persona" | "empresa" | "universidad" | "organizacion" | "otro"
      user_role: "supporter" | "school_rep" | "admin"
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
      commitment_status: [
        "committed",
        "delivery_reported",
        "confirmed",
        "cancelled",
      ],
      hedera_event_type: [
        "NEED_CREATED",
        "NEED_VALIDATED",
        "COMMITMENT_CREATED",
        "DELIVERY_REPORTED",
        "SCHOOL_CONFIRMED",
      ],
      hedera_submission_status: ["pending", "submitted", "failed"],
      need_category: [
        "infraestructura",
        "conectividad",
        "mobiliario",
        "materiales",
        "agua_saneamiento",
        "mantenimiento",
        "comunitaria",
      ],
      need_kind: ["need", "campaign"],
      need_priority: ["alta", "media", "baja"],
      need_status: [
        "pending_validation",
        "published",
        "completed",
        "cancelled",
      ],
      org_type: ["persona", "empresa", "universidad", "organizacion", "otro"],
      user_role: ["supporter", "school_rep", "admin"],
    },
  },
} as const
