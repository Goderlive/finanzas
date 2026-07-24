// Tipos de la base de datos.
// Escritos a mano según supabase/migrations. Cuando haya conexión al homelab
// se regeneran con:  supabase gen types typescript --db-url "$DATABASE_URL" > src/lib/supabase/database.types.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AccountType =
  | "checking"
  | "savings"
  | "cash"
  | "credit_card"
  | "investment"
  | "other";
export type TransactionType = "income" | "expense" | "transfer";
export type CategoryKind = "income" | "expense";
export type SplitType = "equal" | "percentage" | "fixed";
export type DebtType = "loan" | "credit_card" | "mortgage" | "other";
export type MemberRole = "owner" | "member";
export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export interface Database {
  public: {
    Tables: {
      households: {
        Row: {
          id: string;
          name: string;
          base_currency: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          base_currency?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["households"]["Insert"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          household_id: string | null;
          role: MemberRole;
          display_name: string;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          household_id?: string | null;
          role?: MemberRole;
          display_name: string;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      household_invitations: {
        Row: {
          id: string;
          household_id: string;
          email: string;
          token: string;
          invited_by: string;
          status: InvitationStatus;
          expires_at: string;
          accepted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          email: string;
          token?: string;
          invited_by: string;
          status?: InvitationStatus;
          expires_at?: string;
          accepted_at?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["household_invitations"]["Insert"]
        >;
        Relationships: [];
      };
      accounts: {
        Row: {
          id: string;
          household_id: string;
          owner_id: string | null;
          name: string;
          type: AccountType;
          currency: string;
          initial_balance: number;
          current_balance: number;
          is_archived: boolean;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          owner_id?: string | null;
          name: string;
          type: AccountType;
          currency?: string;
          initial_balance?: number;
          current_balance?: number;
          is_archived?: boolean;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["accounts"]["Insert"]>;
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          household_id: string;
          parent_id: string | null;
          name: string;
          kind: CategoryKind;
          icon: string | null;
          color: string | null;
          is_archived: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          parent_id?: string | null;
          name: string;
          kind: CategoryKind;
          icon?: string | null;
          color?: string | null;
          is_archived?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["categories"]["Insert"]>;
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          household_id: string;
          account_id: string;
          transfer_account_id: string | null;
          category_id: string | null;
          type: TransactionType;
          amount: number;
          description: string | null;
          occurred_at: string;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          account_id: string;
          transfer_account_id?: string | null;
          category_id?: string | null;
          type: TransactionType;
          amount: number;
          description?: string | null;
          occurred_at?: string;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["transactions"]["Insert"]>;
        Relationships: [];
      };
      shared_expenses: {
        Row: {
          id: string;
          household_id: string;
          transaction_id: string | null;
          description: string;
          amount: number;
          paid_by: string;
          split_type: SplitType;
          occurred_at: string;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          transaction_id?: string | null;
          description: string;
          amount: number;
          paid_by: string;
          split_type?: SplitType;
          occurred_at?: string;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["shared_expenses"]["Insert"]
        >;
        Relationships: [];
      };
      shared_expense_splits: {
        Row: {
          id: string;
          shared_expense_id: string;
          profile_id: string;
          owed_amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          shared_expense_id: string;
          profile_id: string;
          owed_amount: number;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["shared_expense_splits"]["Insert"]
        >;
        Relationships: [];
      };
      settlements: {
        Row: {
          id: string;
          household_id: string;
          from_profile: string;
          to_profile: string;
          amount: number;
          settled_at: string;
          note: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          from_profile: string;
          to_profile: string;
          amount: number;
          settled_at?: string;
          note?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["settlements"]["Insert"]>;
        Relationships: [];
      };
      budgets: {
        Row: {
          id: string;
          household_id: string;
          category_id: string;
          month: string;
          amount: number;
          rollover: boolean;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          category_id: string;
          month: string;
          amount: number;
          rollover?: boolean;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["budgets"]["Insert"]>;
        Relationships: [];
      };
      debts: {
        Row: {
          id: string;
          household_id: string;
          owner_id: string | null;
          name: string;
          type: DebtType;
          principal: number;
          current_balance: number;
          interest_rate: number;
          minimum_payment: number;
          statement_day: number | null;
          due_day: number | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          owner_id?: string | null;
          name: string;
          type: DebtType;
          principal: number;
          current_balance: number;
          interest_rate?: number;
          minimum_payment?: number;
          statement_day?: number | null;
          due_day?: number | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["debts"]["Insert"]>;
        Relationships: [];
      };
      savings_goals: {
        Row: {
          id: string;
          household_id: string;
          owner_id: string | null;
          account_id: string | null;
          name: string;
          target_amount: number;
          current_amount: number;
          target_date: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          owner_id?: string | null;
          account_id?: string | null;
          name: string;
          target_amount: number;
          current_amount?: number;
          target_date?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["savings_goals"]["Insert"]>;
        Relationships: [];
      };
      investments: {
        Row: {
          id: string;
          household_id: string;
          owner_id: string | null;
          account_id: string | null;
          symbol: string;
          name: string | null;
          quantity: number;
          purchase_price: number;
          purchase_date: string;
          currency: string;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          owner_id?: string | null;
          account_id?: string | null;
          symbol: string;
          name?: string | null;
          quantity: number;
          purchase_price: number;
          purchase_date?: string;
          currency?: string;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["investments"]["Insert"]>;
        Relationships: [];
      };
      price_snapshots: {
        Row: {
          id: string;
          investment_id: string;
          price: number;
          as_of: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          investment_id: string;
          price: number;
          as_of?: string;
          created_by: string;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["price_snapshots"]["Insert"]
        >;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      current_household_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      can_access_account: {
        Args: { a_id: string };
        Returns: boolean;
      };
      recalculate_account_balance: {
        Args: { p_account: string };
        Returns: number;
      };
      create_household: {
        Args: { p_name: string; p_display_name?: string };
        Returns: string;
      };
      create_invitation: {
        Args: { p_email: string };
        Returns: string;
      };
      accept_invitation: {
        Args: { p_token: string };
        Returns: string;
      };
    };
    Enums: {
      account_type: AccountType;
      transaction_type: TransactionType;
      category_kind: CategoryKind;
      split_type: SplitType;
      debt_type: DebtType;
      member_role: MemberRole;
      invitation_status: InvitationStatus;
    };
    CompositeTypes: Record<never, never>;
  };
}

// Atajos útiles
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
