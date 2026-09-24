import { useEffect, useMemo } from "react";
import { BufferGeometry, CatmullRomCurve3, Color, Float32BufferAttribute, Vector3 } from "three";
import { toothInfo } from "@clinic/shared";
import { toothPosition } from "./tooth-layout";

export function GumArch({ teeth, mixed }: { teeth: number[]; mixed: boolean }) {
  const geometry = useMemo(() => {
    const ordered = [...teeth].sort((a,b) => {
      const x=toothInfo(a),y=toothInfo(b);
      return (x.right?-x.position:x.position)-(y.right?-y.position:y.position);
    });
    const info=toothInfo(ordered[0]);
    const sign=info.upper?1:-1, scale=info.primary?0.78:1;
    const centers=ordered.map((id)=>new Vector3(...toothPosition(id,mixed)));
    const curve=new CatmullRomCurve3(centers);
    const positions:number[]=[], colors:number[]=[], indices:number[]=[];
    const rings=160,sides=40;
    const margin=new Color("#e99ba3"),tissue=new Color("#bf6178");
    // Elliptical tissue volume with scalloped margins around each tooth neck.
    for(let i=0;i<=rings;i++) {
      const u=i/rings,p=curve.getPoint(u);
      const radial=new Vector3(p.x,0,p.z+3).normalize();
      const distance=Math.min(...centers.map((c)=>c.distanceTo(p)));
      const scallop=0.17*scale*Math.exp(-distance*distance/(0.14*scale*scale));
      const end=0.15+0.85*Math.sin(Math.min(1,Math.min(u,1-u)/0.07)*Math.PI/2);
      for(let j=0;j<=sides;j++) {
        const angle=j/sides*Math.PI*2;
        const towardsCrown=Math.max(0,-sign*Math.sin(angle));
        const width=0.66*scale*end*Math.cos(angle);
        const y=p.y+sign*0.81*scale+0.48*scale*end*Math.sin(angle)+sign*scallop*towardsCrown*towardsCrown;
        positions.push(p.x+radial.x*width,y,p.z+radial.z*width);
        const color=tissue.clone().lerp(margin,0.22+0.65*towardsCrown);
        colors.push(color.r,color.g,color.b);
        if(i<rings&&j<sides) {
          const a=i*(sides+1)+j,b=a+sides+1;
          indices.push(a,b,a+1,b,b+1,a+1);
        }
      }
    }
    for(const end of [0,rings]) {
      const p=curve.getPoint(end/rings),center=positions.length/3;
      positions.push(p.x,p.y+sign*0.81*scale,p.z);
      colors.push(tissue.r,tissue.g,tissue.b);
      for(let j=0;j<sides;j++) {
        const a=end*(sides+1)+j;
        if(end===0) indices.push(center,a,a+1);
        else indices.push(center,a+1,a);
      }
    }
    const result=new BufferGeometry();
    result.setAttribute("position",new Float32BufferAttribute(positions,3));
    result.setAttribute("color",new Float32BufferAttribute(colors,3));
    result.setIndex(indices);result.computeVertexNormals();
    return result;
  },[teeth,mixed]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  return <mesh geometry={geometry}>
    <meshPhysicalMaterial vertexColors roughness={0.52} clearcoat={0.16} clearcoatRoughness={0.42} />
  </mesh>;
}
