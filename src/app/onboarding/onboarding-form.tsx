"use client";

import { useActionState } from "react";
import { createHousehold, type OnboardingState } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/submit-button";

export function OnboardingForm({ defaultName }: { defaultName: string }) {
  const [state, action] = useActionState<OnboardingState, FormData>(
    createHousehold,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Nombre del hogar</Label>
        <Input id="name" name="name" placeholder="Casa Goder" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="displayName">Tu nombre</Label>
        <Input
          id="displayName"
          name="displayName"
          defaultValue={defaultName}
          required
        />
      </div>
      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      <SubmitButton className="w-full">Crear hogar</SubmitButton>
    </form>
  );
}
