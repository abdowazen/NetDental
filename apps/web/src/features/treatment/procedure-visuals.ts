import type { ProcedureInput } from "@clinic/shared";
export type ProcedureVisual = { category: ProcedureInput["category"]; color: string; target: "root" | "crown" | "outline" };
export const procedureVisuals: Record<ProcedureInput["category"], ProcedureVisual> = Object.fromEntries([
  ["consultation_diagnosis", "#38bdf8", "outline"],
  ["prevention_hygiene", "#2dd4bf", "outline"],
  ["restorative_dentistry", "#60a5fa", "crown"],
  ["endodontics", "#ef6461", "root"],
  ["periodontics", "#f472b6", "outline"],
  ["oral_surgery", "#f87171", "outline"],
  ["fixed_prosthodontics", "#eab94e", "crown"],
  ["removable_prosthodontics", "#c084fc", "crown"],
  ["implantology", "#94a3b8", "root"],
  ["orthodontics", "#a78bfa", "outline"],
  ["cosmetic_dentistry", "#67e8f9", "crown"],
  ["imaging", "#818cf8", "outline"],
  ["other", "#34d399", "outline"],
].map(([category,color,target]) => [category, { category,color,target }])) as Record<ProcedureInput["category"], ProcedureVisual>;
