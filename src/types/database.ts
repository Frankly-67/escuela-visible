// Tipos de la base de datos en el formato de `supabase gen types typescript`.
// Escritos a mano a partir de supabase/migrations. Cuando el proyecto de
// Supabase esté enlazado, regenerar con:  npm run db:types

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      schools: {
        Row: {
          id: string;
          slug: string;
          name: string;
          department: string;
          municipality: string;
          vereda: string | null;
          latitude: number;
          longitude: number;
          description: string;
          students_range: string | null;
          cover_image_path: string | null;
          is_demo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          department?: string;
          municipality: string;
          vereda?: string | null;
          latitude: number;
          longitude: number;
          description?: string;
          students_range?: string | null;
          cover_image_path?: string | null;
          is_demo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["schools"]["Insert"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          display_name: string;
          role: Database["public"]["Enums"]["user_role"];
          org_type: Database["public"]["Enums"]["org_type"] | null;
          org_name: string | null;
          school_id: string | null;
          show_publicly: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          role?: Database["public"]["Enums"]["user_role"];
          org_type?: Database["public"]["Enums"]["org_type"] | null;
          org_name?: string | null;
          school_id?: string | null;
          show_publicly?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "profiles_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      needs: {
        Row: {
          id: string;
          school_id: string;
          kind: Database["public"]["Enums"]["need_kind"];
          title: string;
          description: string;
          category: Database["public"]["Enums"]["need_category"];
          priority: Database["public"]["Enums"]["need_priority"];
          goal_quantity: number;
          goal_unit: string;
          event_date: string | null;
          status: Database["public"]["Enums"]["need_status"];
          created_by: string | null;
          validated_by: string | null;
          validated_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          kind?: Database["public"]["Enums"]["need_kind"];
          title: string;
          description?: string;
          category: Database["public"]["Enums"]["need_category"];
          priority?: Database["public"]["Enums"]["need_priority"];
          goal_quantity: number;
          goal_unit: string;
          event_date?: string | null;
          status?: Database["public"]["Enums"]["need_status"];
          created_by?: string | null;
          validated_by?: string | null;
          validated_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["needs"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "needs_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "needs_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "needs_validated_by_fkey";
            columns: ["validated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      commitments: {
        Row: {
          id: string;
          need_id: string;
          supporter_id: string;
          quantity: number;
          note: string | null;
          status: Database["public"]["Enums"]["commitment_status"];
          delivery_note: string | null;
          delivery_evidence_path: string | null;
          delivery_reported_at: string | null;
          confirmed_by: string | null;
          confirmed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          need_id: string;
          supporter_id: string;
          quantity: number;
          note?: string | null;
          status?: Database["public"]["Enums"]["commitment_status"];
          delivery_note?: string | null;
          delivery_evidence_path?: string | null;
          delivery_reported_at?: string | null;
          confirmed_by?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["commitments"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "commitments_need_id_fkey";
            columns: ["need_id"];
            isOneToOne: false;
            referencedRelation: "needs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commitments_supporter_id_fkey";
            columns: ["supporter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commitments_confirmed_by_fkey";
            columns: ["confirmed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      hedera_events: {
        Row: {
          id: string;
          event_type: Database["public"]["Enums"]["hedera_event_type"];
          need_id: string;
          school_id: string;
          commitment_id: string | null;
          actor_role: Database["public"]["Enums"]["user_role"];
          payload: Json;
          payload_canonical: string;
          payload_hash: string;
          submission_status: Database["public"]["Enums"]["hedera_submission_status"];
          topic_id: string | null;
          transaction_id: string | null;
          sequence_number: number | null;
          consensus_timestamp: string | null;
          submission_error: string | null;
          attempts: number;
          created_at: string;
          submitted_at: string | null;
        };
        Insert: {
          id?: string;
          event_type: Database["public"]["Enums"]["hedera_event_type"];
          need_id: string;
          school_id: string;
          commitment_id?: string | null;
          actor_role: Database["public"]["Enums"]["user_role"];
          payload: Json;
          payload_canonical: string;
          payload_hash: string;
          submission_status?: Database["public"]["Enums"]["hedera_submission_status"];
          topic_id?: string | null;
          transaction_id?: string | null;
          sequence_number?: number | null;
          consensus_timestamp?: string | null;
          submission_error?: string | null;
          attempts?: number;
          created_at?: string;
          submitted_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["hedera_events"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "hedera_events_need_id_fkey";
            columns: ["need_id"];
            isOneToOne: false;
            referencedRelation: "needs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hedera_events_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hedera_events_commitment_id_fkey";
            columns: ["commitment_id"];
            isOneToOne: false;
            referencedRelation: "commitments";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      need_progress: {
        Row: {
          need_id: string | null;
          goal_quantity: number | null;
          committed_quantity: number | null;
          confirmed_quantity: number | null;
          active_commitments: number | null;
        };
        Relationships: [];
      };
      impact_feed: {
        Row: {
          event_id: string | null;
          event_type: Database["public"]["Enums"]["hedera_event_type"] | null;
          created_at: string | null;
          submission_status: Database["public"]["Enums"]["hedera_submission_status"] | null;
          consensus_timestamp: string | null;
          need_id: string | null;
          need_title: string | null;
          need_kind: Database["public"]["Enums"]["need_kind"] | null;
          school_id: string | null;
          school_name: string | null;
          school_slug: string | null;
          school_municipality: string | null;
          school_is_demo: boolean | null;
          commitment_id: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      current_user_role: {
        Args: Record<PropertyKey, never>;
        Returns: Database["public"]["Enums"]["user_role"];
      };
      current_user_school_id: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
    };
    Enums: {
      user_role: "supporter" | "school_rep" | "admin";
      org_type: "persona" | "empresa" | "universidad" | "organizacion" | "otro";
      need_kind: "need" | "campaign";
      need_category:
        | "infraestructura"
        | "conectividad"
        | "mobiliario"
        | "materiales"
        | "agua_saneamiento"
        | "mantenimiento"
        | "comunitaria";
      need_priority: "alta" | "media" | "baja";
      need_status: "pending_validation" | "published" | "completed" | "cancelled";
      commitment_status: "committed" | "delivery_reported" | "confirmed" | "cancelled";
      hedera_event_type:
        | "NEED_CREATED"
        | "NEED_VALIDATED"
        | "COMMITMENT_CREATED"
        | "DELIVERY_REPORTED"
        | "SCHOOL_CONFIRMED";
      hedera_submission_status: "pending" | "submitted" | "failed";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];
export type Views<T extends keyof PublicSchema["Views"]> = PublicSchema["Views"][T]["Row"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];
