import { Component, useEffect, useRef, useState, type ReactNode, type ComponentRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useTranslation } from "react-i18next";
import { ToothModel } from "./ToothModel";
import { ChartLabel } from "./ChartLabel";
import { GumArch } from "./GumArch";
import { toothInfo } from "@clinic/shared";
import type { ProcedureVisual } from "./procedure-visuals";
import { Plus, Minus, RotateCcw } from "lucide-react";

export type CameraView = "front" | "upper" | "lower";
type Props = {
  teeth: number[]; selected: number[]; mixed: boolean; roots: boolean; gums: boolean;
  absent: number[]; recorded: number[]; view: CameraView; reset: number;
  onSelect: (id: number) => void;
  indicators?: Record<number, ProcedureVisual[]>;
  displayControl?: ReactNode;
  onReset: () => void;
};
class CanvasBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
function Camera({ view, reset, mixed, zoom }: Pick<Props, "view" | "reset" | "mixed"> & { zoom: { tick: number; factor: number } }) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const { camera, invalidate } = useThree();
  useEffect(() => {
    const distance = mixed ? 23 : 19;
    if (view === "upper") { camera.position.set(0, -distance, 1); camera.up.set(0, 0, 1); }
    else if (view === "lower") { camera.position.set(0, distance, 1); camera.up.set(0, 0, -1); }
    else { camera.position.set(0, 2, distance); camera.up.set(0, 1, 0); }
    controls.current?.target.set(0, 0, 0);
    camera.lookAt(0, 0, 0);
    controls.current?.update();
    invalidate();
  }, [view, reset, mixed, camera, invalidate]);
  useEffect(() => {
    if (!zoom.tick || !controls.current) return;
    const target = controls.current.target;
    const offset = camera.position.clone().sub(target);
    const distance = Math.max(9, Math.min(55, offset.length() * zoom.factor));
    camera.position.copy(target).add(offset.setLength(distance));
    controls.current.update();
    invalidate();
  }, [zoom, camera, invalidate]);
  return <OrbitControls ref={controls} makeDefault minDistance={9} maxDistance={55} enablePan enableZoom enableRotate />;
}
export default function OdontogramCanvas(props: Props) {
  const { t } = useTranslation();
  const [hover, setHover] = useState<number | null>(null);
  const [lost, setLost] = useState(false);
  const [zoom, setZoom] = useState({ tick: 0, factor: 1 });
  const fallback = <div role="status" className="flex h-full items-center justify-center p-6 text-center text-sm text-muted">{t("odWebglFallback")}</div>;
  return <div className="relative h-[340px] overflow-hidden rounded-xl border border-line bg-soft" aria-label={t("twOdontogram")}>
    {lost ? fallback : <CanvasBoundary fallback={fallback}>
      <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ position: [0, 2, 24], fov: 48 }} fallback={fallback}
        onCreated={({ gl }) => { gl.domElement.addEventListener("webglcontextlost", () => setLost(true), { once: true }); }}>
        <hemisphereLight args={["#e4f3ff", "#c1aaa0", 0.85]} />
        <directionalLight position={[-5, 8, 10]} intensity={2.0} color="#fff0da" />
        <directionalLight position={[7, 1, 5]} intensity={0.7} color="#d7eaff" />
        <directionalLight position={[0, -8, 9]} intensity={1.0} color="#fff5e8" />
        <directionalLight position={[0, -5, -8]} intensity={1.3} color="#ffe4d6" />
        {props.gums && [false,true].flatMap((primary) => [false,true].map((upper) => {
          const teeth=props.teeth.filter((id)=>toothInfo(id).primary===primary&&toothInfo(id).upper===upper);
          return teeth.length > 1 ? <GumArch key={String(primary)+String(upper)} teeth={teeth} mixed={props.mixed} /> : null;
        }))}
        <Camera view={props.view} reset={props.reset} mixed={props.mixed} zoom={zoom} />
        <ChartLabel text={t("odPatientRight")} position={[-7.6, 0, 0]} pixelHeight={22} />
        <ChartLabel text={t("odPatientLeft")} position={[7.6, 0, 0]} pixelHeight={22} />
        {props.teeth.map((id) => <ToothModel key={id} id={id} selected={props.selected.includes(id)} mixed={props.mixed}
          roots={props.roots} gums={props.gums} absent={props.absent.includes(id)} hasRecords={props.recorded.includes(id)}
          indicators={props.indicators?.[id]} label={t("odTooth", { id })} onSelect={props.onSelect} onHover={setHover} />)}
      </Canvas>
    </CanvasBoundary>}
    <div className="absolute right-3 top-3">{props.displayControl}</div>
    <div className="absolute right-3 top-14 flex flex-col gap-2">
      <button type="button" className="rounded border border-line bg-surface p-2 text-ink shadow-sm hover:bg-accent-soft" aria-label={t("odResetCamera")} title={t("odResetCamera")} onClick={props.onReset}><RotateCcw size={16}/></button>
      <button type="button" className="rounded border border-line bg-surface p-2 text-ink shadow-sm hover:bg-accent-soft" aria-label={t("odZoomIn")} title={t("odZoomIn")} onClick={() => setZoom((z) => ({ tick: z.tick + 1, factor: 0.8 }))}><Plus size={16}/></button>
      <button type="button" className="rounded border border-line bg-surface p-2 text-ink shadow-sm hover:bg-accent-soft" aria-label={t("odZoomOut")} title={t("odZoomOut")} onClick={() => setZoom((z) => ({ tick: z.tick + 1, factor: 1.25 }))}><Minus size={16}/></button>
    </div>
    <div className={`pointer-events-none absolute bottom-2 left-3 max-w-[80%] rounded border border-line bg-surface px-3 py-1.5 text-ink shadow-sm ${hover ? "text-sm font-bold" : "text-xs"}`}>
      {hover ? t("odTooth", { id: hover }) : t("odNavigate")}
    </div>
  </div>;
}
