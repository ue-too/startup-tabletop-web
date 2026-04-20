import { balanced } from "./balanced";
import { aggressive } from "./aggressive";
import { cautious } from "./cautious";
import type { Persona } from "./types";

export type { Persona } from "./types";

const PERSONAS: Record<string, Persona> = {
  balanced,
  aggressive,
  cautious,
};

export const personaNames = Object.keys(PERSONAS);

export function getPersona(name: string): Persona {
  const p = PERSONAS[name];
  if (!p) {
    throw new Error(
      `Unknown persona "${name}". Available: ${personaNames.join(", ")}`,
    );
  }
  return p;
}

export { balanced, aggressive, cautious };
