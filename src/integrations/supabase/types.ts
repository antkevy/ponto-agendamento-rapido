export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      agendamentos: {
        Row: {
          client_email: string | null;
          client_id: string | null;
          client_name: string;
          client_phone: string;
          created_at: string;
          employee_id: string | null;
          ends_at: string;
          id: string;
          notes: string | null;
          professional_id: string;
          service_id: string;
          service_snapshot_name: string;
          service_snapshot_price_cents: number;
          starts_at: string;
          status: Database["public"]["Enums"]["appointment_status"];
          updated_at: string;
        };
        Insert: {
          client_email?: string | null;
          client_id?: string | null;
          client_name: string;
          client_phone: string;
          created_at?: string;
          employee_id?: string | null;
          ends_at: string;
          id?: string;
          notes?: string | null;
          professional_id: string;
          service_id: string;
          service_snapshot_name: string;
          service_snapshot_price_cents?: number;
          starts_at: string;
          status?: Database["public"]["Enums"]["appointment_status"];
          updated_at?: string;
        };
        Update: {
          client_email?: string | null;
          client_id?: string | null;
          client_name?: string;
          client_phone?: string;
          created_at?: string;
          employee_id?: string | null;
          ends_at?: string;
          id?: string;
          notes?: string | null;
          professional_id?: string;
          service_id?: string;
          service_snapshot_name?: string;
          service_snapshot_price_cents?: number;
          starts_at?: string;
          status?: Database["public"]["Enums"]["appointment_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agendamentos_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "funcionarios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "profissionais";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "servicos";
            referencedColumns: ["id"];
          },
        ];
      };
      auth_event_log: {
        Row: {
          contact: string;
          created_at: string;
          id: number;
          kind: string;
        };
        Insert: {
          contact: string;
          created_at?: string;
          id?: never;
          kind: string;
        };
        Update: {
          contact?: string;
          created_at?: string;
          id?: never;
          kind?: string;
        };
        Relationships: [];
      };
      bloqueios: {
        Row: {
          created_at: string;
          ends_at: string;
          id: string;
          professional_id: string;
          reason: string | null;
          starts_at: string;
        };
        Insert: {
          created_at?: string;
          ends_at: string;
          id?: string;
          professional_id: string;
          reason?: string | null;
          starts_at: string;
        };
        Update: {
          created_at?: string;
          ends_at?: string;
          id?: string;
          professional_id?: string;
          reason?: string | null;
          starts_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "blocks_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "profissionais";
            referencedColumns: ["id"];
          },
        ];
      };
      bloqueios_funcionario: {
        Row: {
          created_at: string;
          employee_id: string;
          ends_at: string;
          id: string;
          reason: string | null;
          starts_at: string;
        };
        Insert: {
          created_at?: string;
          employee_id: string;
          ends_at: string;
          id?: string;
          reason?: string | null;
          starts_at: string;
        };
        Update: {
          created_at?: string;
          employee_id?: string;
          ends_at?: string;
          id?: string;
          reason?: string | null;
          starts_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "employee_blocks_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "funcionarios";
            referencedColumns: ["id"];
          },
        ];
      };
      clientes: {
        Row: {
          created_at: string;
          email: string | null;
          id: string;
          name: string;
          notes: string | null;
          phone: string;
          professional_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          id?: string;
          name: string;
          notes?: string | null;
          phone: string;
          professional_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          id?: string;
          name?: string;
          notes?: string | null;
          phone?: string;
          professional_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clientes_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "profissionais";
            referencedColumns: ["id"];
          },
        ];
      };
      depoimentos: {
        Row: {
          client_name: string;
          client_photo: string | null;
          comment: string;
          created_at: string;
          id: string;
          is_visible: boolean;
          professional_id: string;
          rating: number;
          updated_at: string;
        };
        Insert: {
          client_name: string;
          client_photo?: string | null;
          comment: string;
          created_at?: string;
          id?: string;
          is_visible?: boolean;
          professional_id: string;
          rating?: number;
          updated_at?: string;
        };
        Update: {
          client_name?: string;
          client_photo?: string | null;
          comment?: string;
          created_at?: string;
          id?: string;
          is_visible?: boolean;
          professional_id?: string;
          rating?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "depoimentos_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "profissionais";
            referencedColumns: ["id"];
          },
        ];
      };
      disponibilidade_funcionario: {
        Row: {
          created_at: string;
          employee_id: string;
          end_time: string;
          id: string;
          start_time: string;
          weekday: number;
        };
        Insert: {
          created_at?: string;
          employee_id: string;
          end_time: string;
          id?: string;
          start_time: string;
          weekday: number;
        };
        Update: {
          created_at?: string;
          employee_id?: string;
          end_time?: string;
          id?: string;
          start_time?: string;
          weekday?: number;
        };
        Relationships: [
          {
            foreignKeyName: "employee_availability_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "funcionarios";
            referencedColumns: ["id"];
          },
        ];
      };
      faq: {
        Row: {
          answer: string;
          created_at: string;
          id: string;
          professional_id: string;
          question: string;
          sort_order: number;
        };
        Insert: {
          answer: string;
          created_at?: string;
          id?: string;
          professional_id: string;
          question: string;
          sort_order?: number;
        };
        Update: {
          answer?: string;
          created_at?: string;
          id?: string;
          professional_id?: string;
          question?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "faq_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "profissionais";
            referencedColumns: ["id"];
          },
        ];
      };
      funcionarios: {
        Row: {
          bio: string | null;
          created_at: string;
          experience_years: number | null;
          id: string;
          is_active: boolean;
          name: string;
          photo_url: string | null;
          professional_id: string;
          services_done: number;
          specialty: string | null;
          updated_at: string;
        };
        Insert: {
          bio?: string | null;
          created_at?: string;
          experience_years?: number | null;
          id?: string;
          is_active?: boolean;
          name: string;
          photo_url?: string | null;
          professional_id: string;
          services_done?: number;
          specialty?: string | null;
          updated_at?: string;
        };
        Update: {
          bio?: string | null;
          created_at?: string;
          experience_years?: number | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          photo_url?: string | null;
          professional_id?: string;
          services_done?: number;
          specialty?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "employees_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "profissionais";
            referencedColumns: ["id"];
          },
        ];
      };
      galeria: {
        Row: {
          caption: string | null;
          category: string | null;
          created_at: string;
          id: string;
          image_url: string;
          professional_id: string;
          sort_order: number;
        };
        Insert: {
          caption?: string | null;
          category?: string | null;
          created_at?: string;
          id?: string;
          image_url: string;
          professional_id: string;
          sort_order?: number;
        };
        Update: {
          caption?: string | null;
          category?: string | null;
          created_at?: string;
          id?: string;
          image_url?: string;
          professional_id?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "galeria_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "profissionais";
            referencedColumns: ["id"];
          },
        ];
      };
      horarios: {
        Row: {
          created_at: string;
          end_time: string;
          id: string;
          professional_id: string;
          start_time: string;
          weekday: number;
        };
        Insert: {
          created_at?: string;
          end_time: string;
          id?: string;
          professional_id: string;
          start_time: string;
          weekday: number;
        };
        Update: {
          created_at?: string;
          end_time?: string;
          id?: string;
          professional_id?: string;
          start_time?: string;
          weekday?: number;
        };
        Relationships: [
          {
            foreignKeyName: "availability_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "profissionais";
            referencedColumns: ["id"];
          },
        ];
      };
      planos: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          image_url: string | null;
          is_active: boolean;
          name: string;
          price_cents: number;
          professional_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          name: string;
          price_cents?: number;
          professional_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          name?: string;
          price_cents?: number;
          professional_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "planos_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "profissionais";
            referencedColumns: ["id"];
          },
        ];
      };
      produtos: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          image_url: string | null;
          is_active: boolean;
          name: string;
          price_cents: number;
          professional_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          name: string;
          price_cents?: number;
          professional_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          name?: string;
          price_cents?: number;
          professional_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "produtos_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "profissionais";
            referencedColumns: ["id"];
          },
        ];
      };
      profissionais: {
        Row: {
          address: string | null;
          banner_url: string | null;
          brand_color: string;
          business_name: string;
          button_style: string;
          category: string | null;
          city: string | null;
          corner_radius: string;
          created_at: string;
          description: string | null;
          differentials: string | null;
          email: string | null;
          facebook: string | null;
          id: string;
          instagram: string | null;
          lat: number | null;
          linkedin: string | null;
          lng: number | null;
          logo_url: string | null;
          mission: string | null;
          msg_cancelled: string | null;
          msg_confirmed: string | null;
          opening_hours_display: string | null;
          owner_name: string | null;
          phone: string | null;
          privacy_policy: string | null;
          secondary_color: string | null;
          show_employees: boolean;
          slug: string;
          story: string | null;
          tagline: string | null;
          terms: string | null;
          theme_colors: Json | null;
          theme_mode: string;
          tiktok: string | null;
          timezone: string;
          updated_at: string;
          user_id: string;
          values_text: string | null;
          video_url: string | null;
          website: string | null;
          whatsapp: string | null;
          youtube: string | null;
        };
        Insert: {
          address?: string | null;
          banner_url?: string | null;
          brand_color?: string;
          business_name: string;
          button_style?: string;
          category?: string | null;
          city?: string | null;
          corner_radius?: string;
          created_at?: string;
          description?: string | null;
          differentials?: string | null;
          email?: string | null;
          facebook?: string | null;
          id?: string;
          instagram?: string | null;
          lat?: number | null;
          linkedin?: string | null;
          lng?: number | null;
          logo_url?: string | null;
          mission?: string | null;
          msg_cancelled?: string | null;
          msg_confirmed?: string | null;
          opening_hours_display?: string | null;
          owner_name?: string | null;
          phone?: string | null;
          privacy_policy?: string | null;
          secondary_color?: string | null;
          show_employees?: boolean;
          slug: string;
          story?: string | null;
          tagline?: string | null;
          terms?: string | null;
          theme_colors?: Json | null;
          theme_mode?: string;
          tiktok?: string | null;
          timezone?: string;
          updated_at?: string;
          user_id: string;
          values_text?: string | null;
          video_url?: string | null;
          website?: string | null;
          whatsapp?: string | null;
          youtube?: string | null;
        };
        Update: {
          address?: string | null;
          banner_url?: string | null;
          brand_color?: string;
          business_name?: string;
          button_style?: string;
          category?: string | null;
          city?: string | null;
          corner_radius?: string;
          created_at?: string;
          description?: string | null;
          differentials?: string | null;
          email?: string | null;
          facebook?: string | null;
          id?: string;
          instagram?: string | null;
          lat?: number | null;
          linkedin?: string | null;
          lng?: number | null;
          logo_url?: string | null;
          mission?: string | null;
          msg_cancelled?: string | null;
          msg_confirmed?: string | null;
          opening_hours_display?: string | null;
          owner_name?: string | null;
          phone?: string | null;
          privacy_policy?: string | null;
          secondary_color?: string | null;
          show_employees?: boolean;
          slug?: string;
          story?: string | null;
          tagline?: string | null;
          terms?: string | null;
          theme_colors?: Json | null;
          theme_mode?: string;
          tiktok?: string | null;
          timezone?: string;
          updated_at?: string;
          user_id?: string;
          values_text?: string | null;
          video_url?: string | null;
          website?: string | null;
          whatsapp?: string | null;
          youtube?: string | null;
        };
        Relationships: [];
      };
      public_contact_attempts: {
        Row: {
          contact: string;
          created_at: string;
          id: number;
          op: string;
        };
        Insert: {
          contact: string;
          created_at?: string;
          id?: never;
          op: string;
        };
        Update: {
          contact?: string;
          created_at?: string;
          id?: never;
          op?: string;
        };
        Relationships: [];
      };
      servicos: {
        Row: {
          category: string | null;
          created_at: string;
          description: string | null;
          duration_minutes: number;
          id: string;
          image_url: string | null;
          is_active: boolean;
          name: string;
          price_cents: number;
          professional_id: string;
          updated_at: string;
        };
        Insert: {
          category?: string | null;
          created_at?: string;
          description?: string | null;
          duration_minutes: number;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          name: string;
          price_cents?: number;
          professional_id: string;
          updated_at?: string;
        };
        Update: {
          category?: string | null;
          created_at?: string;
          description?: string | null;
          duration_minutes?: number;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          name?: string;
          price_cents?: number;
          professional_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "services_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "profissionais";
            referencedColumns: ["id"];
          },
        ];
      };
      servicos_funcionario: {
        Row: {
          created_at: string;
          employee_id: string;
          service_id: string;
        };
        Insert: {
          created_at?: string;
          employee_id: string;
          service_id: string;
        };
        Update: {
          created_at?: string;
          employee_id?: string;
          service_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "employee_services_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "funcionarios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employee_services_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "servicos";
            referencedColumns: ["id"];
          },
        ];
      };
      user_security: {
        Row: {
          created_at: string;
          mfa_enabled: boolean;
          password_changed_at: string;
          role: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          mfa_enabled?: boolean;
          password_changed_at?: string;
          role?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          mfa_enabled?: boolean;
          password_changed_at?: string;
          role?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_security_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      check_contact_rate_limit: {
        Args: { _contact: string; _max: number; _op: string; _window: string };
        Returns: boolean;
      };
      client_cancel_appointment: {
        Args: { _contact: string; _id: string };
        Returns: boolean;
      };
      client_reschedule_appointment: {
        Args: { _contact: string; _id: string; _starts_at: string };
        Returns: boolean;
      };
      get_busy_slots: {
        Args: { _from: string; _professional_id: string; _to: string };
        Returns: {
          ends_at: string;
          starts_at: string;
        }[];
      };
      get_employee_busy_slots: {
        Args: { _employee_id: string; _from: string; _to: string };
        Returns: {
          ends_at: string;
          starts_at: string;
        }[];
      };
      log_auth_event: {
        Args: { p_contact: string; p_kind: string };
        Returns: boolean;
      };
      lookup_client_appointments: {
        Args: { _contact: string };
        Returns: {
          client_name: string;
          duration_minutes: number;
          employee_id: string;
          ends_at: string;
          id: string;
          professional_business_name: string;
          professional_id: string;
          professional_slug: string;
          service_name: string;
          starts_at: string;
          status: Database["public"]["Enums"]["appointment_status"];
        }[];
      };
      current_user_role: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      has_role: {
        Args: { p_role: string };
        Returns: boolean;
      };
      set_mfa_enabled: {
        Args: { p_enabled: boolean };
        Returns: boolean;
      };
      touch_password_change: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      set_user_role: {
        Args: { p_role: string; p_user_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      appointment_status: "confirmed" | "cancelled" | "completed";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      appointment_status: ["confirmed", "cancelled", "completed"],
    },
  },
} as const;
