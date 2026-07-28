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
  | "loan"
  | "other";
/**
 * Naturaleza de una cuenta a efectos de signo. Se deriva de `type` en la
 * base (columna generada), nunca se escribe a mano.
 *
 * REGLA DE SIGNO DEL PROYECTO: `accounts.current_balance` y
 * `transactions.amount` se guardan siempre con el signo del efecto sobre el
 * patrimonio neto. Los pasivos van en NEGATIVO cuando se debe. El valor
 * absoluto y la etiqueta «debes X» son cosa de la presentación.
 */
export type AccountClass = "asset" | "liability";
export type TransactionType = "income" | "expense" | "transfer";
export type CategoryKind = "income" | "expense";
export type SplitType = "equal" | "percentage" | "fixed";
export type DebtType = "loan" | "credit_card" | "mortgage" | "other";
export type MemberRole = "owner" | "member";
export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";
export type InstallmentStatus = "active" | "completed" | "cancelled";
export type InvestmentType = "fixed" | "variable";
export type CompoundingMethod = "simple" | "monthly" | "daily";
export type InvestmentLotType = "buy" | "sell";

export interface Database {
  public: {
    Tables: {
      households: {
        Row: {
          id: string;
          name: string;
          base_currency: string;
          msi_alert_pct: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          base_currency?: string;
          msi_alert_pct?: number;
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
          /** Generada en la base a partir de `type`. Sólo lectura. */
          account_class: AccountClass;
          currency: string;
          /** Con signo: en un pasivo, la deuda va en negativo. */
          initial_balance: number;
          /** Con signo: en un pasivo, la deuda va en negativo. */
          current_balance: number;
          is_archived: boolean;
          // Sólo para type = 'credit_card'; null en el resto.
          statement_day: number | null;
          payment_day: number | null;
          credit_limit: number | null;
          minimum_payment: number | null;
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
          statement_day?: number | null;
          payment_day?: number | null;
          credit_limit?: number | null;
          minimum_payment?: number | null;
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
          /** En un traspaso, la cuenta del asiento hermano. */
          transfer_account_id: string | null;
          category_id: string | null;
          type: TransactionType;
          /**
           * CON SIGNO: es el efecto de esta fila sobre `account_id`, y por la
           * regla de signo del proyecto también sobre el patrimonio neto.
           * Ingreso > 0, gasto < 0, traspaso: origen < 0 y destino > 0.
           * Para mostrarlo usa `abs()` (ver `src/lib/money.ts`).
           */
          amount: number;
          description: string | null;
          occurred_at: string;
          /** Liga los dos asientos de un traspaso. Null si no lo es. */
          transfer_group_id: string | null;
          /** Generada en la base (`type = 'transfer'`). Sólo lectura. */
          is_transfer: boolean;
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
          transfer_group_id?: string | null;
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
          investment_type: InvestmentType;
          // Renta variable (null en renta fija).
          symbol: string | null;
          quantity: number | null;
          purchase_price: number | null;
          name: string | null;
          purchase_date: string;
          currency: string;
          // Renta fija (null en renta variable).
          principal: number | null;
          annual_rate: number | null;
          start_date: string | null;
          maturity_date: string | null;
          compounding: CompoundingMethod | null;
          reinvests_at_maturity: boolean | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          owner_id?: string | null;
          account_id?: string | null;
          investment_type?: InvestmentType;
          symbol?: string | null;
          name?: string | null;
          quantity?: number | null;
          purchase_price?: number | null;
          purchase_date?: string;
          currency?: string;
          principal?: number | null;
          annual_rate?: number | null;
          start_date?: string | null;
          maturity_date?: string | null;
          compounding?: CompoundingMethod | null;
          reinvests_at_maturity?: boolean | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["investments"]["Insert"]>;
        Relationships: [];
      };
      investment_lots: {
        Row: {
          id: string;
          investment_id: string;
          type: InvestmentLotType;
          quantity: number;
          price: number;
          occurred_at: string;
          note: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          investment_id: string;
          type?: InvestmentLotType;
          quantity: number;
          price: number;
          occurred_at?: string;
          note?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["investment_lots"]["Insert"]
        >;
        Relationships: [];
      };
      installment_plans: {
        Row: {
          id: string;
          household_id: string;
          transaction_id: string;
          total_amount: number;
          months: number;
          monthly_amount: number;
          first_payment_date: string;
          remaining_months: number;
          status: InstallmentStatus;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          transaction_id: string;
          total_amount: number;
          months: number;
          monthly_amount: number;
          first_payment_date: string;
          remaining_months: number;
          status?: InstallmentStatus;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["installment_plans"]["Insert"]
        >;
        Relationships: [];
      };
      installment_payments: {
        Row: {
          id: string;
          plan_id: string;
          installment_no: number;
          due_date: string;
          amount: number;
          is_paid: boolean;
          paid_at: string | null;
          statement_period: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          plan_id: string;
          installment_no: number;
          due_date: string;
          amount: number;
          is_paid?: boolean;
          paid_at?: string | null;
          statement_period: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["installment_payments"]["Insert"]
        >;
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
      create_installment_plan: {
        Args: { p_transaction_id: string; p_months: number };
        Returns: string;
      };
      recalculate_all_balances: {
        Args: Record<string, never>;
        Returns: {
          account_id: string;
          name: string;
          before: number;
          after: number;
        }[];
      };
      /** Crea los dos asientos de un traspaso. Devuelve transfer_group_id. */
      create_transfer: {
        Args: {
          p_from_account: string;
          p_to_account: string;
          /** Centavos, SIEMPRE positivo: la función pone los signos. */
          p_amount: number;
          p_occurred_at?: string;
          p_description?: string | null;
        };
        Returns: string;
      };
      /** Paga una tarjeta desde otra cuenta y reparte el importe. */
      pay_credit_card: {
        Args: {
          p_from_account: string;
          p_card: string;
          /** Centavos, SIEMPRE positivo. */
          p_amount: number;
          p_occurred_at?: string;
          p_description?: string | null;
        };
        Returns: CardPaymentResult;
      };
      credit_card_cycle: {
        Args: { p_card: string; p_now?: string };
        Returns: {
          configured: boolean;
          last_close: string | null;
          next_close: string | null;
          due_date: string | null;
          raw_debt: number;
          statement_debt: number;
          current_debt: number;
          msi_unbilled: number;
          minimum_payment: number | null;
        }[];
      };
    };
    Enums: {
      account_type: AccountType;
      account_class: AccountClass;
      transaction_type: TransactionType;
      category_kind: CategoryKind;
      split_type: SplitType;
      debt_type: DebtType;
      member_role: MemberRole;
      invitation_status: InvitationStatus;
      installment_status: InstallmentStatus;
      investment_type: InvestmentType;
      compounding_method: CompoundingMethod;
      investment_lot_type: InvestmentLotType;
    };
    CompositeTypes: Record<never, never>;
  };
}

/** Desglose que devuelve `pay_credit_card`. Todos los importes en centavos. */
export type CardPaymentResult = {
  transfer_group_id: string;
  amount: number;
  /** Cubierto de mensualidades MSI vencidas. */
  applied_to_msi: number;
  msi_installments_paid: number;
  /** Cubierto del saldo revolvente del último corte. */
  applied_to_statement: number;
  /** Cubierto de las compras del periodo en curso. */
  applied_to_period: number;
  /** Excedente: deja la tarjeta con saldo a favor. */
  credit_balance: number;
  statement_debt_before: number;
  statement_debt_after: number;
  /** Importe del corte que queda sin cubrir y va a generar intereses. */
  interest_on: number;
};

// Atajos útiles
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
