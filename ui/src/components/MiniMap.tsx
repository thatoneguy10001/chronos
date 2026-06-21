import { useGameStore } from '@/store/gameStore';

const CELL = 28;    // px per grid cell
const ROOM = 10;    // room square half-size
const MAP_W = 204;
const MAP_H = 160;

export function MiniMap() {
  const mapNodes   = useGameStore(s => s.mapNodes);
  const mapEdges   = useGameStore(s => s.mapEdges);
  const currentX   = useGameStore(s => s.mapCurrentX);
  const currentY   = useGameStore(s => s.mapCurrentY);
  const currentId  = useGameStore(s => s.currentRoomId);

  const nodes = Object.values(mapNodes);
  if (nodes.length === 0) return null;

  // Center view on current position
  const cx = MAP_W / 2 - currentX * CELL;
  const cy = MAP_H / 2 - currentY * CELL;

  const toSvg = (x: number, y: number) => [cx + x * CELL, cy + y * CELL] as [number, number];

  return (
    <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
      <div style={{ color: 'var(--text-dim)', fontSize: '0.7em', letterSpacing: '0.1em', marginBottom: '0.3rem', paddingTop: '0.25rem' }}>── MAP ──</div>
      <svg
        width={MAP_W}
        height={MAP_H}
        style={{ display: 'block', overflow: 'hidden', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 2 }}
      >
        {/* Edges */}
        {mapEdges.map((edge, i) => {
          const from = mapNodes[edge.from];
          const to   = mapNodes[edge.to];
          if (!from || !to) return null;
          const [x1, y1] = toSvg(from.x, from.y);
          const [x2, y2] = toSvg(to.x, to.y);
          return (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="var(--border-input)" strokeWidth={1.5} />
          );
        })}

        {/* Room nodes */}
        {nodes.map(node => {
          const [sx, sy] = toSvg(node.x, node.y);
          const isCurrent = node.id === currentId;
          // Clip to visible area
          if (sx < -ROOM || sx > MAP_W + ROOM || sy < -ROOM || sy > MAP_H + ROOM) return null;
          return (
            <g key={node.id}>
              <rect
                x={sx - ROOM} y={sy - ROOM}
                width={ROOM * 2} height={ROOM * 2}
                fill={isCurrent ? 'var(--text-accent)' : 'var(--bg-panel)'}
                stroke={isCurrent ? 'var(--text)' : 'var(--border-input)'}
                strokeWidth={isCurrent ? 1.5 : 1}
              />
              {isCurrent && (
                <text x={sx} y={sy + 1} textAnchor="middle" dominantBaseline="middle"
                  fontSize="8" fill="var(--bg)" fontFamily="monospace">●</text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
