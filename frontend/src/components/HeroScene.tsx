"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Text, Sparkles, Edges } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

export type HeroState = "idle" | "alert" | "verifying" | "verified";

const STATIONS = ["CAMERA", "AI", "HASH", "MST", "VERIFIED"] as const;
const BLOCK_LABELS = ["HASH", "PROOF", "MST", "VERIFY", "SECURE"] as const;

const STATE_COLORS: Record<HeroState, string> = {
  idle: "#0891b2",
  alert: "#e11d48",
  verifying: "#d97706",
  verified: "#65a30d",
};

/* ============ central surveillance camera with animated rings ============ */
function SentryCamera({ state }: { state: HeroState }) {
  const head = useRef<THREE.Group>(null);
  const ring1 = useRef<THREE.Mesh>(null);
  const ring2 = useRef<THREE.Mesh>(null);
  const color = STATE_COLORS[state];

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (head.current) {
      if (state === "alert") head.current.rotation.y = Math.sin(t * 7) * 0.4;
      else if (state === "verifying") head.current.rotation.y = Math.sin(t * 11) * 0.08;
      else head.current.rotation.y = Math.sin(t * 0.5) * 0.55;
    }
    const spin = state === "alert" ? 4 : state === "verifying" ? 2.4 : 0.8;
    if (ring1.current) ring1.current.rotation.z += 0.01 * spin * 6;
    if (ring2.current) ring2.current.rotation.z -= 0.008 * spin * 6;
  });

  return (
    <group position={[0, 0.35, 0]}>
      {/* gyro rings */}
      <mesh ref={ring1} rotation={[Math.PI / 2.4, 0, 0]}>
        <torusGeometry args={[1.7, 0.03, 12, 80]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.6} metalness={0.4} roughness={0.3} />
      </mesh>
      <mesh ref={ring2} rotation={[Math.PI / 1.7, 0.4, 0]}>
        <torusGeometry args={[2.15, 0.018, 12, 90]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.0} transparent opacity={0.7} />
      </mesh>

      <Float speed={2.4} rotationIntensity={0.15} floatIntensity={0.7}>
        <group ref={head} rotation={[0.1, 0, 0]}>
          {/* mount */}
          <mesh position={[0, 1.05, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 0.9, 16]} />
            <meshStandardMaterial color="#334155" metalness={0.85} roughness={0.3} />
          </mesh>
          <mesh position={[0, 1.5, 0]}>
            <cylinderGeometry args={[0.28, 0.28, 0.12, 24]} />
            <meshStandardMaterial color="#475569" metalness={0.9} roughness={0.25} />
          </mesh>
          {/* body */}
          <mesh>
            <boxGeometry args={[1.5, 0.72, 0.78]} />
            <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.25} emissive={color} emissiveIntensity={0.12} />
          </mesh>
          {/* glow edges */}
          {[0.37, -0.37].map((y, i) => (
            <mesh key={i} position={[0, y, 0]}>
              <boxGeometry args={[1.56, 0.035, 0.82]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.6} />
            </mesh>
          ))}
          {/* status strip */}
          <mesh position={[0, 0.47, 0]}>
            <boxGeometry args={[1.2, 0.07, 0.5]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={state === "idle" ? 1.6 : 3.4} />
          </mesh>
          {/* lens */}
          <mesh position={[0.95, -0.05, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.26, 0.3, 0.55, 32]} />
            <meshStandardMaterial color="#0f172a" metalness={0.7} roughness={0.35} />
          </mesh>
          <mesh position={[1.24, -0.05, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.2, 0.2, 0.06, 32]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} />
          </mesh>
          {/* IR ring */}
          {Array.from({ length: 8 }).map((_, i) => {
            const a = (i / 8) * Math.PI * 2;
            return (
              <mesh key={i} position={[1.28, -0.05 + Math.sin(a) * 0.3, Math.cos(a) * 0.3]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.035, 0.035, 0.05, 12]} />
                <meshStandardMaterial color="#1e293b" emissive={color} emissiveIntensity={1.4} />
              </mesh>
            );
          })}
        </group>
      </Float>
    </group>
  );
}

/* ============ orbiting chain blocks (double helix) ============ */
function ChainBlocks({ state }: { state: HeroState }) {
  const orbit = useRef<THREE.Group>(null);
  const color = STATE_COLORS[state];
  useFrame((_, delta) => {
    if (!orbit.current) return;
    const speed = state === "alert" ? 2.2 : state === "verifying" ? 1.5 : 0.4;
    orbit.current.rotation.y += delta * speed * 0.5;
  });
  return (
    <group ref={orbit}>
      {BLOCK_LABELS.map((label, i) => {
        const angle = (i / BLOCK_LABELS.length) * Math.PI * 2;
        const r = 3.15;
        const y = Math.sin(angle * 2) * 0.65;
        return (
          <group key={label} position={[Math.cos(angle) * r, y, Math.sin(angle) * r]} rotation={[0, -angle, 0]}>
            <Float speed={3.4} floatIntensity={1} rotationIntensity={0.5}>
              <mesh>
                <boxGeometry args={[0.62, 0.62, 0.62]} />
                <meshStandardMaterial color="#f8fafc" metalness={0.3} roughness={0.2} emissive={color} emissiveIntensity={0.35} />
              </mesh>
              <mesh scale={1.06}>
                <boxGeometry args={[0.62, 0.62, 0.62]} />
                <meshStandardMaterial color={color} transparent opacity={0.16} emissive={color} emissiveIntensity={1} />
              </mesh>
              <Edges color={color} />
              <Text position={[0, 0, 0.34]} fontSize={0.15} color={state === "idle" ? "#0f172a" : color} anchorX="center" anchorY="middle" letterSpacing={0.1}>
                {label}
              </Text>
            </Float>
          </group>
        );
      })}
    </group>
  );
}

/* ============ particle pipeline + station nodes ============ */
function Pipeline({ state }: { state: HeroState }) {
  const group = useRef<THREE.Group>(null);
  const color = STATE_COLORS[state];

  const curve = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const n = STATIONS.length;
    for (let i = 0; i < n; i++) {
      const a = Math.PI * 0.8 + (i / (n - 1)) * Math.PI * 1.0;
      const r = 4.7;
      pts.push(new THREE.Vector3(Math.cos(a) * r, -1.9 + Math.sin(i * 1.5) * 0.45, Math.sin(a) * r * 0.5 + 1.9));
    }
    return new THREE.CatmullRomCurve3(pts);
  }, []);

  const particles = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        t: (i / 70 + Math.random() * 0.008) % 1,
        speed: 0.05 + Math.random() * 0.05,
      })),
    []
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((_, delta) => {
    if (!group.current) return;
    const mult = state === "alert" ? 4.6 : state === "verifying" ? 2.8 : 1;
    group.current.children.forEach((child, i) => {
      const p = particles[i];
      if (!p) return;
      p.t = (p.t + delta * p.speed * mult) % 1;
      curve.getPointAt(p.t, dummy.position);
      dummy.scale.setScalar(state === "idle" ? 1 : 1.7);
      dummy.updateMatrix();
      child.matrix.copy(dummy.matrix);
    });
  });

  return (
    <group>
      <group ref={group}>
        {particles.map((_, i) => (
          <mesh key={i} matrixAutoUpdate={false}>
            <sphereGeometry args={[0.045, 8, 8]} />
            <meshBasicMaterial color={color} transparent opacity={0.95} />
          </mesh>
        ))}
      </group>
      {STATIONS.map((label, i) => {
        const a = Math.PI * 0.8 + (i / (STATIONS.length - 1)) * Math.PI * 1.0;
        const r = 4.7;
        const pos: [number, number, number] = [Math.cos(a) * r, -1.9 + Math.sin(i * 1.5) * 0.45, Math.sin(a) * r * 0.5 + 1.9];
        const stationColor = label === "MST" && state !== "idle" ? (state === "verified" ? "#65a30d" : "#e11d48") : color;
        return (
          <group key={label} position={pos}>
            <Float speed={4} floatIntensity={0.9} rotationIntensity={1}>
              <mesh>
                <icosahedronGeometry args={[0.26, 1]} />
                <meshStandardMaterial color="#f8fafc" emissive={stationColor} emissiveIntensity={1.9} metalness={0.5} roughness={0.25} />
              </mesh>
              <mesh scale={1.5}>
                <icosahedronGeometry args={[0.26, 1]} />
                <meshStandardMaterial color={stationColor} wireframe transparent opacity={0.35} />
              </mesh>
            </Float>
            <Text position={[0, -0.6, 0]} fontSize={0.21} color={stationColor} anchorX="center" letterSpacing={0.16}>
              {label}
            </Text>
          </group>
        );
      })}
    </group>
  );
}

/* ============ grid floor with pulse ============ */
function GridFloor({ state }: { state: HeroState }) {
  const grid = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!grid.current) return;
    const t = clock.getElapsedTime();
    grid.current.position.z = ((t * (state === "idle" ? 0.6 : 2.4)) % 1) - 0.5;
  });
  return (
    <group ref={grid} position={[0, -2.6, 0]}>
      <gridHelper args={[24, 24, STATE_COLORS[state], "#dbe4ef"]} />
      <gridHelper args={[24, 6, "#e2e8f0", "#eef2f7"]} position={[0, 0.001, 0]} />
    </group>
  );
}

/* ============ shockwave ring on state change (double pulse) ============ */
function Shockwave({ state }: { state: HeroState }) {
  const ring = useRef<THREE.Mesh>(null);
  const ring2 = useRef<THREE.Mesh>(null);
  const progress = useRef(0);
  const prevState = useRef(state);
  useFrame((_, delta) => {
    if (!ring.current || !ring2.current) return;
    if (prevState.current !== state) {
      prevState.current = state;
      progress.current = 0;
    }
    if (progress.current < 1) {
      progress.current = Math.min(1, progress.current + delta * 0.9);
      const p = progress.current;
      ring.current.scale.setScalar(0.5 + p * 5.5);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.55;
      const p2 = Math.max(0, p - 0.15) / 0.85;
      ring2.current.scale.setScalar(0.5 + p2 * 4.2);
      (ring2.current.material as THREE.MeshBasicMaterial).opacity = (1 - p2) * 0.35;
    }
  });
  return (
    <group>
      <mesh ref={ring} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.3, 0]}>
        <torusGeometry args={[1, 0.05, 8, 64]} />
        <meshBasicMaterial color={STATE_COLORS[state]} transparent opacity={0} />
      </mesh>
      <mesh ref={ring2} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.3, 0]}>
        <torusGeometry args={[1.3, 0.03, 8, 64]} />
        <meshBasicMaterial color={STATE_COLORS[state]} transparent opacity={0} />
      </mesh>
    </group>
  );
}

/* ============ hex AI core with orbiting moons + torus knot ============ */
function HexCore({ state }: { state: HeroState }) {
  const core = useRef<THREE.Mesh>(null);
  const knot = useRef<THREE.Mesh>(null);
  const moons = useRef<THREE.Group>(null);
  const color = STATE_COLORS[state];
  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime();
    if (core.current) {
      core.current.rotation.y += delta * (state === "idle" ? 0.25 : 1.2);
      core.current.rotation.x = Math.sin(t * 0.4) * 0.25;
    }
    if (knot.current) knot.current.rotation.z += delta * 0.35;
    if (moons.current) moons.current.rotation.y = t * 0.5;
  });
  return (
    <group position={[-3.4, 1.1, -1]}>
      <mesh ref={core}>
        <cylinderGeometry args={[0.42, 0.42, 0.5, 6]} />
        <meshStandardMaterial color="#f8fafc" emissive={color} emissiveIntensity={0.7} metalness={0.5} roughness={0.25} />
      </mesh>
      <mesh scale={1.25}>
        <cylinderGeometry args={[0.42, 0.42, 0.5, 6]} />
        <meshStandardMaterial color={color} wireframe transparent opacity={0.45} />
      </mesh>
      <mesh ref={knot} scale={0.42}>
        <torusKnotGeometry args={[1.5, 0.14, 80, 10]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.55} transparent opacity={0.5} />
      </mesh>
      <group ref={moons}>
        {[0.85, 1.15, 1.45].map((r, i) => (
          <group key={i} rotation={[0.3 + i * 0.4, 0, 0.12 * i]}>
            <mesh position={[Math.cos(i * 2.1) * r, 0, Math.sin(i * 2.1) * r]}>
              <icosahedronGeometry args={[0.07 + i * 0.02, 0]} />
              <meshStandardMaterial color="#f8fafc" emissive={color} emissiveIntensity={1.8} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

/* ============ pointer parallax wrapper ============ */
function ParallaxRig({ children }: { children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  const target = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const move = (e: PointerEvent) => {
      target.current = {
        x: (e.clientX / window.innerWidth - 0.5) * 0.35,
        y: (e.clientY / window.innerHeight - 0.5) * 0.22,
      };
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, []);
  useFrame(() => {
    if (!g.current) return;
    g.current.rotation.y = THREE.MathUtils.lerp(g.current.rotation.y, target.current.x, 0.045);
    g.current.rotation.x = THREE.MathUtils.lerp(g.current.rotation.x, target.current.y, 0.045);
  });
  return <group ref={g}>{children}</group>;
}

function Rig({ state }: { state: HeroState }) {
  useFrame(({ camera, clock }) => {
    const t = clock.getElapsedTime();
    camera.position.x = Math.sin(t * 0.12) * 0.6;
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, 0.7 + Math.sin(t * 0.2) * 0.15, 0.04);
    camera.lookAt(0, 0, 0);
  });
  return (
    <>
      <ambientLight intensity={1.05} />
      <directionalLight position={[4, 6, 4]} intensity={1.6} color={STATE_COLORS[state]} />
      <directionalLight position={[-4, -2, -3]} intensity={0.5} color="#6366f1" />
      <pointLight position={[-5, 2, 3]} intensity={state === "idle" ? 45 : 90} color={STATE_COLORS[state]} distance={22} />
      <pointLight position={[3, -1, 4]} intensity={30} color="#6366f1" distance={18} />
    </>
  );
}

export default function HeroScene({ state = "idle" }: { state?: HeroState }) {
  const color = STATE_COLORS[state];
  return (
    <Canvas camera={{ position: [0, 0.7, 8.6], fov: 52 }} dpr={[1, 1.75]} gl={{ antialias: true, alpha: true }}>
      <Rig state={state} />
      <ParallaxRig>
        <SentryCamera state={state} />
        <ChainBlocks state={state} />
        <Pipeline state={state} />
        <GridFloor state={state} />
        <Shockwave state={state} />
        <HexCore state={state} />
      </ParallaxRig>
      <Sparkles count={140} scale={[15, 8, 8]} size={2} speed={0.5} color={color} opacity={0.6} />
    </Canvas>
  );
}
