"use client";

import { useActionState } from "react";
import { acceptInvite, type AuthState } from "../../actions";
import { SubmitButton } from "@/components/submit-button";

export function AcceptInviteForm({ token }: { token: string }) {
  const [state, action] = useActionState<AuthState, FormData>(acceptInvite, {});

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      <SubmitButton className="w-full">Aceptar invitación</SubmitButton>
    </form>
  );
}
