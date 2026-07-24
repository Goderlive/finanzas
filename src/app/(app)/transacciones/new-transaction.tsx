"use client";

import { useRouter } from "next/navigation";
import {
  TransactionForm,
  type FormAccount,
  type FormCategory,
} from "./transaction-form";

export function NewTransaction({
  accounts,
  categories,
  defaultDate,
}: {
  accounts: FormAccount[];
  categories: FormCategory[];
  defaultDate: string;
}) {
  const router = useRouter();
  return (
    <TransactionForm
      accounts={accounts}
      categories={categories}
      defaultDate={defaultDate}
      onDone={() => router.replace("/transacciones")}
    />
  );
}
