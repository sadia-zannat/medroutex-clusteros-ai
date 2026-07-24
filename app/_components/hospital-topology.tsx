"use client";

import type { DomainContinuityAssessment } from "@/lib/twin-core/types";

interface HospitalTopologyProps {
  assessments: readonly DomainContinuityAssessment[];
}

const NODES = [
  { id: "power", label: "Power & Backup", x: 50, y: 24 },
  { id: "network", label: "Network Mesh", x: 24, y: 50 },
  { id: "compute", label: "AI Compute", x: 76, y: 50 },
  { id: "oxygen", label: "Oxygen Plant", x: 30, y: 78 },
  { id: "icu", label: "ICU Operations", x: 70, y: 78 },
] as const;

function tone(score: number): { fill: string; stroke: string; text: string } {
  if (score < 40) return { fill: "rgba(239,68,68,.18)", stroke: "#ef4444", text: "#fecaca" };
  if (score < 70) return { fill: "rgba(245,158,11,.18)", stroke: "#f59e0b", text: "#fde68a" };
  return { fill: "rgba(16,185,129,.16)", stroke: "#10b981", text: "#a7f3d0" };
}

export default function HospitalTopology({ assessments }: HospitalTopologyProps) {
  const scores = new Map(assessments.map((assessment) => [assessment.domain, assessment.score]));
  return (
    <figure className="rounded-xl border border-white/10 bg-slate-950/35 p-4">
      <figcaption className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-200">Hospital Continuity Topology</p>
          <p className="text-[11px] text-slate-500">Operational dependency figure · emulated infrastructure</p>
        </div>
        <span className="rounded-full border border-purple-500/20 bg-purple-500/10 px-2 py-1 text-[10px] text-purple-200">Digital Twin View</span>
      </figcaption>
      <svg viewBox="0 0 100 100" role="img" aria-label="Hospital infrastructure topology showing power, network, compute, oxygen, and ICU continuity" className="h-auto w-full min-h-[260px]">
        <defs>
          <marker id="arrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 z" fill="#64748b" /></marker>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1" stdDeviation="1" floodOpacity=".35" /></filter>
        </defs>
        {[["power","network"],["power","compute"],["power","oxygen"],["power","icu"],["network","compute"],["oxygen","icu"],["compute","icu"]].map(([from,to]) => {
          const a=NODES.find((node)=>node.id===from)!; const b=NODES.find((node)=>node.id===to)!;
          return <line key={`${from}-${to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#475569" strokeWidth="0.7" strokeDasharray="2 1.5" markerEnd="url(#arrow)" />;
        })}
        {NODES.map((node) => {
          const score = scores.get(node.id) ?? 100;
          const colors = tone(score);
          return (
            <g key={node.id} transform={`translate(${node.x - 12} ${node.y - 7})`} filter="url(#shadow)">
              <path d="M3 0 H21 L24 3 V13 H0 V3 Z" fill={colors.fill} stroke={colors.stroke} strokeWidth="0.8" />
              <path d="M0 13 H24 L21 16 H3 Z" fill="rgba(15,23,42,.9)" stroke={colors.stroke} strokeWidth="0.5" />
              <text x="12" y="5.2" textAnchor="middle" fontSize="2.4" fill="#e2e8f0">{node.label}</text>
              <text x="12" y="10" textAnchor="middle" fontSize="3.2" fontWeight="700" fill={colors.text}>{score}%</text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
