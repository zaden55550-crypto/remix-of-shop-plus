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
      account_role_permissions: {
        Row: {
          allowed: boolean
          owner_account_id: string
          permission_key: string
          role: string
        }
        Insert: {
          allowed: boolean
          owner_account_id: string
          permission_key: string
          role: string
        }
        Update: {
          allowed?: boolean
          owner_account_id?: string
          permission_key?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_role_permissions_owner_account_id_fkey"
            columns: ["owner_account_id"]
            isOneToOne: false
            referencedRelation: "owner_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      ai_access_state: {
        Row: {
          blocked: boolean
          created_at: string
          message: string
          scope: string
          status: number
          updated_at: string
        }
        Insert: {
          blocked?: boolean
          created_at?: string
          message: string
          scope: string
          status: number
          updated_at?: string
        }
        Update: {
          blocked?: boolean
          created_at?: string
          message?: string
          scope?: string
          status?: number
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          after_value: Json | null
          at: string
          before_value: Json | null
          business_id: string | null
          id: string
          location_id: string | null
          owner_account_id: string
          record_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          after_value?: Json | null
          at?: string
          before_value?: Json | null
          business_id?: string | null
          id?: string
          location_id?: string | null
          owner_account_id: string
          record_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          after_value?: Json | null
          at?: string
          before_value?: Json | null
          business_id?: string | null
          id?: string
          location_id?: string | null
          owner_account_id?: string
          record_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_owner_account_id_fkey"
            columns: ["owner_account_id"]
            isOneToOne: false
            referencedRelation: "owner_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      business_integrations: {
        Row: {
          accepted_terms_at: string
          config: Json
          enabled: boolean
          kind: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          accepted_terms_at: string
          config?: Json
          enabled?: boolean
          kind: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          accepted_terms_at?: string
          config?: Json
          enabled?: boolean
          kind?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      business_type_catalogue: {
        Row: {
          business_type: string
          industry_id: string
        }
        Insert: {
          business_type: string
          industry_id: string
        }
        Update: {
          business_type?: string
          industry_id?: string
        }
        Relationships: []
      }
      businesses: {
        Row: {
          archived_at: string | null
          business_type: string | null
          country: string | null
          created_at: string
          currency: string
          erp_ref: string | null
          id: string
          legacy_business_id: string | null
          name: string
          owner_account_id: string
          timezone: string | null
        }
        Insert: {
          archived_at?: string | null
          business_type?: string | null
          country?: string | null
          created_at?: string
          currency: string
          erp_ref?: string | null
          id?: string
          legacy_business_id?: string | null
          name: string
          owner_account_id: string
          timezone?: string | null
        }
        Update: {
          archived_at?: string | null
          business_type?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          erp_ref?: string | null
          id?: string
          legacy_business_id?: string | null
          name?: string
          owner_account_id?: string
          timezone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "businesses_owner_account_id_fkey"
            columns: ["owner_account_id"]
            isOneToOne: false
            referencedRelation: "owner_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_invitations: {
        Row: {
          accepted_at: string | null
          attempts: number
          created_at: string
          expires_at: string
          id: string
          kind: string
          member_id: string
          revoked_at: string | null
          send_error: string | null
          sent_at: string | null
          sent_via: string | null
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          attempts?: number
          created_at?: string
          expires_at: string
          id?: string
          kind?: string
          member_id: string
          revoked_at?: string | null
          send_error?: string | null
          sent_at?: string | null
          sent_via?: string | null
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          attempts?: number
          created_at?: string
          expires_at?: string
          id?: string
          kind?: string
          member_id?: string
          revoked_at?: string | null
          send_error?: string | null
          sent_at?: string | null
          sent_via?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_invitations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "owner_members"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          business_id: string
          code: string
          created_at: string
          erp_ref: string | null
          id: string
          kind: string
          name: string
          owner_account_id: string
          phone: string | null
          status: string
        }
        Insert: {
          address?: string | null
          business_id: string
          code: string
          created_at?: string
          erp_ref?: string | null
          id?: string
          kind: string
          name: string
          owner_account_id: string
          phone?: string | null
          status?: string
        }
        Update: {
          address?: string | null
          business_id?: string
          code?: string
          created_at?: string
          erp_ref?: string | null
          id?: string
          kind?: string
          name?: string
          owner_account_id?: string
          phone?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_owner_account_id_fkey"
            columns: ["owner_account_id"]
            isOneToOne: false
            referencedRelation: "owner_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      login_events: {
        Row: {
          at: string
          id: string
          identifier: string
          ip: string | null
          member_id: string | null
          owner_account_id: string | null
          reason: string | null
          success: boolean
          user_agent: string | null
        }
        Insert: {
          at?: string
          id?: string
          identifier: string
          ip?: string | null
          member_id?: string | null
          owner_account_id?: string | null
          reason?: string | null
          success: boolean
          user_agent?: string | null
        }
        Update: {
          at?: string
          id?: string
          identifier?: string
          ip?: string | null
          member_id?: string | null
          owner_account_id?: string | null
          reason?: string | null
          success?: boolean
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "login_events_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "owner_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "login_events_owner_account_id_fkey"
            columns: ["owner_account_id"]
            isOneToOne: false
            referencedRelation: "owner_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      member_business_permissions: {
        Row: {
          allowed: boolean
          business_id: string
          member_id: string
          permission_key: string
        }
        Insert: {
          allowed: boolean
          business_id: string
          member_id: string
          permission_key: string
        }
        Update: {
          allowed?: boolean
          business_id?: string
          member_id?: string
          permission_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_business_permissions_member_id_business_id_fkey"
            columns: ["member_id", "business_id"]
            isOneToOne: false
            referencedRelation: "member_businesses"
            referencedColumns: ["member_id", "business_id"]
          },
          {
            foreignKeyName: "member_business_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      member_businesses: {
        Row: {
          business_id: string
          member_id: string
          role: string | null
        }
        Insert: {
          business_id: string
          member_id: string
          role?: string | null
        }
        Update: {
          business_id?: string
          member_id?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_businesses_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_businesses_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "owner_members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_locations: {
        Row: {
          location_id: string
          member_id: string
        }
        Insert: {
          location_id: string
          member_id: string
        }
        Update: {
          location_id?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_locations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "owner_members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_permissions: {
        Row: {
          allowed: boolean
          member_id: string
          permission_key: string
        }
        Insert: {
          allowed: boolean
          member_id: string
          permission_key: string
        }
        Update: {
          allowed?: boolean
          member_id?: string
          permission_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_permissions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "owner_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      mpesa_payments: {
        Row: {
          amount: number
          checkout_request_id: string | null
          created_at: string
          id: string
          merchant_request_id: string | null
          owner_id: string
          phone: string
          receipt: string | null
          reference: string | null
          result_desc: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          checkout_request_id?: string | null
          created_at?: string
          id?: string
          merchant_request_id?: string | null
          owner_id: string
          phone: string
          receipt?: string | null
          reference?: string | null
          result_desc?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          checkout_request_id?: string | null
          created_at?: string
          id?: string
          merchant_request_id?: string | null
          owner_id?: string
          phone?: string
          receipt?: string | null
          reference?: string | null
          result_desc?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      owner_accounts: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_user_id?: string
        }
        Relationships: []
      }
      owner_members: {
        Row: {
          created_at: string
          email: string | null
          employee_code: string | null
          employee_ref: string | null
          full_name: string
          id: string
          last_login_at: string | null
          login_email: string | null
          owner_account_id: string
          phone: string | null
          phone_norm: string | null
          role: string
          sessions_revoked_at: string | null
          status: string
          terminated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          employee_code?: string | null
          employee_ref?: string | null
          full_name: string
          id?: string
          last_login_at?: string | null
          login_email?: string | null
          owner_account_id: string
          phone?: string | null
          phone_norm?: string | null
          role: string
          sessions_revoked_at?: string | null
          status: string
          terminated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          employee_code?: string | null
          employee_ref?: string | null
          full_name?: string
          id?: string
          last_login_at?: string | null
          login_email?: string | null
          owner_account_id?: string
          phone?: string | null
          phone_norm?: string | null
          role?: string
          sessions_revoked_at?: string | null
          status?: string
          terminated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "owner_members_owner_account_id_fkey"
            columns: ["owner_account_id"]
            isOneToOne: false
            referencedRelation: "owner_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_subscriptions: {
        Row: {
          billing_cycle: string | null
          current_period_end: string | null
          grace_until: string | null
          owner_account_id: string
          plan_id: string
          status: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          billing_cycle?: string | null
          current_period_end?: string | null
          grace_until?: string | null
          owner_account_id: string
          plan_id: string
          status: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          billing_cycle?: string | null
          current_period_end?: string | null
          grace_until?: string | null
          owner_account_id?: string
          plan_id?: string
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_subscriptions_owner_account_id_fkey"
            columns: ["owner_account_id"]
            isOneToOne: true
            referencedRelation: "owner_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_referrals: {
        Row: {
          code: string
          created_at: string
          referred_owner: string
        }
        Insert: {
          code: string
          created_at?: string
          referred_owner: string
        }
        Update: {
          code?: string
          created_at?: string
          referred_owner?: string
        }
        Relationships: []
      }
      permissions: {
        Row: {
          key: string
          owner_only: boolean
        }
        Insert: {
          key: string
          owner_only?: boolean
        }
        Update: {
          key?: string
          owner_only?: boolean
        }
        Relationships: []
      }
      plan_payments: {
        Row: {
          amount_kes: number
          billing: string
          checkout_request_id: string
          created_at: string
          id: string
          owner_id: string
          phone: string
          plan_id: string
          receipt: string | null
          result_desc: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_kes: number
          billing: string
          checkout_request_id: string
          created_at?: string
          id?: string
          owner_id: string
          phone: string
          plan_id: string
          receipt?: string | null
          result_desc?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_kes?: number
          billing?: string
          checkout_request_id?: string
          created_at?: string
          id?: string
          owner_id?: string
          phone?: string
          plan_id?: string
          receipt?: string | null
          result_desc?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      public_shops: {
        Row: {
          enabled: boolean
          owner_id: string
          slug: string
          title: string
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          enabled?: boolean
          owner_id: string
          slug: string
          title: string
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          enabled?: boolean
          owner_id?: string
          slug?: string
          title?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string
          owner_id: string
        }
        Insert: {
          code: string
          created_at?: string
          owner_id: string
        }
        Update: {
          code?: string
          created_at?: string
          owner_id?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          code: string
          created_at: string
          referred_owner: string
          referrer_owner: string
          rewarded_at: string | null
        }
        Insert: {
          code: string
          created_at?: string
          referred_owner: string
          referrer_owner: string
          rewarded_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          referred_owner?: string
          referrer_owner?: string
          rewarded_at?: string | null
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          permission_key: string
          role: string
        }
        Insert: {
          permission_key: string
          role: string
        }
        Update: {
          permission_key?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      shopbook_backup_snapshots: {
        Row: {
          checksum: string
          created_at: string
          device_id: string
          id: string
          kind: string
          payload: string
          record_count: number
          restore_tested_at: string | null
          shop_name: string
          size_bytes: number
          user_id: string
          verified_at: string | null
        }
        Insert: {
          checksum: string
          created_at?: string
          device_id: string
          id?: string
          kind?: string
          payload: string
          record_count?: number
          restore_tested_at?: string | null
          shop_name?: string
          size_bytes: number
          user_id: string
          verified_at?: string | null
        }
        Update: {
          checksum?: string
          created_at?: string
          device_id?: string
          id?: string
          kind?: string
          payload?: string
          record_count?: number
          restore_tested_at?: string | null
          shop_name?: string
          size_bytes?: number
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      shopbook_device_backups: {
        Row: {
          device_id: string
          payload: Json
          revision: number
          shop_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          device_id: string
          payload: Json
          revision?: number
          shop_name?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          device_id?: string
          payload?: Json
          revision?: number
          shop_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      shopbook_shop_sync: {
        Row: {
          device_id: string
          payload: Json
          revision: number
          updated_at: string
          user_id: string
        }
        Insert: {
          device_id: string
          payload: Json
          revision?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          device_id?: string
          payload?: Json
          revision?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      shopbook_sync_business: {
        Row: {
          business_id: string
          user_id: string
        }
        Insert: {
          business_id: string
          user_id: string
        }
        Update: {
          business_id?: string
          user_id?: string
        }
        Relationships: []
      }
      shopbook_sync_operations: {
        Row: {
          acknowledged_at: string
          business_id: string
          device_id: string
          kind: string
          operation_id: string
          request: Json
          revision: number
          user_id: string
        }
        Insert: {
          acknowledged_at?: string
          business_id: string
          device_id: string
          kind: string
          operation_id: string
          request: Json
          revision: number
          user_id: string
        }
        Update: {
          acknowledged_at?: string
          business_id?: string
          device_id?: string
          kind?: string
          operation_id?: string
          request?: Json
          revision?: number
          user_id?: string
        }
        Relationships: []
      }
      subscription_events: {
        Row: {
          at: string
          from_plan: string | null
          id: string
          owner_account_id: string
          payment_reference: string | null
          status: string
          to_plan: string | null
        }
        Insert: {
          at?: string
          from_plan?: string | null
          id?: string
          owner_account_id: string
          payment_reference?: string | null
          status: string
          to_plan?: string | null
        }
        Update: {
          at?: string
          from_plan?: string | null
          id?: string
          owner_account_id?: string
          payment_reference?: string | null
          status?: string
          to_plan?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_events_owner_account_id_fkey"
            columns: ["owner_account_id"]
            isOneToOne: false
            referencedRelation: "owner_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          employees_per_shop: number
          employees_per_storage: number
          id: string
          max_locations: number
          max_managers: number
          max_users: number | null
          monthly_usd: number
          name: string
          rank: number
          yearly_usd: number
        }
        Insert: {
          employees_per_shop?: number
          employees_per_storage?: number
          id: string
          max_locations: number
          max_managers?: number
          max_users?: number | null
          monthly_usd: number
          name: string
          rank: number
          yearly_usd: number
        }
        Update: {
          employees_per_shop?: number
          employees_per_storage?: number
          id?: string
          max_locations?: number
          max_managers?: number
          max_users?: number | null
          monthly_usd?: number
          name?: string
          rank?: number
          yearly_usd?: number
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          sender: string
          thread_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          sender: string
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          sender?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "support_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      support_threads: {
        Row: {
          contact_email: string
          created_at: string
          id: string
          needs_human: boolean
          shop_name: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          contact_email?: string
          created_at?: string
          id?: string
          needs_human?: boolean
          shop_name?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          contact_email?: string
          created_at?: string
          id?: string
          needs_human?: boolean
          shop_name?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      system_announcements: {
        Row: {
          active: boolean
          created_at: string
          created_by: string
          dismissible: boolean
          ends_at: string | null
          id: string
          kind: string
          message: string
          starts_at: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string
          dismissible?: boolean
          ends_at?: string | null
          id?: string
          kind?: string
          message: string
          starts_at?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string
          dismissible?: boolean
          ends_at?: string | null
          id?: string
          kind?: string
          message?: string
          starts_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      account_entitlements: { Args: { p_account: string }; Returns: Json }
      account_usage: {
        Args: { p_account: string }
        Returns: {
          active_employees: number
          active_locations: number
          active_managers: number
          active_users: number
          available_employees: number
          available_locations: number
          available_managers: number
          available_users: number
          employee_slots: number
          excess_employees: number
          excess_locations: number
          excess_managers: number
          excess_users: number
          max_locations: number
          max_managers: number
          max_users: number
          plan_id: string
          shops: number
          status: string
          stores: number
          usable: boolean
          warehouses: number
        }[]
      }
      active_erp_location_ids: { Args: { p_payload: Json }; Returns: string[] }
      apply_member_operation: {
        Args: {
          p_changes: Json
          p_device: string
          p_kind: string
          p_member: string
          p_operation: string
          p_seq: Json
        }
        Returns: Json
      }
      apply_shopbook_operation: {
        Args: {
          p_business: string
          p_changes: Json
          p_device: string
          p_kind: string
          p_operation: string
          p_seq: Json
        }
        Returns: Json
      }
      apply_shopbook_operation_for: {
        Args: {
          owner_id: string
          p_business: string
          p_changes: Json
          p_device: string
          p_kind: string
          p_operation: string
          p_seq: Json
        }
        Returns: Json
      }
      apply_verified_subscription: {
        Args: {
          p_account: string
          p_cycle: string
          p_period_end: string
          p_plan: string
          p_reference: string
        }
        Returns: undefined
      }
      business_erp_ref: { Args: { p_business: string }; Returns: string }
      business_integration_status: {
        Args: never
        Returns: {
          enabled: boolean
          fields: string[]
          kind: string
          updated_at: string
        }[]
      }
      can_see_business: { Args: { p_business: string }; Returns: boolean }
      can_see_location: { Args: { p_location: string }; Returns: boolean }
      check_assignments: {
        Args: {
          p_account: string
          p_businesses: string[]
          p_locations: string[]
        }
        Returns: undefined
      }
      check_login_allowance: {
        Args: {
          p_account: string
          p_locations: string[]
          p_member: string
          p_role: string
        }
        Returns: undefined
      }
      claim_referral_code: { Args: { p_code: string }; Returns: Json }
      clear_member_permissions: {
        Args: { p_member: string }
        Returns: undefined
      }
      connect_owner: {
        Args: {
          p_account_name: string
          p_business_name: string
          p_country?: string
          p_currency: string
          p_full_name: string
          p_legacy_business: string
        }
        Returns: Json
      }
      create_access_reset: {
        Args: { p_days?: number; p_member: string }
        Returns: {
          expires_at: string
          invitation_id: string
          token: string
        }[]
      }
      create_business: {
        Args: {
          p_account: string
          p_country?: string
          p_currency: string
          p_name: string
          p_timezone?: string
          p_type?: string
        }
        Returns: string
      }
      create_location: {
        Args: {
          p_address?: string
          p_business: string
          p_code: string
          p_kind: string
          p_name: string
          p_phone?: string
        }
        Returns: string
      }
      create_login: {
        Args: {
          p_account: string
          p_businesses: string[]
          p_code: string
          p_days?: number
          p_email: string
          p_employee_ref: string
          p_full_name: string
          p_locations: string[]
          p_phone: string
          p_role: string
        }
        Returns: {
          expires_at: string
          invitation_id: string
          member_id: string
          token: string
        }[]
      }
      end_sessions: { Args: { p_member: string }; Returns: undefined }
      ensure_owner_account: {
        Args: { p_full_name: string; p_name: string }
        Returns: string
      }
      finish_invitation: {
        Args: { p_token: string; p_user: string }
        Returns: string
      }
      grant_member_business: {
        Args: {
          p_business: string
          p_locations: string[]
          p_member: string
          p_permissions: Json
          p_role: string
        }
        Returns: undefined
      }
      has_business_permission: {
        Args: { p_account: string; p_business: string; p_key: string }
        Returns: boolean
      }
      has_permission: {
        Args: { p_account: string; p_key: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      holds_seat: { Args: { p_status: string }; Returns: boolean }
      invitation_contact: { Args: { p_invitation: string }; Returns: Json }
      invitation_details: { Args: { p_token: string }; Returns: Json }
      is_account_owner: { Args: { p_account: string }; Returns: boolean }
      is_manager_role: { Args: { p_role: string }; Returns: boolean }
      issue_invitation: {
        Args: { p_days: number; p_kind: string; p_member: string }
        Returns: {
          expires_at: string
          invitation_id: string
          token: string
        }[]
      }
      link_erp_business: {
        Args: {
          p_account: string
          p_currency: string
          p_erp_ref: string
          p_name: string
        }
        Returns: string
      }
      location_allowances: {
        Args: { p_account: string }
        Returns: {
          allowance: number
          employees: number
          location_id: string
        }[]
      }
      lock_account: { Args: { p_account: string }; Returns: undefined }
      mark_invitation_sent: {
        Args: { p_error: string; p_invitation: string; p_via: string }
        Returns: undefined
      }
      member_business_access: { Args: { p_account: string }; Returns: Json }
      my_access: { Args: never; Returns: Json }
      my_member_id: { Args: { p_account: string }; Returns: string }
      my_referral_code: { Args: never; Returns: Json }
      new_invitation: {
        Args: { p_days?: number; p_member: string }
        Returns: {
          expires_at: string
          invitation_id: string
          token: string
        }[]
      }
      norm_phone: { Args: { p: string }; Returns: string }
      owned_employee: {
        Args: { p_member: string }
        Returns: {
          created_at: string
          email: string | null
          employee_code: string | null
          employee_ref: string | null
          full_name: string
          id: string
          last_login_at: string | null
          login_email: string | null
          owner_account_id: string
          phone: string | null
          phone_norm: string | null
          role: string
          sessions_revoked_at: string | null
          status: string
          terminated_at: string | null
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "owner_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      people_overview: { Args: { p_account: string }; Returns: Json }
      public_shop_catalog: { Args: { p_slug: string }; Returns: Json }
      reactivate_member: { Args: { p_member: string }; Returns: string }
      record_login: {
        Args: {
          p_account: string
          p_agent: string
          p_identifier: string
          p_ip: string
          p_member: string
          p_reason: string
          p_success: boolean
        }
        Returns: undefined
      }
      record_referral: { Args: { p_code: string }; Returns: boolean }
      resolve_login: { Args: { p_identifier: string }; Returns: Json }
      revoke_invitation: { Args: { p_invitation: string }; Returns: undefined }
      revoke_member: { Args: { p_member: string }; Returns: undefined }
      revoke_member_business: {
        Args: { p_business: string; p_member: string }
        Returns: undefined
      }
      revoke_member_sessions: { Args: { p_member: string }; Returns: undefined }
      save_business_integration: {
        Args: {
          p_accept: boolean
          p_config: Json
          p_enabled: boolean
          p_kind: string
        }
        Returns: undefined
      }
      set_location_status: {
        Args: { p_location: string; p_status: string }
        Returns: undefined
      }
      set_member_permission: {
        Args: { p_allowed: boolean; p_key: string; p_member: string }
        Returns: undefined
      }
      set_public_shop: {
        Args: {
          p_enabled: boolean
          p_slug: string
          p_title: string
          p_whatsapp: string
        }
        Returns: undefined
      }
      set_role_permission: {
        Args: {
          p_account: string
          p_allowed: boolean
          p_key: string
          p_role: string
        }
        Returns: undefined
      }
      shopbook_business_problem: { Args: { r: Json }; Returns: string }
      shopbook_health: { Args: never; Returns: boolean }
      shopbook_sync_collections: { Args: never; Returns: string[] }
      suspend_member: { Args: { p_member: string }; Returns: string }
      sync_location: {
        Args: {
          p_active: boolean
          p_business: string
          p_code: string
          p_kind: string
          p_name: string
          p_ref: string
        }
        Returns: string
      }
      synced_location_allowance: { Args: { p_user: string }; Returns: number }
      synced_location_status: { Args: never; Returns: Json }
      terminate_member: { Args: { p_member: string }; Returns: string }
      token_is_current: { Args: { p_revoked: string }; Returns: boolean }
      update_member_access: {
        Args: {
          p_businesses: string[]
          p_locations: string[]
          p_member: string
          p_role: string
        }
        Returns: undefined
      }
      update_member_profile: {
        Args: {
          p_code: string
          p_email: string
          p_full_name: string
          p_member: string
          p_phone: string
        }
        Returns: undefined
      }
      verify_invitation: {
        Args: { p_contact: string; p_token: string }
        Returns: Json
      }
      write_audit: {
        Args: {
          p_account: string
          p_action: string
          p_after: Json
          p_before: Json
          p_business: string
          p_location: string
          p_record: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "support"
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
      app_role: ["support"],
    },
  },
} as const
