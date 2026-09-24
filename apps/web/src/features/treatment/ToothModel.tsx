import { useEffect, useMemo, useState } from "react";
import { crownGeometry, rootGeometry } from "./tooth-geometry";
import { ChartLabel } from "./ChartLabel";
import type { ThreeEvent } from "@react-three/fiber";
import { toothInfo } from "@clinic/shared";
import { toothPosition } from "./tooth-layout";
import type { ProcedureVisual } from "./procedure-visuals";

export type ToothModelProps = {
  id: number; selected: boolean; mixed: boolean; roots: boolean; gums: boolean;
  absent: boolean; label: string; hasRecords: boolean;
  onSelect: (id: number) => void; onHover: (id: number | null) => void;
  indicators?: ProcedureVisual[];
};
// Presentation-only model. A future GLB component can use these same FDI-based
// props and callbacks; geometry is never persisted in clinical records.
export function ToothModel({ id, selected, mixed, roots, absent, label, hasRecords, indicators = [], onSelect, onHover }: ToothModelProps) {
  const [hovered, setHovered] = useState(false);
  const info = toothInfo(id);
  const scale = info.primary ? 0.78 : 1;
  const crown = useMemo(() => crownGeometry(info.kind), [info.kind]);
  const root = useMemo(() => rootGeometry(), []);
  useEffect(() => () => { crown.dispose(); root.dispose(); }, [crown, root]);
  const position = toothPosition(id, mixed);
  const angle = Math.atan2(position[0], position[2] + 3);
  const crownColor = indicators.find((v) => v.target === "crown")?.color;
  const rootColor = indicators.find((v) => v.target === "root")?.color;
  function click(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    if (event.delta <= 5) onSelect(id);
  }
  return <group position={position} rotation={[0, angle, 0]}>
    <group rotation={info.upper ? [0, 0, 0] : [Math.PI, 0, 0]} scale={scale}
      onClick={click} onPointerOver={(event) => { event.stopPropagation(); setHovered(true); onHover(id); }} onPointerOut={() => { setHovered(false); onHover(null); }}>
      <mesh geometry={crown}>
        <meshPhysicalMaterial vertexColors={!crownColor} color={absent ? "#a4b6c4" : crownColor ?? "#ffffff"} emissive="#38bdf8" emissiveIntensity={selected ? 0.18 : hovered ? 0.07 : 0} roughness={0.26} metalness={0} clearcoat={0.42} clearcoatRoughness={0.22} wireframe={absent} />
      </mesh>
      {selected && <mesh geometry={crown} scale={1.035} raycast={() => null}>
        <meshBasicMaterial color="#38bdf8" side={1} transparent opacity={0.75} depthWrite={false} />
      </mesh>}
      {roots && (info.kind === "molar" ? (info.upper ? [[-0.24,0.16],[0.24,0.16],[0,-0.24]] : [[-0.25,0],[0.25,0]]) : info.kind === "premolar" && info.upper ? [[0,-0.15],[0,0.15]] : [[0,0]]).map(([x,z],index) => <mesh key={index} geometry={root} position={[x,0,z]} rotation={[z*0.5,0,-x*0.7]}>
        <meshPhysicalMaterial color={rootColor ?? "#e6c69a"} roughness={0.5} wireframe={absent} />
      </mesh>)}
    </group>
    {indicators.map((indicator,index) => <mesh key={indicator.category} position={[0,(info.upper ? -1 : 1)*(0.30+index*0.09),0]} rotation={[Math.PI/2,0,0]} scale={[scale,scale,scale]}>
      <torusGeometry args={[0.64,0.028,8,32]} /><meshBasicMaterial color={indicator.color} />
    </mesh>)}
    {(selected || hovered) && <ChartLabel text={`${selected ? "✓ " : ""}${label}${hasRecords ? " •" : ""}`} selected={selected} position={[0, info.upper ? -1 : 1, 0]} />}
  </group>;
}
