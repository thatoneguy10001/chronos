import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { Panel } from '@/components/Panel';

const CELL = 28;
const ROOM = 10;
const MAP_W = 204;
const MAP_H = 160;

const DIR_ABBR: Record<string, string> = {
  north: 'N', south: 'S', east: 'E', west: 'W',
  northeast: 'NE', northwest: 'NW', southeast: 'SE', southwest: 'SW',
  ne: 'NE', nw: 'NW', se: 'SE', sw: 'SW',
  up: 'U', down: 'D',
};

export function MiniMap() {
  const mapNodes  = useGameStore(s => s.mapNodes);
  const mapEdges  = useGameStore(s => s.mapEdges);
  const currentX  = useGameStore(s => s.mapCurrentX);
  const currentY  = useGameStore(s => s.mapCurrentY);
  const currentId = useGameStore(s => s.currentRoomId);

  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const nodes = Object.values(mapNodes);
  if (nodes.length === 0) return null;

  const cx = MAP_W / 2 - currentX * CELL;
  const cy = MAP_H / 2 - currentY * CELL;
  const toSvg = (x: number, y: number): [number, number] => [cx + x * CELL, cy + y * CELL];

  const hoveredNode = hoveredId ? mapNodes[hoveredId] : null;

  return (
    <Panel label="Map">
      {/* Room name tooltip above the SVG */}
      <div style={{
        height: '1.1em',
        fontSize: '0.65em',
        color: 'var(--text-muted)',
        marginBottom: '0.2rem',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
      }}>
        {hoveredNode ? hoveredNode.name : ''}
      </div>

      <svg
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: 'block', width: '100%', height: 'auto', overflow: 'hidden', background: '#050a05', border: '1px solid #2a3a2a', borderRadius: 2 }}
        onMouseLeave={() => setHoveredId(null)}
      >
        {/* Edges + direction labels */}
        {mapEdges.map((edge, i) => {
          const from = mapNodes[edge.from];
          const to   = mapNodes[edge.to];
          if (!from || !to) return null;
          const [x1, y1] = toSvg(from.x, from.y);
          const [x2, y2] = toSvg(to.x, to.y);
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          const abbr = DIR_ABBR[edge.dir] ?? edge.dir.slice(0, 2).toUpperCase();
          const inView = mx > -10 && mx < MAP_W + 10 && my > -10 && my < MAP_H + 10;
          if (!inView) return null;
          return (
            <g key={i}>
              <line x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="#3a5a3a" strokeWidth={1.5} />
              <rect x={mx - 7} y={my - 6} width={14} height={11} rx={1}
                fill="#050a05" />
              <text x={mx} y={my + 1} textAnchor="middle" dominantBaseline="middle"
                fontSize="7" fill="#5a7a5a" fontFamily="monospace"
                style={{ pointerEvents: 'none' }}>
                {abbr}
              </text>
            </g>
          );
        })}

        {/* Room nodes */}
        {nodes.map(node => {
          const [sx, sy] = toSvg(node.x, node.y);
          const isCurrent = node.id === currentId;
          const isHovered = node.id === hoveredId;
          if (sx < -ROOM || sx > MAP_W + ROOM || sy < -ROOM || sy > MAP_H + ROOM) return null;
          return (
            <g key={node.id}
              onMouseEnter={() => setHoveredId(node.id)}
              style={{ cursor: 'default' }}
            >
              <rect
                x={sx - ROOM} y={sy - ROOM}
                width={ROOM * 2} height={ROOM * 2}
                fill={isCurrent ? '#2a5a2a' : isHovered ? '#1a3a1a' : '#0f1f0f'}
                stroke={isCurrent ? '#5aaa5a' : isHovered ? '#4a7a4a' : '#2a4a2a'}
                strokeWidth={isCurrent ? 1.5 : 1}
              />
              {isCurrent && (
                <text x={sx} y={sy + 1} textAnchor="middle" dominantBaseline="middle"
                  fontSize="9" fill="#8aff8a" fontFamily="monospace"
                  style={{ pointerEvents: 'none' }}>●</text>
              )}
            </g>
          );
        })}
      </svg>
    </Panel>
  );
}
