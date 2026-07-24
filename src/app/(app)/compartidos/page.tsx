import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import { getSessionProfile } from "@/lib/auth";
import { getHousehold, getHouseholdMembers } from "@/lib/household";
import { centsToInput, formatMoney } from "@/lib/money";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { computeBalance, type Member } from "./balance";
import { SharedActions } from "./shared-actions";
import { ExpenseItem } from "./expense-item";
import { SettlementItem } from "./settlement-item";

export default async function CompartidosPage() {
  const supabase = await createClient();
  const [membersRaw, session, household, { data: expenses }, { data: settlements }] =
    await Promise.all([
      getHouseholdMembers(),
      getSessionProfile(),
      getHousehold(),
      supabase
        .from("shared_expenses")
        .select("*, splits:shared_expense_splits(profile_id, owed_amount)")
        .order("occurred_at", { ascending: false }),
      supabase
        .from("settlements")
        .select("*")
        .order("settled_at", { ascending: false }),
    ]);

  const currency = household?.base_currency ?? "MXN";
  const members: Member[] = membersRaw.map((m) => ({
    id: m.id,
    name: m.display_name,
  }));
  const memberName = Object.fromEntries(members.map((m) => [m.id, m.name]));

  if (members.length < 2) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Gastos compartidos</h1>
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Los gastos compartidos necesitan a los dos miembros del hogar.{" "}
          <Link href="/hogar" className="underline underline-offset-4">
            Invita a tu pareja
          </Link>
          .
        </div>
      </div>
    );
  }

  // Los tipos escritos a mano no modelan los embeds de PostgREST; el runtime sí
  // trae `splits` porque el FK existe.
  type ExpenseRow = Tables<"shared_expenses"> & {
    splits: { profile_id: string; owed_amount: number }[];
  };
  const expenseList = (expenses ?? []) as unknown as ExpenseRow[];
  const settlementList = settlements ?? [];

  const balance = computeBalance(
    members,
    expenseList.map((e) => ({
      id: e.id,
      amount: e.amount,
      paid_by: e.paid_by,
      splits: e.splits ?? [],
    })),
    settlementList,
  );

  const currentUserId = session?.user.id ?? "";
  const defaultPaidBy = members.some((m) => m.id === currentUserId)
    ? currentUserId
    : members[0].id;

  const settleFrom = balance.debtor?.id ?? members[0].id;
  const settleTo = balance.creditor?.id ?? members[1].id;
  const settleAmount = balance.amount > 0 ? centsToInput(balance.amount) : "";

  const today = new Date().toLocaleDateString("en-CA");

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Gastos compartidos</h1>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Quién le debe a quién</CardDescription>
          {balance.amount === 0 ? (
            <CardTitle className="text-2xl text-emerald-600 dark:text-emerald-400">
              Están a mano ✓
            </CardTitle>
          ) : (
            <CardTitle className="text-2xl">
              <span className="font-semibold">{balance.debtor?.name}</span>{" "}
              <span className="text-base font-normal text-muted-foreground">
                le debe a
              </span>{" "}
              <span className="font-semibold">{balance.creditor?.name}</span>
              <div className="tabular-nums">
                {formatMoney(balance.amount, currency)}
              </div>
            </CardTitle>
          )}
        </CardHeader>
        <CardContent>
          <SharedActions
            members={members}
            defaultPaidBy={defaultPaidBy}
            defaultDate={today}
            settleFrom={settleFrom}
            settleTo={settleTo}
            settleAmount={settleAmount}
          />
        </CardContent>
      </Card>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Gastos</h2>
        {expenseList.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Aún no hay gastos compartidos.
          </p>
        ) : (
          expenseList.map((e) => (
            <ExpenseItem
              key={e.id}
              id={e.id}
              description={e.description}
              amount={e.amount}
              paidBy={e.paid_by}
              splitType={e.split_type}
              splits={e.splits ?? []}
              memberName={memberName}
              currency={currency}
            />
          ))
        )}
      </section>

      {settlementList.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Liquidaciones
          </h2>
          {settlementList.map((s) => (
            <SettlementItem
              key={s.id}
              id={s.id}
              fromName={memberName[s.from_profile] ?? "?"}
              toName={memberName[s.to_profile] ?? "?"}
              amount={s.amount}
              note={s.note}
              currency={currency}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}
