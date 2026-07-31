// Hand-written DB types matching supabase/migrations/0001-0004 *.sql.
//
// DEVIATION FROM PLAN (flagged per apply instructions): this file was meant
// to be generated via `supabase gen types typescript --local` (task 1.5).
// The Supabase CLI is not installed in this environment (no `supabase`
// binary, no local Postgres/Docker reachable — see apply-progress for the
// full verification log), so `supabase gen types` could not actually run.
// These types are hand-authored to match the migrations column-for-column,
// following the same shape `supabase gen types typescript` produces (Row /
// Insert / Update per table, Row-only for views, Functions with Args/Returns
// per schema). They are NOT a substitute for running the real generator —
// regenerate this file for real the first time a local Supabase instance is
// available, and diff against this hand-written version to catch drift.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tenant_contacts: {
        Row: {
          id: string;
          tenant_id: string;
          contact_name: string;
          contact_phone: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          contact_name: string;
          contact_phone: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          contact_name?: string;
          contact_phone?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_contacts_tenant_id_fkey";
            columns: ["tenant_id"];
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_users_access: {
        Row: {
          id: string;
          tenant_id: string;
          user_id: string;
          granted: boolean;
          granted_by: string | null;
          granted_at: string | null;
          revoked_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          user_id: string;
          granted?: boolean;
          granted_by?: string | null;
          granted_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          user_id?: string;
          granted?: boolean;
          granted_by?: string | null;
          granted_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_users_access_tenant_id_fkey";
            columns: ["tenant_id"];
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      vehicle_snapshots: {
        Row: {
          id: string;
          tenant_id: string;
          make: string;
          model: string;
          year: number | null;
          ally_price: number | null;
          min_price: number | null;
          status: string;
          views_count: number;
          last_source_seq: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          tenant_id: string;
          make: string;
          model: string;
          year?: number | null;
          ally_price?: number | null;
          min_price?: number | null;
          status?: string;
          views_count?: number;
          last_source_seq?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          make?: string;
          model?: string;
          year?: number | null;
          ally_price?: number | null;
          min_price?: number | null;
          status?: string;
          views_count?: number;
          last_source_seq?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vehicle_snapshots_tenant_id_fkey";
            columns: ["tenant_id"];
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      vehicle_snapshot_photos: {
        Row: {
          id: string;
          vehicle_snapshot_id: string;
          url: string;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          vehicle_snapshot_id: string;
          url: string;
          position?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          vehicle_snapshot_id?: string;
          url?: string;
          position?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vehicle_snapshot_photos_vehicle_snapshot_id_fkey";
            columns: ["vehicle_snapshot_id"];
            referencedRelation: "vehicle_snapshots";
            referencedColumns: ["id"];
          },
        ];
      };
      search_requests: {
        Row: {
          id: string;
          tenant_id: string;
          requested_by: string;
          criteria: Json;
          status: "open" | "fulfilled" | "closed";
          opted_in_fan_out: boolean;
          opted_in_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          requested_by: string;
          criteria?: Json;
          status?: "open" | "fulfilled" | "closed";
          opted_in_fan_out?: boolean;
          opted_in_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          requested_by?: string;
          criteria?: Json;
          status?: "open" | "fulfilled" | "closed";
          opted_in_fan_out?: boolean;
          opted_in_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "search_requests_tenant_id_fkey";
            columns: ["tenant_id"];
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      search_request_targets: {
        Row: {
          id: string;
          search_request_id: string;
          target_tenant_id: string;
          included_at: string;
        };
        Insert: {
          id?: string;
          search_request_id: string;
          target_tenant_id: string;
          included_at?: string;
        };
        Update: {
          id?: string;
          search_request_id?: string;
          target_tenant_id?: string;
          included_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "search_request_targets_search_request_id_fkey";
            columns: ["search_request_id"];
            referencedRelation: "search_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "search_request_targets_target_tenant_id_fkey";
            columns: ["target_tenant_id"];
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      connection_requests: {
        Row: {
          id: string;
          requester_tenant_id: string;
          recipient_tenant_id: string;
          origin_type: "vehicle_interest" | "search_match" | "direct";
          status: "suggested" | "pending" | "accepted" | "rejected" | "expired";
          vehicle_snapshot_id: string | null;
          search_request_id: string | null;
          seeded_by: string | null;
          requested_by: string | null;
          responded_by: string | null;
          expires_at: string | null;
          responded_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          requester_tenant_id: string;
          recipient_tenant_id: string;
          origin_type: "vehicle_interest" | "search_match" | "direct";
          status?: "suggested" | "pending" | "accepted" | "rejected" | "expired";
          vehicle_snapshot_id?: string | null;
          search_request_id?: string | null;
          seeded_by?: string | null;
          requested_by?: string | null;
          responded_by?: string | null;
          expires_at?: string | null;
          responded_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          requester_tenant_id?: string;
          recipient_tenant_id?: string;
          origin_type?: "vehicle_interest" | "search_match" | "direct";
          status?: "suggested" | "pending" | "accepted" | "rejected" | "expired";
          vehicle_snapshot_id?: string | null;
          search_request_id?: string | null;
          seeded_by?: string | null;
          requested_by?: string | null;
          responded_by?: string | null;
          expires_at?: string | null;
          responded_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "connection_requests_requester_tenant_id_fkey";
            columns: ["requester_tenant_id"];
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "connection_requests_recipient_tenant_id_fkey";
            columns: ["recipient_tenant_id"];
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "connection_requests_vehicle_snapshot_id_fkey";
            columns: ["vehicle_snapshot_id"];
            referencedRelation: "vehicle_snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "connection_requests_search_request_id_fkey";
            columns: ["search_request_id"];
            referencedRelation: "search_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      connection_edges: {
        Row: {
          id: string;
          viewer_tenant_id: string;
          visible_tenant_id: string;
          connection_request_id: string;
          created_at: string;
          revoked_at: string | null;
        };
        Insert: {
          id?: string;
          viewer_tenant_id: string;
          visible_tenant_id: string;
          connection_request_id: string;
          created_at?: string;
          revoked_at?: string | null;
        };
        Update: {
          id?: string;
          viewer_tenant_id?: string;
          visible_tenant_id?: string;
          connection_request_id?: string;
          created_at?: string;
          revoked_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "connection_edges_viewer_tenant_id_fkey";
            columns: ["viewer_tenant_id"];
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "connection_edges_visible_tenant_id_fkey";
            columns: ["visible_tenant_id"];
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "connection_edges_connection_request_id_fkey";
            columns: ["connection_request_id"];
            referencedRelation: "connection_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      connection_messages: {
        Row: {
          id: string;
          connection_request_id: string;
          sender_tenant_id: string;
          sender_user_id: string;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          connection_request_id: string;
          sender_tenant_id: string;
          sender_user_id: string;
          body: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          connection_request_id?: string;
          sender_tenant_id?: string;
          sender_user_id?: string;
          body?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "connection_messages_connection_request_id_fkey";
            columns: ["connection_request_id"];
            referencedRelation: "connection_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "connection_messages_sender_tenant_id_fkey";
            columns: ["sender_tenant_id"];
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      reputation_events: {
        Row: {
          id: string;
          tenant_id: string;
          connection_request_id: string;
          event_type: "accepted" | "rejected" | "expired";
          response_time_seconds: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          connection_request_id: string;
          event_type: "accepted" | "rejected" | "expired";
          response_time_seconds: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          connection_request_id?: string;
          event_type?: "accepted" | "rejected" | "expired";
          response_time_seconds?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reputation_events_tenant_id_fkey";
            columns: ["tenant_id"];
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reputation_events_connection_request_id_fkey";
            columns: ["connection_request_id"];
            referencedRelation: "connection_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      search_opportunities_out: {
        Row: {
          id: string;
          search_request_id: string;
          vehicle_snapshot_id: string;
          matched_tenant_id: string;
          proceeded_by: string;
          proceeded_at: string;
          v2_opportunity_ref: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          search_request_id: string;
          vehicle_snapshot_id: string;
          matched_tenant_id: string;
          proceeded_by: string;
          proceeded_at?: string;
          v2_opportunity_ref?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          search_request_id?: string;
          vehicle_snapshot_id?: string;
          matched_tenant_id?: string;
          proceeded_by?: string;
          proceeded_at?: string;
          v2_opportunity_ref?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "search_opportunities_out_search_request_id_fkey";
            columns: ["search_request_id"];
            referencedRelation: "search_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "search_opportunities_out_vehicle_snapshot_id_fkey";
            columns: ["vehicle_snapshot_id"];
            referencedRelation: "vehicle_snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "search_opportunities_out_matched_tenant_id_fkey";
            columns: ["matched_tenant_id"];
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      sync_event_log: {
        Row: {
          id: string;
          source: string;
          event_id: string;
          aggregate_type: "vehicle" | "tenant";
          aggregate_id: string;
          source_seq: number;
          status: "received" | "applied" | "failed" | "skipped_stale" | "dead";
          attempts: number;
          next_attempt_at: string | null;
          payload: Json;
          error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          source: string;
          event_id: string;
          aggregate_type: "vehicle" | "tenant";
          aggregate_id: string;
          source_seq: number;
          status?: "received" | "applied" | "failed" | "skipped_stale" | "dead";
          attempts?: number;
          next_attempt_at?: string | null;
          payload?: Json;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          source?: string;
          event_id?: string;
          aggregate_type?: "vehicle" | "tenant";
          aggregate_id?: string;
          source_seq?: number;
          status?: "received" | "applied" | "failed" | "skipped_stale" | "dead";
          attempts?: number;
          next_attempt_at?: string | null;
          payload?: Json;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      vehicle_snapshots_public: {
        Row: {
          id: string;
          tenant_id: string;
          make: string;
          model: string;
          year: number | null;
          ally_price: number | null;
          status: string;
          views_count: number;
          min_price: number | null;
          tenant_name: string | null;
          contact_phone: string | null;
          visibility_tier: "owner" | "connected" | "candidate" | "none";
        };
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
  app: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: {
      module_enabled: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      current_tenant_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      has_network_access: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_connected: {
        Args: { target_tenant_id: string };
        Returns: boolean;
      };
      has_candidate_link: {
        Args: { target_tenant_id: string };
        Returns: boolean;
      };
      visibility_tier: {
        Args: { target_tenant_id: string };
        Returns: "owner" | "connected" | "candidate" | "none";
      };
      vehicle_snapshot_visible: {
        Args: { target_vehicle_id: string };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

// Convenience aliases, mirroring the common pattern layered on top of a
// generated Database type (features/*/data adapters import from here).
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
export type Views<T extends keyof Database["public"]["Views"]> =
  Database["public"]["Views"][T]["Row"];
