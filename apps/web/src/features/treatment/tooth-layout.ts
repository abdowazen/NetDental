import { toothInfo } from "@clinic/shared";

// Front camera looks along -Z: patient right is screen left (-X).
// Primary arches occupy separate vertical layers in mixed mode.
export function toothPosition(id: number, mixed: boolean): [number, number, number] {
  const tooth = toothInfo(id);
  const count = tooth.primary ? 5 : 8;
  const angle = (tooth.position - 0.5) / count * 1.55;
  const radius = tooth.primary ? 4.7 : 7;
  return [(tooth.right ? -1 : 1) * radius * Math.sin(angle),
    (tooth.upper ? 1 : -1) * (mixed && tooth.primary ? 6.3 : 2),
    radius * Math.cos(angle) - 3];
}
