import { useEffect, useMemo } from "react";
import { CanvasTexture, SRGBColorSpace, PerspectiveCamera } from "three";
import { useThree } from "@react-three/fiber";

// Local canvas textures avoid DOM portals and remote font/model requests.
export function ChartLabel({ text, position, selected = false, pixelHeight = 24 }: {
  text: string; position: [number, number, number]; selected?: boolean; pixelHeight?: number;
}) {
  const { camera, size } = useThree();
  // Non-attenuated sprites retain a readable screen size at every zoom distance.
  const height = pixelHeight / Math.max(size.height, 1) *
    (camera instanceof PerspectiveCamera ? 2 * Math.tan(camera.fov * Math.PI / 360) : 2);
  const { texture, ratio } = useMemo(() => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d")!;
    context.font = "700 54px sans-serif";
    canvas.width = Math.ceil(context.measureText(text).width + 40);
    canvas.height = 88;
    context.fillStyle = selected ? "#075985" : "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = selected ? "#38bdf8" : "#64748b";
    context.lineWidth = 4;
    context.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
    context.font = "700 54px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = selected ? "#ffffff" : "#0f172a";
    context.fillText(text, canvas.width / 2, 44);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return { texture, ratio: canvas.width / canvas.height };
  }, [text, selected]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <sprite position={position} scale={[height * ratio, height, 1]} renderOrder={10} raycast={() => null}>
    <spriteMaterial map={texture} transparent sizeAttenuation={false} toneMapped={false} depthTest={false} depthWrite={false} />
  </sprite>;
}
