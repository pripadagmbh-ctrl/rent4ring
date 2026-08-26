import { useMemo } from 'react';
import trackData from '../data/nordschleife.json';

interface Props {
  carPos: { x: number; z: number };
  ghostPos: { x: number; z: number } | null;
}

const VIEW = 100;

/** The real Nordschleife outline, drawn once from the same data the 3D track uses. */
function useTrackPath() {
  return useMemo(() => {
    const pts = trackData.points as { x: number; z: number }[];
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    const spanX = maxX - minX;
    const spanZ = maxZ - minZ;
    const span = Math.max(spanX, spanZ);
    const pad = 6;
    const scale = (VIEW - pad * 2) / span;
    const offX = pad + (VIEW - pad * 2 - spanX * scale) / 2;
    const offZ = pad + (VIEW - pad * 2 - spanZ * scale) / 2;

    const project = (x: number, z: number) => ({
      x: offX + (x - minX) * scale,
      y: offZ + (z - minZ) * scale,
    });

    // Every third point keeps the path light without losing the shape.
    let d = '';
    for (let i = 0; i < pts.length; i += 3) {
      const p = project(pts[i].x, pts[i].z);
      d += `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    }
    d += 'Z';

    const start = project(pts[0].x, pts[0].z);
    return { d, project, start };
  }, []);
}

export default function Minimap({ carPos, ghostPos }: Props) {
  const { d, project, start } = useTrackPath();
  const car = project(carPos.x, carPos.z);
  const ghost = ghostPos ? project(ghostPos.x, ghostPos.z) : null;

  return (
    <div className="minimap">
      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} aria-label="Nordschleife track map">
        <path d={d} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={3.4} strokeLinejoin="round" />
        <path d={d} fill="none" stroke="#e5142b" strokeWidth={1.3} strokeLinejoin="round" />
        {/* Start/finish marker at T13. */}
        <circle cx={start.x} cy={start.y} r={2.6} fill="none" stroke="#fff" strokeWidth={1.1} />
        {ghost && <circle cx={ghost.x} cy={ghost.y} r={2.1} fill="#39c0ff" opacity={0.75} />}
        <circle cx={car.x} cy={car.y} r={3.4} fill="#fff" />
        <circle cx={car.x} cy={car.y} r={5.6} fill="none" stroke="#fff" strokeWidth={0.9} opacity={0.45} />
      </svg>
    </div>
  );
}
