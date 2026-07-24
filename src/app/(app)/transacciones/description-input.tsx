"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { getDescriptionSuggestions } from "./actions";

export function DescriptionInput({ defaultValue }: { defaultValue?: string }) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    if (loaded) return;
    setLoaded(true);
    try {
      setSuggestions(await getDescriptionSuggestions(""));
    } catch {
      // silencioso: el autocompletado es una ayuda, no crítico
    }
  }

  return (
    <>
      <Input
        name="description"
        list="desc-suggestions"
        defaultValue={defaultValue}
        onFocus={load}
        placeholder="Descripción (opcional)"
        autoComplete="off"
      />
      <datalist id="desc-suggestions">
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  );
}
