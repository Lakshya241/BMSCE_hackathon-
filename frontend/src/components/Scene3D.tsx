"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Text, Billboard } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { Camera, Incident, Transaction, ChainNode } from "@/lib/types";

/* ================= shared glow sprite ================= */
function makeGlowTexture(inner = "rgba(255,255,255,1)", outer = "rgba(255,255,255,0)"): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, inner.replace(/,1\)$/, ",.6)"));
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

function Glow({
  position,
  color,
  scale,
  opacity = 1,
  tex,
}: {
  position: [number, number, number];
  color: string;
  scale: number;
  opacity?: number;
  tex: THREE.Texture;
}) {
  return (
    <sprite position={position} scale={[scale, scale, 1]}>
      <spriteMaterial map={tex} color={color} transparent opacity={opacity} blending={THREE.AdditiveBlending} depthWrite={false} />
    </sprite>
  );
}

/* ==================================================================
   1 · INCIDENT CONSTELLATION — glowing stars + constellation lines
   ================================================================== */
const SEV_COLOR: Record<string, string> = {
  low: "#22d3ee",
  medium: "#f59e0b",
  high: "#f97316",
  critical: "#e11d48",
};

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function Star({
  incident,
  index,
  glowTex,
  onDone,
}: {
  incident: Incident;
  index: number;
  glowTex: THREE.Texture;
  onDone: (pos: THREE.Vector3) => void;
}) {
  const color = SEV_COLOR[incident.severity] ?? "#22d3ee";
  const seed = Math.abs(hashStr(incident.id));
  const pos = useMemo(() => {
    const r = 2.4 + ((seed % 100) / 100) * 2.4;
    const theta = ((seed % 360) / 360) * Math.PI * 2;
    const phi = Math.acos(2 * ((seed % 97) / 97) - 1);
    const v = new THREE.Vector3(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi) * 0.55,
      r * Math.sin(phi) * Math.sin(theta)
    );
    return v;
  }, [seed]);

  const shell = useRef<THREE.Mesh>(null);
  const size = 0.1 + (incident.riskScore / 100) * 0.2;

  useEffectOnce(() => onDone(pos));

  useFrame(({ clock }) => {
    if (shell.current) {
      const p = (clock.getElapsedTime() * 0.45 + index * 0.11) % 1;
      shell.current.scale.setScalar(1 + p * 2.6);
      (shell.current.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.5;
    }
  });

  return (
    <group position={pos}>
      {/* core */}
      <mesh>
        <sphereGeometry args={[size * 0.55, 12, 12]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      {/* additive glow */}
      <Glow position={[0, 0, 0]} color={color} scale={size * 7} opacity={0.9} tex={glowTex} />
      {/* supernova ring */}
      <mesh ref={shell}>
        <sphereGeometry args={[size, 12, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.2} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <pointLight intensity={0.5} color={color} distance={2.2} />
    </group>
  );
}

function useEffectOnce(fn: () => void) {
  const done = useRef(false);
  if (!done.current) {
    done.current = true;
    fn();
  }
}

function Nebula({ glowTex }: { glowTex: THREE.Texture }) {
  const dust = useMemo(() => {
    const pts: { pos: [number, number, number]; c: string; s: number }[] = [];
    for (let i = 0; i < 90; i++) {
      const r = 3 + Math.random() * 4;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pts.push({
        pos: [r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi) * 0.6, r * Math.sin(phi) * Math.sin(theta)],
        c: ["#0ea5e9", "#6366f1", "#14b8a6"][i % 3],
        s: 0.6 + Math.random() * 1.6,
      });
    }
    return pts;
  }, []);
  return (
    <group>
      {dust.map((d, i) => (
        <Glow key={i} position={d.pos} color={d.c} scale={d.s} opacity={0.28} tex={glowTex} />
      ))}
    </group>
  );
}

function ConstellationLines({ positions }: { positions: THREE.Vector3[] }) {
  const geo = useMemo(() => {
    if (positions.length < 2) return null;
    const pts: number[] = [];
    for (let i = 0; i < positions.length - 1; i++) {
      pts.push(positions[i].x, positions[i].y, positions[i].z, positions[i + 1].x, positions[i + 1].y, positions[i + 1].z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [positions]);
  if (!geo) return null;
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color="#38bdf8" transparent opacity={0.22} blending={THREE.AdditiveBlending} />
    </lineSegments>
  );
}

function ConstellationSpinner({ children, speed = 0.06 }: { children: React.ReactNode; speed?: number }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, d) => {
    if (g.current) g.current.rotation.y += d * speed;
  });
  return <group ref={g}>{children}</group>;
}

export function IncidentConstellation({ incidents }: { incidents: Incident[] }) {
  const starPositions = useRef<THREE.Vector3[]>([]);
  const glowTex = useMemo(() => makeGlowTexture("rgba(255,255,255,1)", "rgba(255,255,255,0)"), []);
  const stars = incidents.slice(0, 22);

  return (
    <Canvas camera={{ position: [0, 1.2, 7.2], fov: 55 }} dpr={[1, 1.6]} gl={{ alpha: true, antialias: true }}>
      <ambientLight intensity={0.9} />
      <ConstellationSpinner>
        <Nebula glowTex={glowTex} />
        <ConstellationLines positions={starPositions.current} />
        {stars.map((inc, i) => (
          <Star
            key={inc.id}
            incident={inc}
            index={i}
            glowTex={glowTex}
            onDone={(p) => {
              if (!starPositions.current.some((v) => v.equals(p))) starPositions.current.push(p);
            }}
          />
        ))}
        {/* core beacon */}
        <mesh>
          <icosahedronGeometry args={[0.42, 1]} />
          <meshBasicMaterial color="#38bdf8" wireframe transparent opacity={0.7} />
        </mesh>
        <Glow position={[0, 0, 0]} color="#0ea5e9" scale={2.6} opacity={0.8} tex={glowTex} />
      </ConstellationSpinner>
    </Canvas>
  );
}

/* ==================================================================
   2 · BLOCKCHAIN HELIX — real DNA: two backbones + glowing rungs
   ================================================================== */
function HelixDNA({ transactions }: { transactions: Transaction[] }) {
  const glowTex = useMemo(() => makeGlowTexture("rgba(255,255,255,1)", "rgba(255,255,255,0)"), []);
  const txs = transactions.slice(0, 24).reverse();
  const H = 7.2;
  const R = 1.55;
  const turns = 2.2;

  const { strandA, strandB } = useMemo(() => {
    const mk = (offset: number) => {
      const pts: THREE.Vector3[] = [];
      const N = 90;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const ang = t * Math.PI * 2 * turns + offset;
        pts.push(new THREE.Vector3(Math.cos(ang) * R, t * H - H / 2, Math.sin(ang) * R));
      }
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.07, 10, false);
    };
    return { strandA: mk(0), strandB: mk(Math.PI) };
  }, [H, R, turns]);

  const rungs = useMemo(() => {
    return txs.map((tx, i) => {
      const t = txs.length > 1 ? i / (txs.length - 1) : 0.5;
      const ang = t * Math.PI * 2 * turns;
      const y = t * H - H / 2;
      const a = new THREE.Vector3(Math.cos(ang) * R, y, Math.sin(ang) * R);
      const b = new THREE.Vector3(Math.cos(ang + Math.PI) * R, y, Math.sin(ang + Math.PI) * R);
      const color = tx.status === "confirmed" ? "#2dd4bf" : tx.status === "failed" ? "#e11d48" : "#f59e0b";
      return { a, b, color, tx };
    });
  }, [txs, H, R, turns]);

  return (
    <group>
      {/* backbones */}
      <mesh geometry={strandA}>
        <meshStandardMaterial color="#0f172a" emissive="#0891b2" emissiveIntensity={0.7} metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh geometry={strandB}>
        <meshStandardMaterial color="#0f172a" emissive="#6366f1" emissiveIntensity={0.7} metalness={0.6} roughness={0.3} />
      </mesh>
      {/* rungs + nucleotide blocks */}
      {rungs.map((r, i) => {
        const mid = r.a.clone().add(r.b).multiplyScalar(0.5);
        const dir = r.b.clone().sub(r.a);
        const len = dir.length();
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
        return (
          <group key={r.tx.id + i}>
            <mesh position={mid} quaternion={quat}>
              <cylinderGeometry args={[0.028, 0.028, len, 8]} />
              <meshBasicMaterial color={r.color} transparent opacity={0.75} />
            </mesh>
            {[r.a, r.b].map((p, j) => (
              <group key={j} position={p.toArray()}>
                <mesh>
                  <boxGeometry args={[0.26, 0.26, 0.26]} />
                  <meshStandardMaterial color="#f8fafc" emissive={r.color} emissiveIntensity={1.6} metalness={0.4} roughness={0.2} />
                </mesh>
                <Glow position={[0, 0, 0]} color={r.color} scale={0.9} opacity={0.85} tex={glowTex} />
              </group>
            ))}
          </group>
        );
      })}
      {/* ambient dust */}
      {Array.from({ length: 26 }).map((_, i) => {
        const a = (i / 26) * Math.PI * 2;
        const rr = 2.6 + (i % 3) * 0.5;
        return <Glow key={i} position={[Math.cos(a) * rr, ((i * 7) % 20) / 20 * H - H / 2, Math.sin(a) * rr]} color={i % 2 ? "#0ea5e9" : "#6366f1"} scale={0.7} opacity={0.3} tex={glowTex} />;
      })}
    </group>
  );
}

function HelixOrbitCam({ children }: { children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (g.current) g.current.rotation.y = clock.getElapsedTime() * 0.3;
  });
  return <group ref={g}>{children}</group>;
}

export function BlockchainHelix({ transactions }: { transactions: Transaction[] }) {
  return (
    <Canvas camera={{ position: [0, 0.6, 9.2], fov: 50 }} dpr={[1, 1.6]} gl={{ alpha: true, antialias: true }}>
      <ambientLight intensity={1} />
      <pointLight position={[0, 6, 5]} intensity={40} />
      <pointLight position={[-5, -3, 3]} intensity={18} color="#6366f1" />
      <HelixOrbitCam>
        <HelixDNA transactions={transactions} />
      </HelixOrbitCam>
    </Canvas>
  );
}

/* ==================================================================
   3 · NODE GLOBE — dark holo earth, glow pings, billboard labels
   ================================================================== */
const NODE_POS: Record<string, [number, number]> = {
  "us-east": [-0.6, 0.5],
  "us-west": [-1.35, 0.55],
  "eu-west": [0.1, 0.45],
  "eu-north": [0.25, 0.75],
  "ap-south": [1.3, 0.15],
  "sa-east": [-0.5, -0.55],
};

function latLonToVec3(lat: number, lon: number, r: number): THREE.Vector3 {
  const phi = (90 - lat * 30) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

function NodePing({ node, r, glowTex }: { node: ChainNode; r: number; glowTex: THREE.Texture }) {
  const coords = NODE_POS[node.region] ?? [0, 0];
  const pos = useMemo(() => latLonToVec3(coords[1], coords[0], r), [coords, r]);
  const ping = useRef<THREE.Mesh>(null);
  const color = node.status === "active" ? "#2dd4bf" : node.status === "syncing" ? "#f59e0b" : "#e11d48";
  useFrame(({ clock }) => {
    if (ping.current) {
      const p = (clock.getElapsedTime() * 0.6 + (node.id.charCodeAt(4) % 10) / 10) % 1;
      ping.current.position.copy(pos).multiplyScalar(1 + p * 0.14);
      (ping.current.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.55;
    }
  });
  return (
    <group>
      <group position={pos}>
        <mesh>
          <sphereGeometry args={[0.06, 10, 10]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <Glow position={[0, 0, 0]} color={color} scale={0.85} opacity={0.95} tex={glowTex} />
      </group>
      <mesh ref={ping} position={pos}>
        <sphereGeometry args={[0.09, 10, 10]} />
        <meshBasicMaterial color={color} transparent opacity={0.4} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {/* billboard label pushed away from surface */}
      <Billboard position={pos.clone().multiplyScalar(1.22)}>
        <Text fontSize={0.13} color={color} anchorX="center" anchorY="middle" outlineWidth={0.012} outlineColor="#020617">
          {node.region}
        </Text>
      </Billboard>
    </group>
  );
}

function Arc({ from, to, color }: { from: THREE.Vector3; to: THREE.Vector3; color: string }) {
  const geo = useMemo(() => {
    const mid = from.clone().add(to).multiplyScalar(0.5).normalize().multiplyScalar((from.length() + to.length()) / 2 + 0.7);
    const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
    return new THREE.TubeGeometry(curve, 32, 0.012, 6, false);
  }, [from, to]);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (mat.current) mat.current.opacity = 0.35 + Math.sin(clock.getElapsedTime() * 2.4) * 0.2;
  });
  return (
    <mesh geometry={geo}>
      <meshBasicMaterial color={color} transparent opacity={0.4} blending={THREE.AdditiveBlending} ref={mat} />
    </mesh>
  );
}

function GlobeSpinner({ children }: { children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, d) => {
    if (g.current) g.current.rotation.y += d * 0.24;
  });
  return <group ref={g} rotation={[0.18, 0, 0]}>{children}</group>;
}

export function NodeGlobe({ nodes }: { nodes: ChainNode[] }) {
  const r = 2.1;
  const glowTex = useMemo(() => makeGlowTexture("rgba(255,255,255,1)", "rgba(255,255,255,0)"), []);
  const positions = nodes.map((n) => latLonToVec3((NODE_POS[n.region] ?? [0, 0])[1], (NODE_POS[n.region] ?? [0, 0])[0], r + 0.02));

  return (
    <Canvas camera={{ position: [0, 0.8, 6.2], fov: 50 }} dpr={[1, 1.6]} gl={{ alpha: true, antialias: true }}>
      <ambientLight intensity={1} />
      <pointLight position={[5, 3, 5]} intensity={30} />
      <GlobeSpinner>
        {/* dark holo ocean */}
        <mesh>
          <sphereGeometry args={[r, 40, 40]} />
          <meshStandardMaterial color="#0b1526" metalness={0.35} roughness={0.55} />
        </mesh>
        {/* cyan wireframe */}
        <mesh>
          <sphereGeometry args={[r + 0.012, 28, 28]} />
          <meshBasicMaterial color="#22d3ee" wireframe transparent opacity={0.28} />
        </mesh>
        {/* dot matrix continents vibe */}
        {Array.from({ length: 120 }).map((_, i) => {
          const phi = Math.acos(2 * ((i * 37) % 100) / 100 - 1);
          const theta = ((i * 61) % 360) * (Math.PI / 180);
          const rr = r + 0.01;
          return (
            <mesh key={i} position={[rr * Math.sin(phi) * Math.cos(theta), rr * Math.cos(phi), rr * Math.sin(phi) * Math.sin(theta)]}>
              <sphereGeometry args={[0.014, 4, 4]} />
              <meshBasicMaterial color="#67e8f9" transparent opacity={0.5} />
            </mesh>
          );
        })}
        {/* equator + rings */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[r + 0.05, 0.006, 6, 80]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.5} />
        </mesh>
        {nodes.map((n, i) => (
          <NodePing key={n.id} node={n} r={r + 0.03} glowTex={glowTex} />
        ))}
        {positions.slice(0, -1).map((p, i) => (
          <Arc key={i} from={p} to={positions[i + 1]} color="#818cf8" />
        ))}
        {/* atmosphere glow */}
        <Glow position={[0, 0, 0]} color="#0ea5e9" scale={r * 3.4} opacity={0.25} tex={glowTex} />
      </GlobeSpinner>
    </Canvas>
  );
}

/* ==================================================================
   4 · CAMERA CITY (kept, upgraded with glow beacons)
   ================================================================== */
function Tower({ cam, x, z, seedN, glowTex }: { cam: Camera; x: number; z: number; seedN: number; glowTex: THREE.Texture }) {
  const h = 1.2 + ((seedN * 7) % 5) * 0.55;
  const compromised = cam.status === "compromised" || cam.status === "offline";
  const degraded = cam.status === "degraded";
  const color = compromised ? "#e11d48" : degraded ? "#f59e0b" : "#2dd4bf";
  const beacon = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (beacon.current) {
      const m = beacon.current.material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = compromised ? 2 + Math.sin(clock.getElapsedTime() * 8) * 2 : 1.4;
    }
  });
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[0.7, h, 0.7]} />
        <meshStandardMaterial color="#e2e8f0" metalness={0.35} roughness={0.4} />
      </mesh>
      <mesh position={[0, h / 2 + 0.003, 0]}>
        <boxGeometry args={[0.72, h + 0.006, 0.72]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.55} />
      </mesh>
      <mesh position={[0, h + 0.14, 0]}>
        <boxGeometry args={[0.4, 0.18, 0.3]} />
        <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh ref={beacon} position={[0.22, h + 0.14, 0]}>
        <sphereGeometry args={[0.05, 10, 10]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.6} />
      </mesh>
      <Glow position={[0, h + 0.2, 0]} color={color} scale={1.1} opacity={0.8} tex={glowTex} />
      <Billboard position={[0, h + 0.55, 0]}>
        <Text fontSize={0.12} color="#334155" anchorX="center" outlineWidth={0.01} outlineColor="#f8fafc">
          {cam.id}
        </Text>
      </Billboard>
    </group>
  );
}

export function CameraCity({ cameras }: { cameras: Camera[] }) {
  const glowTex = useMemo(() => makeGlowTexture("rgba(255,255,255,1)", "rgba(255,255,255,0)"), []);
  const cams = cameras.slice(0, 8);
  return (
    <Canvas camera={{ position: [6, 4.4, 6.4], fov: 46 }} dpr={[1, 1.6]} gl={{ alpha: true, antialias: true }}>
      <ambientLight intensity={1} />
      <directionalLight position={[6, 8, 4]} intensity={1.4} />
      <gridHelper args={[12, 24, "#94a3b8", "#dbe4ef"]} />
      {cams.map((c, i) => {
        const a = (i / Math.max(1, cams.length)) * Math.PI * 2;
        const r = 2 + ((i * 13) % 3) * 0.5;
        return <Tower key={c.id} cam={c} x={Math.cos(a) * r} z={Math.sin(a) * r} seedN={i + 3} glowTex={glowTex} />;
      })}
    </Canvas>
  );
}
