/**
 * Client-side detection engine (runs on canvas pixel data).
 * Real CV heuristics: frame differencing for motion, aspect-ratio blob
 * analysis for persons, luminance collapse for tamper.
 */

export interface DetectionFrame {
  motion: boolean;
  motionScore: number;
  persons: { x: number; y: number; w: number; h: number; conf: number }[];
  tamper: { detected: boolean; type: string | null; score: number };
  brightness: number;
  zones: string[];
  tripwire: string[];
  timestamp: number;
}

export interface DetectOptions {
  prevFrame: Uint8ClampedArray | null;
  sensitivity: number;
  zone: { x: number; y: number; w: number; h: number } | null;
  tripwire: { x1: number; y1: number; x2: number; y2: number } | null;
  prevBrightness: number;
  lastMotionAt: number;
  now: number;
}

export interface DetectResult extends DetectionFrame {
  crossedTripwire: boolean;
  zoneOccupied: boolean;
  freezeDetected: boolean;
}

const MOTION_PIXEL_THRESHOLD = 48;

export function analyzeFrame(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  opts: DetectOptions
): DetectResult {
  const sensitivity = Math.min(100, Math.max(1, opts.sensitivity));
  const pixelBar = MOTION_PIXEL_THRESHOLD * (1.2 - (sensitivity / 100) * 0.7);

  let changed = 0;
  let brightnessSum = 0;
  const step = 4;

  if (opts.prevFrame && opts.prevFrame.length === data.length) {
    for (let i = 0; i < data.length; i += step) {
      const d =
        Math.abs(data[i] - opts.prevFrame[i]) +
        Math.abs(data[i + 1] - opts.prevFrame[i + 1]) +
        Math.abs(data[i + 2] - opts.prevFrame[i + 2]);
      if (d > pixelBar) changed++;
      brightnessSum += (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
  } else {
    for (let i = 0; i < data.length; i += step) {
      brightnessSum += (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
  }
  const sampled = data.length / step;
  const motionRatio = opts.prevFrame ? changed / sampled : 0;
  const brightness = brightnessSum / sampled;
  // Motion gate: a walking person typically changes 0.5–3% of frame pixels.
  // At sensitivity 65 the gate is ~1.0%; scale linearly with the slider.
  const motion = opts.prevFrame ? motionRatio > 0.005 + (100 - sensitivity) * 0.00015 : false;

  const persons: DetectionFrame["persons"] = [];
  // Always scan for persons: a seated webcam subject produces no frame-to-frame
  // motion, but the blob heuristic still finds them. Cheap at 160×90.
  {
    const bandTop = Math.floor(height * 0.35);
    const bandBottom = Math.floor(height * 0.92);
    const cols = 16;
    const colW = Math.floor(width / cols);
    for (let c = 0; c < cols; c++) {
      let darkCount = 0;
      let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
      for (let y = bandTop; y < bandBottom; y += 3) {
        for (let x = c * colW; x < (c + 1) * colW; x += 2) {
          const idx = (y * width + x) * step;
          const lum = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
          if (lum < brightness * 0.55) {
            darkCount++;
            if (x < xMin) xMin = x;
            if (x > xMax) xMax = x;
            if (y < yMin) yMin = y;
            if (y > yMax) yMax = y;
          }
        }
      }
      const colArea = ((bandBottom - bandTop) * colW) / 6;
      const fill = darkCount / Math.max(1, colArea);
      if (fill > 0.28 && xMax > xMin && yMax > yMin) {
        const w = xMax - xMin, h = yMax - yMin;
        const aspect = h / Math.max(1, w);
        if (aspect > 0.9 && aspect < 4.2 && h > height * 0.18) {
          persons.push({ x: xMin / width, y: yMin / height, w: w / width, h: h / height, conf: Math.min(0.97, 0.55 + fill * 0.5) });
        }
      }
    }
    const deduped: DetectionFrame["persons"] = [];
    for (const p of persons) {
      const overlap = deduped.find((q) => Math.abs(q.x - p.x) < 0.12 && Math.abs(q.y - p.y) < 0.12);
      if (!overlap) deduped.push(p);
    }
    persons.length = Math.min(deduped.length, 4);
    deduped.forEach((p, i) => (persons[i] = p));
  }

  let tamperType: string | null = null;
  let tamperScore = 0;
  if (opts.prevFrame) {
    const delta = Math.abs(brightness - opts.prevBrightness);
    if (brightness < 14) {
      tamperType = "signal_blackout";
      tamperScore = 0.95;
    } else if (delta > 52 && brightness < 40) {
      tamperType = "occlusion";
      tamperScore = 0.85;
    }
    if (!motion && opts.now - opts.lastMotionAt > 12000 && opts.lastMotionAt > 0) {
      tamperType = tamperType ?? "frame_freeze";
      tamperScore = Math.max(tamperScore, 0.7);
    }
  }

  let zoneOccupied = false;
  if (opts.zone) {
    zoneOccupied = persons.some(
      (p) =>
        p.x + p.w > opts.zone!.x && p.x < opts.zone!.x + opts.zone!.w &&
        p.y + p.h > opts.zone!.y && p.y < opts.zone!.y + opts.zone!.h
    );
  }

  let crossedTripwire = false;
  if (opts.tripwire && persons.length) {
    for (const p of persons) {
      const cx = p.x + p.w / 2;
      const cy = p.y + p.h / 2;
      const { x1, y1, x2, y2 } = opts.tripwire;
      const num = Math.abs((y2 - y1) * cx - (x2 - x1) * cy + x2 * y1 - y2 * x1);
      const den = Math.hypot(y2 - y1, x2 - x1);
      const dist = num / Math.max(0.0001, den);
      if (dist < 0.06) crossedTripwire = true;
    }
  }

  return {
    motion,
    motionScore: Math.round(Math.min(100, motionRatio * 900)),
    persons,
    tamper: { detected: Boolean(tamperType), type: tamperType, score: tamperScore },
    brightness: Math.round(brightness),
    zones: zoneOccupied && opts.zone ? ["restricted"] : [],
    tripwire: crossedTripwire ? ["crossed"] : [],
    crossedTripwire,
    zoneOccupied,
    freezeDetected: tamperType === "frame_freeze",
    timestamp: opts.now,
  };
}

export function scoreEvent(
  r: DetectResult,
  mode: { armed: boolean; hasZone: boolean }
): { score: number; severity: "low" | "medium" | "high" | "critical"; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  if (r.motion) {
    score += 22;
    reasons.push("motion");
  }
  if (r.persons.length) {
    score += 30;
    reasons.push(`${r.persons.length} person${r.persons.length > 1 ? "s" : ""}`);
  }
  if (r.persons.length && r.motion) {
    score += 8; // moving person — the classic CCTV trigger
  }
  if (r.zoneOccupied) {
    score += 30;
    reasons.push("restricted zone occupied");
  }
  if (r.crossedTripwire) {
    score += 26;
    reasons.push("tripwire crossed");
  }
  if (r.tamper.detected) {
    score += 45;
    reasons.push(`camera tamper: ${r.tamper.type}`);
  }
  if (mode.hasZone && r.persons.length && !r.zoneOccupied) score += 4;
  score = Math.min(100, score);
  const severity = score >= 80 ? "critical" : score >= 60 ? "high" : score >= 38 ? "medium" : "low";
  return { score, severity, reasons };
}
