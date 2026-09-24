import { BufferGeometry, Float32BufferAttribute, Color } from "three";

// Stylized crown with rounded cervical contours and a continuous cusped biting
// surface. This is presentation geometry, not an anatomical or clinical model.
export function crownGeometry(kind: string) {
  const anterior = kind === "incisor" || kind === "canine";
  const width = kind === "molar" ? 0.59 : kind === "premolar" ? 0.44 : 0.43;
  const depth = anterior ? 0.29 : kind === "molar" ? 0.56 : 0.47;
  const points: number[] = [], colors: number[] = [], indices: number[] = [];
  const segments = 48, rings = 22;
  const neck = new Color("#d8bd91"), enamel = new Color("#fff9e9");
  for (let ring = 0; ring <= rings; ring++) {
    const t = ring / rings;
    // First 14 rings form the body, remaining rings close the biting surface.
    const cap = ring >= 14;
    const radius = cap ? Math.max(0.001, 1 - (ring - 14) / 8) : 0.70 + 0.30 * Math.sin(t / (14 / rings) * Math.PI / 2);
    for (let j = 0; j <= segments; j++) {
      const angle = j / segments * Math.PI * 2;
      const exponent = anterior ? 0.68 : 0.64;
      const x = Math.sign(Math.cos(angle)) * Math.pow(Math.abs(Math.cos(angle)), exponent) * width * radius;
      const z = Math.sign(Math.sin(angle)) * Math.pow(Math.abs(Math.sin(angle)), exponent) * depth * radius;
      let y = 0.49 - Math.min(ring / 14, 1) * 1.02;
      if (cap) {
        if (kind === "canine") y -= 0.31 * Math.exp(-9 * ((x / width) ** 2 + (z / depth) ** 2));
        else if (kind === "incisor") y -= 0.06 * (1 - radius * radius);
        else {
          const cusps = kind === "molar" ? [[-0.29,-0.27],[0.29,-0.27],[-0.29,0.27],[0.29,0.27]] : [[0,-0.26],[0,0.26]];
          for (const [cx,cz] of cusps) y -= 0.23 * Math.exp(-((x-cx)**2+(z-cz)**2) / 0.045);
          y += 0.065 * Math.exp(-x*x/0.008) + 0.035 * Math.exp(-z*z/0.009);
        }
      }
      points.push(x, y, z);
      const color = neck.clone().lerp(enamel, Math.min(1, 0.30 + ring / 11));
      if (cap && !anterior) color.multiplyScalar(1 - 0.08 * Math.exp(-(x*x+z*z)/0.035));
      colors.push(color.r,color.g,color.b);
      if (ring < rings && j < segments) {
        const a = ring * (segments + 1) + j, b = a + segments + 1;
        indices.push(a,a+1,b,b,a+1,b+1);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(points,3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function rootGeometry() {
  const points: number[] = [], indices: number[] = [];
  const rings = 18, sides = 24;
  for (let i=0;i<=rings;i++) {
    const t=i/rings;
    const radius=0.23*Math.pow(1-t,0.65)+0.008;
    for(let j=0;j<=sides;j++) {
      const angle=j/sides*Math.PI*2;
      points.push(Math.cos(angle)*radius+0.14*t*t,0.3+1.5*t,Math.sin(angle)*radius);
      if(i<rings&&j<sides) {
        const a=i*(sides+1)+j,b=a+sides+1;
        indices.push(a,b,a+1,b,b+1,a+1);
      }
    }
  }
  const geometry=new BufferGeometry();
  geometry.setAttribute("position",new Float32BufferAttribute(points,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  return geometry;
}
