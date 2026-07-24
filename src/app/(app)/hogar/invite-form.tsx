"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { createInvite, type InviteState } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/submit-button";
import { CopyLink } from "./copy-link";

export function InviteForm() {
  const [state, action] = useActionState<InviteState, FormData>(
    createInvite,
    {},
  );

  useEffect(() => {
    if (state.link) toast.success("Invitación creada");
  }, [state.link]);

  return (
    <div className="space-y-3">
      <form action={action} className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="email">Correo de tu pareja</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="pareja@correo.com"
            required
          />
        </div>
        {state.error ? (
          <p className="text-sm text-destructive">{state.error}</p>
        ) : null}
        <SubmitButton>Generar invitación</SubmitButton>
      </form>

      {state.link ? (
        <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
          <p className="text-sm">
            Comparte este enlace con{" "}
            <span className="font-medium">{state.email}</span>:
          </p>
          <CopyLink link={state.link} />
        </div>
      ) : null}
    </div>
  );
}
