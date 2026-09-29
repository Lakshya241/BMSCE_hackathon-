"use client";

import { CSSProperties, ReactNode, useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

/* ============ global mouse spotlight (dark sections) ============ */
export function Spotlight({ color = "rgba(56,189,248,.14)" }: { color?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const move = (e: MouseEvent) => {
      el.style.setProperty("--sx", `${e.clientX}px`);
      el.style.setProperty("--sy", `${e.clientY}px`);
    };
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, []);
  return (
    <div
      ref={ref}
      className="pointer-events-none fixed inset-0 z-[5]"
      style={{
        background: `radial-gradient(520px circle at var(--sx, 50%) var(--sy, 30%), ${color}, transparent 65%)`,
        mixBlendMode: "screen",
      }}
    />
  );
}

/* ============ scroll progress bar ============ */
export function ScrollProgress() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      setP(h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div className="fixed top-0 left-0 right-0 z-[60] h-[3px] bg-transparent">
      <div
        className="h-full animated-gradient transition-[width] duration-75"
        style={{ width: `${p * 100}%`, boxShadow: "0 0 12px rgba(8,145,178,.8)" }}
      />
    </div>
  );
}

/* ============ count-up number ============ */
export function CountUp({ value, duration = 1.2, className = "", style }: { value: number; duration?: number; className?: string; style?: CSSProperties }) {
  const [display, setDisplay] = useState(0);
  const startRef = useRef<number | null>(null);
  const prevRef = useRef(0);
  useEffect(() => {
    let raf: number;
    const from = prevRef.current;
    const tick = (t: number) => {
      if (startRef.current === null) startRef.current = t;
      const p = Math.min(1, (t - startRef.current) / (duration * 1000));
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else prevRef.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return (
    <span className={className} style={style}>
      {display}
    </span>
  );
}

/* ============ scramble / decode text ============ */
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&@≡∆ΣΩ";
export function Scramble({ text, className = "", speed = 28 }: { text: string; className?: string; speed?: number }) {
  const [out, setOut] = useState(text.replace(/./g, " "));
  useEffect(() => {
    let frame = 0;
    const total = text.length;
    const iv = setInterval(() => {
      frame++;
      const revealed = Math.floor(frame / 2);
      const next = text
        .split("")
        .map((ch, i) => {
          if (ch === " ") return " ";
          if (i < revealed) return ch;
          return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        })
        .join("");
      setOut(next);
      if (revealed >= total) {
        setOut(text);
        clearInterval(iv);
      }
    }, speed);
    return () => clearInterval(iv);
  }, [text, speed]);
  return <span className={className}>{out}</span>;
}

/* ============ magnetic 3D tilt card with glare ============ */
export function TiltCard({ children, className = "", intensity = 10 }: { children: ReactNode; className?: string; intensity?: number }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rx = useSpring(useTransform(y, [-0.5, 0.5], [intensity, -intensity]), { stiffness: 260, damping: 22 });
  const ry = useSpring(useTransform(x, [-0.5, 0.5], [-intensity, intensity]), { stiffness: 260, damping: 22 });

  return (
    <motion.div
      className={`tilt ${className}`}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        x.set(px - 0.5);
        y.set(py - 0.5);
        e.currentTarget.style.setProperty("--mx", `${px * 100}%`);
        e.currentTarget.style.setProperty("--my", `${py * 100}%`);
      }}
      onMouseLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

/* ============ hash rain (matrix, hex flavored) ============ */
export function HashRain({ active, opacity = 0.16 }: { active: boolean; opacity?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const speedRef = useRef(1);
  useEffect(() => {
    if (active) {
      speedRef.current = 6;
    }
  }, [active]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let w = (canvas.width = canvas.offsetWidth);
    let h = (canvas.height = canvas.offsetHeight);
    const cols = Math.floor(w / 16);
    let drops: number[] = Array.from({ length: cols }, () => Math.random() * -50);
    const chars = "0123456789abcdef";

    const onResize = () => {
      w = canvas.width = canvas.offsetWidth;
      h = canvas.height = canvas.offsetHeight;
      drops = Array.from({ length: Math.floor(w / 16) }, () => Math.random() * -50);
    };
    window.addEventListener("resize", onResize);

    const draw = () => {
      ctx.fillStyle = "rgba(255,255,255,0)";
      ctx.clearRect(0, 0, w, h);
      ctx.font = "12px ui-monospace, monospace";
      for (let i = 0; i < drops.length; i++) {
        const ch = chars[Math.floor(Math.random() * 16)];
        const xp = i * 16;
        const yp = drops[i] * 16;
        // dark ink rain for light theme
        ctx.fillStyle = Math.random() > 0.975 ? "#0e7490" : "rgba(8,145,178,0.55)";
        ctx.fillText(ch, xp, yp);
        if (yp > h && Math.random() > 0.975) drops[i] = 0;
        drops[i] += speedRef.current;
      }
      speedRef.current = Math.max(1, speedRef.current * 0.985);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={ref} className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity }} />;
}

/* ============ critical alert vignette + shake ============ */
export function AlertVignette({ active }: { active: boolean }) {
  const [shake, setShake] = useState(false);
  useEffect(() => {
    if (!active) return;
    setShake(true);
    const t = setTimeout(() => setShake(false), 500);
    return () => clearTimeout(t);
  }, [active]);
  if (!active) return null;
  return (
    <>
      <style>{`@keyframes cs-shake { 0%,100%{transform:translate(0,0)} 20%{transform:translate(-7px,3px)} 40%{transform:translate(6px,-4px)} 60%{transform:translate(-4px,-3px)} 80%{transform:translate(4px,3px)} } body.cs-shake { animation: cs-shake .5s ease; }`}</style>
      <div
        className="fixed inset-0 z-[90] pointer-events-none alert-flash"
        style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(225,29,72,.28) 100%)" }}
      />
      <VignetteShake shake={shake} />
    </>
  );
}
function VignetteShake({ shake }: { shake: boolean }) {
  useEffect(() => {
    document.body.classList.toggle("cs-shake", shake);
    return () => document.body.classList.remove("cs-shake");
  }, [shake]);
  return null;
}

/* ============ voice + synth blips ============ */
let audioCtx: AudioContext | null = null;
function blip(freq: number, dur = 0.08, type: OscillatorType = "sine", gain = 0.035) {
  try {
    audioCtx = audioCtx ?? new AudioContext();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(gain, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + dur);
  } catch {
    /* autoplay blocked until first interaction — fine */
  }
}

export const sfx = {
  tick: () => blip(720, 0.05, "triangle"),
  anchor: () => {
    blip(520, 0.09, "sine");
    setTimeout(() => blip(780, 0.12, "sine"), 90);
  },
  alert: () => {
    blip(220, 0.16, "sawtooth", 0.05);
    setTimeout(() => blip(180, 0.2, "sawtooth", 0.05), 160);
  },
  verify: () => {
    blip(523, 0.1);
    setTimeout(() => blip(659, 0.1), 100);
    setTimeout(() => blip(784, 0.16), 200);
  },
};

export function speak(text: string, enabled: boolean) {
  if (!enabled) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.06;
    u.pitch = 0.92;
    u.volume = 0.85;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    /* unsupported */
  }
}

/* ============ hash snowflake identicon (8x8, mirrored) ============ */
export function HashSnowflake({ hash, size = 40, corrupted = false }: { hash: string; size?: number; corrupted?: boolean }) {
  if (!hash || hash.length < 32) return null;
  const cell = size / 8;
  const cells: { x: number; y: number; on: boolean; c: string }[] = [];
  for (let col = 0; col < 4; col++) {
    const nib = parseInt(hash.slice(col * 2, col * 2 + 2), 16);
    for (let row = 0; row < 8; row++) {
      const on = ((nib >> row) & 1) === 1;
      const c = on ? (corrupted ? (row % 2 ? "#e11d48" : "#be123c") : ["#0891b2", "#0d9488", "#4f46e5"][col % 3]) : "transparent";
      if (on) {
        cells.push({ x: col, y: row, on, c });
        cells.push({ x: 7 - col, y: row, on, c });
      }
    }
  }
  return (
    <svg width={size} height={size} className="rounded-md bg-slate-950 shrink-0" aria-hidden>
      {cells.map((c, i) => (
        <rect key={i} x={c.x * cell + 0.5} y={c.y * cell + 0.5} width={cell - 1} height={cell - 1} fill={c.c} rx={1} />
      ))}
    </svg>
  );
}
