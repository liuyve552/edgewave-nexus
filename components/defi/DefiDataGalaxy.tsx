"use client";

import React, { memo, useCallback, useMemo, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import type { Line2 } from "three-stdlib";

import type { ProtocolId, ProtocolsData } from "@/contracts/defi";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

type PlanetConfig = {
  id: ProtocolId;
  label: string;
  position: [number, number, number];
  radius: number;
  color: string;
  haloColor: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function colorFromTvl(tvl: number) {
  const t = clamp(Math.log10(Math.max(1, tvl + 1)) / 6, 0, 1);
  const c1 = new THREE.Color("#0ea5e9"); // cyan
  const c2 = new THREE.Color("#a855f7"); // violet
  return c1.lerp(c2, t).getStyle();
}

const Planet = memo(function Planet({
  cfg,
  metrics,
  hovered,
  selected,
  onHover,
  onSelect,
}: {
  cfg: PlanetConfig;
  metrics: ProtocolsData["protocols"][ProtocolId];
  hovered: boolean;
  selected: boolean;
  onHover: (id: ProtocolId | null) => void;
  onSelect: (id: ProtocolId) => void;
}) {
  const ref = React.useRef<THREE.Mesh>(null);
  const haloRef = React.useRef<THREE.Mesh>(null);

  useFrame((_, dt) => {
    if (ref.current) {
      ref.current.rotation.y += dt * 0.35;
      ref.current.rotation.x += dt * 0.08;
    }
    if (haloRef.current) {
      haloRef.current.rotation.z -= dt * 0.2;
      const s = 1.4 + Math.sin(performance.now() / 500) * 0.03;
      haloRef.current.scale.setScalar(s);
    }
  });

  return (
    <group position={cfg.position}>
      <mesh
        ref={ref}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(cfg.id);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onHover(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(cfg.id);
        }}
      >
        <sphereGeometry args={[cfg.radius, 48, 48]} />
        <meshStandardMaterial
          color={cfg.color}
          emissive={new THREE.Color(cfg.color)}
          emissiveIntensity={hovered || selected ? 0.75 : 0.35}
          roughness={0.35}
          metalness={0.25}
        />
      </mesh>

      {/* Halo */}
      <mesh ref={haloRef}>
        <ringGeometry args={[cfg.radius * 1.25, cfg.radius * 1.75, 64]} />
        <meshBasicMaterial
          color={cfg.haloColor}
          transparent
          opacity={metrics.health === "ok" ? 0.35 : 0.15}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {hovered ? (
        <Html distanceFactor={10} center>
          <div className="pointer-events-none rounded-md border bg-background/80 px-3 py-2 text-xs shadow-sm backdrop-blur">
            <div className="font-medium">{cfg.label}</div>
            <div className="text-muted-foreground">TVL≈${metrics.tvlUsdApprox.toFixed(2)}</div>
            <div className="text-muted-foreground">Vol(24h)≈${metrics.volumeUsdApprox24h.toFixed(2)}</div>
          </div>
        </Html>
      ) : null}
    </group>
  );
});

const EnergyLines = memo(function EnergyLines({ cfgs }: { cfgs: PlanetConfig[] }) {
  const lines = useMemo(() => {
    const pairs: Array<[PlanetConfig, PlanetConfig]> = [];
    for (let i = 0; i < cfgs.length; i += 1) {
      for (let j = i + 1; j < cfgs.length; j += 1) pairs.push([cfgs[i], cfgs[j]]);
    }
    return pairs.map(([a, b], idx) => ({
      key: `${a.id}-${b.id}`,
      a: a.position,
      b: b.position,
      speed: 0.006 + idx * 0.001,
    }));
  }, [cfgs]);

  return (
    <group>
      {lines.map((l) => (
        <EnergyLine key={l.key} a={l.a} b={l.b} speed={l.speed} />
      ))}
    </group>
  );
});

const EnergyLine = memo(function EnergyLine({
  a,
  b,
  speed,
}: {
  a: [number, number, number];
  b: [number, number, number];
  speed: number;
}) {
  const ref = React.useRef<Line2 | null>(null);
  useFrame(() => {
    const anyMat = (ref.current as unknown as { material?: { dashOffset?: number } } | null)?.material;
    if (anyMat) anyMat.dashOffset = (anyMat.dashOffset ?? 0) - speed;
  });

  return (
    <Line
      ref={ref}
      points={[a, b]}
      color={"#38bdf8"}
      lineWidth={1}
      transparent
      opacity={0.35}
      dashed
      dashSize={0.25}
      gapSize={0.18}
    />
  );
});

export const DefiDataGalaxy = memo(function DefiDataGalaxy({ protocolsData }: { protocolsData: ProtocolsData }) {
  const [hovered, setHovered] = useState<ProtocolId | null>(null);
  const [selected, setSelected] = useState<ProtocolId>("uniswap_v3");

  const onHover = useCallback((id: ProtocolId | null) => setHovered(id), []);
  const onSelect = useCallback((id: ProtocolId) => setSelected(id), []);

  const cfgs = useMemo<PlanetConfig[]>(() => {
    const p = protocolsData.protocols;
    const scale = (tvl: number) => clamp(0.55 + Math.log10(Math.max(1, tvl + 1)) * 0.18, 0.55, 1.35);
    return [
      {
        id: "uniswap_v3",
        label: "Uniswap V3",
        position: [-2.2, 0.2, 0],
        radius: scale(p.uniswap_v3.tvlUsdApprox),
        color: colorFromTvl(p.uniswap_v3.tvlUsdApprox),
        haloColor: "#38bdf8",
      },
      {
        id: "aave",
        label: "Aave",
        position: [0.8, 1.3, -0.4],
        radius: scale(p.aave.tvlUsdApprox),
        color: colorFromTvl(p.aave.tvlUsdApprox),
        haloColor: "#a78bfa",
      },
      {
        id: "compound",
        label: "Compound",
        position: [2.4, -0.3, 0.2],
        radius: scale(p.compound.tvlUsdApprox),
        color: colorFromTvl(p.compound.tvlUsdApprox),
        haloColor: "#34d399",
      },
    ];
  }, [protocolsData]);

  const selectedCfg = cfgs.find((c) => c.id === selected);
  const selectedMetrics = protocolsData.protocols[selected];

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_360px]">
      <div className="relative h-[520px] overflow-hidden rounded-xl border bg-gradient-to-b from-background to-muted/30">
        <Canvas
          camera={{ position: [0, 0, 7], fov: 55 }}
          onPointerMissed={() => setHovered(null)}
        >
          <color attach="background" args={["#05070f"]} />
          <ambientLight intensity={0.55} />
          <pointLight position={[6, 6, 6]} intensity={1.2} />
          <pointLight position={[-6, -4, 4]} intensity={0.8} color={"#60a5fa"} />
          <OrbitControls enablePan={false} enableZoom={false} maxPolarAngle={Math.PI * 0.65} minPolarAngle={Math.PI * 0.35} />

          <EnergyLines cfgs={cfgs} />
          {cfgs.map((cfg) => (
            <Planet
              key={cfg.id}
              cfg={cfg}
              metrics={protocolsData.protocols[cfg.id]}
              hovered={hovered === cfg.id}
              selected={selected === cfg.id}
              onHover={onHover}
              onSelect={onSelect}
            />
          ))}

          {/* subtle starfield */}
          <mesh>
            <sphereGeometry args={[40, 32, 32]} />
            <meshBasicMaterial color="#020617" side={THREE.BackSide} />
          </mesh>
        </Canvas>

        <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2">
          <Badge variant="secondary">3D DeFi Galaxy</Badge>
          <Badge variant={protocolsData.protocols[selected].health === "ok" ? "default" : "destructive"}>
            {protocolsData.protocols[selected].health}
          </Badge>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">{selectedCfg?.label ?? "Protocol"}</div>
          <Badge variant="secondary">Updated {new Date(protocolsData.updatedAt).toLocaleTimeString()}</Badge>
        </div>
        <Separator className="my-3" />
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">TVL≈</span>
            <span className="font-mono">${selectedMetrics.tvlUsdApprox.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Volume(24h)≈</span>
            <span className="font-mono">${selectedMetrics.volumeUsdApprox24h.toFixed(2)}</span>
          </div>
          {selectedMetrics.notes ? (
            <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              {selectedMetrics.notes}
            </div>
          ) : null}
          <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
            Tip: Hover to reveal inline annotations, click a planet to pin details here.
          </div>
        </div>
      </Card>
    </div>
  );
});
