import React, { useRef, useState, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * ============================================================================
 * ASTROPHYSICALLY-ACCURATE PROCEDURAL PLANET TEXTURE SYSTEM
 * ============================================================================
 * 
 * Based on the Sudarsky gas giant classification (2000) and NASA planetary
 * science data, this system classifies exoplanets into structural categories
 * based on their physical parameters:
 * 
 *   - Equilibrium Temperature (pl_eqt) in Kelvin
 *   - Planetary Radius (pl_rade) in Earth Radii
 *   - Habitability prediction (is_habitable)
 * 
 * Classification Schema:
 *   1. LAVA WORLD        - T > 1500K, R < 2.5 Re  (molten surface, tidal lock)
 *   2. HOT JUPITER       - T > 1000K, R > 2.5 Re  (Sudarsky Class IV/V)
 *   3. WARM GAS GIANT    - 500K < T < 1000K, R > 2.5 Re (Sudarsky Class II/III)
 *   4. HABITABLE ROCKY   - Habitable flag OR (200K < T < 320K, R < 2.5 Re)
 *   5. ROCKY TERRESTRIAL - T > 320K, R < 2.5 Re   (Mars/Venus-like)
 *   6. ICE WORLD         - T < 200K, R < 2.5 Re   (Europa/Enceladus-like)
 *   7. COLD GAS GIANT    - T < 500K, R > 2.5 Re   (Sudarsky Class I, Jupiter-like)
 * ============================================================================
 */

type PlanetType =
  | "lava_world"
  | "hot_jupiter"
  | "warm_gas_giant"
  | "habitable_rocky"
  | "rocky_terrestrial"
  | "ice_world"
  | "cold_gas_giant";

interface PlanetProfile {
  type: PlanetType;
  label: string;
  surfaceColors: string[];
  atmosphereColor: string;
  atmosphereOpacity: number;
  emissiveColor: string;
  emissiveIntensity: number;
  roughness: number;
  metalness: number;
  cloudOpacity: number;
  cloudColor: string;
  hasBanding: boolean;   // Gas giant atmospheric bands
  hasRings: boolean;     // Saturn-like ring system
  ringColor: string;
  ringOpacity: number;
}

function classifyPlanet(
  temp: number,
  radius: number,
  isHabitable: boolean
): PlanetProfile {
  const T = temp || 300;
  const R = radius || 1;

  // --- LAVA WORLD: Extreme heat, rocky composition ---
  // Think 55 Cancri e, Kepler-10b — tidally locked, magma ocean surfaces
  if (T > 1500 && R < 2.5) {
    return {
      type: "lava_world",
      label: "Lava World",
      surfaceColors: ["#1a0000", "#8b0000", "#ff4500", "#ffcc00", "#ff6600"],
      atmosphereColor: "#ff4400",
      atmosphereOpacity: 0.15,
      emissiveColor: "#ff2200",
      emissiveIntensity: 0.5,
      roughness: 0.4,
      metalness: 0.6,
      cloudOpacity: 0.0,
      cloudColor: "#000000",
      hasBanding: false,
      hasRings: false,
      ringColor: "#000000",
      ringOpacity: 0,
    };
  }

  // --- HOT JUPITER: Sudarsky Class IV/V ---
  // T > 1000K, inflated atmospheres, alkali metal absorption, silicate clouds
  // Think WASP-12b, KELT-9b, HAT-P-7b
  if (T > 1000 && R >= 2.5) {
    return {
      type: "hot_jupiter",
      label: "Hot Jupiter",
      surfaceColors: ["#1a0a2e", "#4a1942", "#c7254e", "#ff6f61", "#ff9a56"],
      atmosphereColor: "#ff6633",
      atmosphereOpacity: 0.25,
      emissiveColor: "#ff4400",
      emissiveIntensity: 0.4,
      roughness: 0.3,
      metalness: 0.1,
      cloudOpacity: 0.2,
      cloudColor: "#cc6644",
      hasBanding: true,
      hasRings: false,
      ringColor: "#000000",
      ringOpacity: 0,
    };
  }

  // --- WARM GAS GIANT: Sudarsky Class II/III ---
  // 500-1000K, water vapor clouds, chromium/sulfide haze
  // Think HD 209458b (Osiris), HAT-P-11b
  if (T > 500 && T <= 1000 && R >= 2.5) {
    return {
      type: "warm_gas_giant",
      label: "Warm Gas Giant",
      surfaceColors: ["#2d1b4e", "#5c3d7a", "#8b6fad", "#c9a86c", "#e8d5b5"],
      atmosphereColor: "#9988cc",
      atmosphereOpacity: 0.22,
      emissiveColor: "#553377",
      emissiveIntensity: 0.15,
      roughness: 0.3,
      metalness: 0.05,
      cloudOpacity: 0.35,
      cloudColor: "#ccbbaa",
      hasBanding: true,
      hasRings: false,
      ringColor: "#000000",
      ringOpacity: 0,
    };
  }

  // --- HABITABLE ROCKY: Earth-analog ---
  // Liquid water surface temp (200-320K), R < 2.5 Earth radii
  // Think Kepler-438b, Kepler-452b, TRAPPIST-1e, Proxima Centauri b
  if (isHabitable || (T >= 200 && T <= 320 && R < 2.5)) {
    return {
      type: "habitable_rocky",
      label: "Habitable Terrestrial",
      surfaceColors: ["#0a2744", "#0d5e3f", "#1a7a3d", "#8b7355", "#a0937e"],
      atmosphereColor: "#87CEEB",
      atmosphereOpacity: 0.3,
      emissiveColor: "#000000",
      emissiveIntensity: 0.0,
      roughness: 0.8,
      metalness: 0.15,
      cloudOpacity: 0.4,
      cloudColor: "#ffffff",
      hasBanding: false,
      hasRings: false,
      ringColor: "#000000",
      ringOpacity: 0,
    };
  }

  // --- ROCKY TERRESTRIAL: Too hot or dry for habitability ---
  // Venus, Mars, Mercury analogs — CO2 atmospheres, iron oxide surfaces
  if (T > 320 && R < 2.5) {
    return {
      type: "rocky_terrestrial",
      label: "Rocky Terrestrial",
      surfaceColors: ["#3d2817", "#704830", "#a0522d", "#c97040", "#d4a060"],
      atmosphereColor: "#ffaa88",
      atmosphereOpacity: 0.15,
      emissiveColor: "#000000",
      emissiveIntensity: 0.0,
      roughness: 0.9,
      metalness: 0.3,
      cloudOpacity: 0.1,
      cloudColor: "#ddccaa",
      hasBanding: false,
      hasRings: false,
      ringColor: "#000000",
      ringOpacity: 0,
    };
  }

  // --- ICE WORLD: Sub-habitable temps, small radius ---
  // Europa, Enceladus, Pluto analogs — subsurface oceans possible
  if (T < 200 && R < 2.5) {
    return {
      type: "ice_world",
      label: "Ice World",
      surfaceColors: ["#d0e8f0", "#a8d0e8", "#7cb8d4", "#4890b0", "#2a6080"],
      atmosphereColor: "#cceeff",
      atmosphereOpacity: 0.12,
      emissiveColor: "#334466",
      emissiveIntensity: 0.08,
      roughness: 0.6,
      metalness: 0.4,
      cloudOpacity: 0.1,
      cloudColor: "#eeeeff",
      hasBanding: false,
      hasRings: false,
      ringColor: "#000000",
      ringOpacity: 0,
    };
  }

  // --- COLD GAS GIANT: Sudarsky Class I ---
  // T < 500K, Jupiter/Saturn-like — ammonia clouds, metallic hydrogen
  // Banded atmospheric structure, possible ring systems
  return {
    type: "cold_gas_giant",
    label: "Cold Gas Giant",
    surfaceColors: ["#b07040", "#c09060", "#d4a574", "#e8c8a0", "#f0dcc0"],
    atmosphereColor: "#ddc8a0",
    atmosphereOpacity: 0.2,
    emissiveColor: "#000000",
    emissiveIntensity: 0.0,
    roughness: 0.3,
    metalness: 0.05,
    cloudOpacity: 0.45,
    cloudColor: "#ffffff",
    hasBanding: true,
    hasRings: R > 5,  // Larger cold giants more likely to have rings
    ringColor: "#c8b890",
    ringOpacity: 0.3,
  };
}

/**
 * Procedural texture generation via Canvas2D.
 * Creates a 512x256 equirectangular map with features specific to each planet type.
 */
function generateProceduralTexture(
  profile: PlanetProfile,
  seed: number
): THREE.CanvasTexture {
  const width = 512;
  const height = 256;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  // Seeded pseudo-random for deterministic output per planet
  const seededRandom = (s: number) => {
    const x = Math.sin(s * 9301 + 49297) * 49297;
    return x - Math.floor(x);
  };

  const colors = profile.surfaceColors;

  if (profile.hasBanding) {
    // --- GAS GIANT: Horizontal atmospheric bands ---
    // Modeled after Jupiter/Saturn zonal wind patterns
    const bandCount = 12 + Math.floor(seededRandom(seed) * 8);
    for (let i = 0; i < bandCount; i++) {
      const y = (i / bandCount) * height;
      const bandHeight = height / bandCount + seededRandom(seed + i) * 6 - 3;
      const colorIdx = Math.floor(seededRandom(seed + i * 3) * colors.length);
      ctx.fillStyle = colors[colorIdx];
      ctx.fillRect(0, y, width, bandHeight + 2);
    }

    // Add turbulence / storm features (Great Red Spot analog)
    for (let i = 0; i < 20; i++) {
      const x = seededRandom(seed + i * 7) * width;
      const y = seededRandom(seed + i * 13) * height;
      const r = 3 + seededRandom(seed + i * 17) * 15;
      const colorIdx = Math.floor(seededRandom(seed + i * 23) * colors.length);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, colors[colorIdx]);
      gradient.addColorStop(1, "transparent");
      ctx.fillStyle = gradient;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  } else if (profile.type === "lava_world") {
    // --- LAVA WORLD: Volcanic terrain with magma cracks ---
    ctx.fillStyle = colors[0];
    ctx.fillRect(0, 0, width, height);

    // Lava flow network (approximating tectonic fractures)
    for (let i = 0; i < 60; i++) {
      const x1 = seededRandom(seed + i * 3) * width;
      const y1 = seededRandom(seed + i * 5) * height;
      const x2 = x1 + (seededRandom(seed + i * 7) - 0.5) * 120;
      const y2 = y1 + (seededRandom(seed + i * 11) - 0.5) * 120;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      const lavaIdx = 2 + Math.floor(seededRandom(seed + i * 13) * 3);
      ctx.strokeStyle = colors[Math.min(lavaIdx, colors.length - 1)];
      ctx.lineWidth = 1 + seededRandom(seed + i * 17) * 3;
      ctx.globalAlpha = 0.6 + seededRandom(seed + i * 19) * 0.4;
      ctx.stroke();
    }
    ctx.globalAlpha = 1.0;

    // Hotspot eruptions
    for (let i = 0; i < 15; i++) {
      const x = seededRandom(seed + i * 29) * width;
      const y = seededRandom(seed + i * 31) * height;
      const r = 5 + seededRandom(seed + i * 37) * 20;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, "#ffcc00");
      gradient.addColorStop(0.5, "#ff4500");
      gradient.addColorStop(1, "transparent");
      ctx.fillStyle = gradient;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  } else if (profile.type === "habitable_rocky") {
    // --- HABITABLE WORLD: Oceans, continents, polar ice ---
    // Blue ocean base
    ctx.fillStyle = colors[0];
    ctx.fillRect(0, 0, width, height);

    // Continental masses (irregular blobs)
    for (let i = 0; i < 8; i++) {
      const cx = seededRandom(seed + i * 7) * width;
      const cy = height * 0.15 + seededRandom(seed + i * 11) * height * 0.7;
      const rx = 30 + seededRandom(seed + i * 13) * 80;
      const ry = 20 + seededRandom(seed + i * 17) * 50;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, seededRandom(seed + i * 19) * Math.PI, 0, Math.PI * 2);
      const landIdx = 1 + Math.floor(seededRandom(seed + i * 23) * 3);
      ctx.fillStyle = colors[Math.min(landIdx, colors.length - 1)];
      ctx.fill();
    }

    // Polar ice caps (physically accurate — albedo feedback zones)
    const gradient1 = ctx.createLinearGradient(0, 0, 0, height * 0.12);
    gradient1.addColorStop(0, "#f0f8ff");
    gradient1.addColorStop(1, "transparent");
    ctx.fillStyle = gradient1;
    ctx.fillRect(0, 0, width, height * 0.12);

    const gradient2 = ctx.createLinearGradient(0, height * 0.88, 0, height);
    gradient2.addColorStop(0, "transparent");
    gradient2.addColorStop(1, "#f0f8ff");
    ctx.fillStyle = gradient2;
    ctx.fillRect(0, height * 0.88, width, height * 0.12);
  } else if (profile.type === "ice_world") {
    // --- ICE WORLD: Fractured ice surface (Europa-like) ---
    ctx.fillStyle = colors[0];
    ctx.fillRect(0, 0, width, height);

    // Ice fracture lineae (like Europa's)
    for (let i = 0; i < 80; i++) {
      const x1 = seededRandom(seed + i * 3) * width;
      const y1 = seededRandom(seed + i * 5) * height;
      const x2 = x1 + (seededRandom(seed + i * 7) - 0.5) * 200;
      const y2 = y1 + (seededRandom(seed + i * 11) - 0.5) * 200;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      const lineIdx = Math.floor(seededRandom(seed + i * 13) * colors.length);
      ctx.strokeStyle = colors[lineIdx];
      ctx.lineWidth = 0.5 + seededRandom(seed + i * 17) * 1.5;
      ctx.globalAlpha = 0.3 + seededRandom(seed + i * 19) * 0.4;
      ctx.stroke();
    }
    ctx.globalAlpha = 1.0;

    // Smooth ice plains (resurfaced regions)
    for (let i = 0; i < 5; i++) {
      const cx = seededRandom(seed + i * 29) * width;
      const cy = seededRandom(seed + i * 31) * height;
      const r = 15 + seededRandom(seed + i * 37) * 40;
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      gradient.addColorStop(0, colors[0]);
      gradient.addColorStop(1, "transparent");
      ctx.fillStyle = gradient;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
  } else {
    // --- ROCKY TERRESTRIAL: Cratered surface (Mars/Venus-like) ---
    ctx.fillStyle = colors[0];
    ctx.fillRect(0, 0, width, height);

    // Terrain variation patches
    for (let i = 0; i < 15; i++) {
      const cx = seededRandom(seed + i * 7) * width;
      const cy = seededRandom(seed + i * 11) * height;
      const rx = 30 + seededRandom(seed + i * 13) * 80;
      const ry = 20 + seededRandom(seed + i * 17) * 60;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, seededRandom(seed + i * 19) * Math.PI, 0, Math.PI * 2);
      const idx = Math.floor(seededRandom(seed + i * 23) * colors.length);
      ctx.fillStyle = colors[idx];
      ctx.globalAlpha = 0.4 + seededRandom(seed + i * 29) * 0.4;
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    // Impact craters
    for (let i = 0; i < 25; i++) {
      const cx = seededRandom(seed + i * 31) * width;
      const cy = seededRandom(seed + i * 37) * height;
      const r = 2 + seededRandom(seed + i * 41) * 10;
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      gradient.addColorStop(0, colors[0]);
      gradient.addColorStop(0.6, colors[Math.min(1, colors.length - 1)]);
      gradient.addColorStop(1, "transparent");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/**
 * Generate a cloud/atmosphere canvas texture
 */
function generateCloudTexture(profile: PlanetProfile, seed: number): THREE.CanvasTexture {
  const width = 512;
  const height = 256;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  const seededRandom = (s: number) => {
    const x = Math.sin(s * 9301 + 49297) * 49297;
    return x - Math.floor(x);
  };

  ctx.clearRect(0, 0, width, height);

  if (profile.type === "habitable_rocky") {
    // Earth-like cloud patterns — cirrus and cumulus
    for (let i = 0; i < 40; i++) {
      const cx = seededRandom(seed + i * 51) * width;
      const cy = seededRandom(seed + i * 53) * height;
      const rx = 20 + seededRandom(seed + i * 57) * 80;
      const ry = 10 + seededRandom(seed + i * 59) * 30;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, seededRandom(seed + i * 61) * Math.PI, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${0.15 + seededRandom(seed + i * 67) * 0.25})`;
      ctx.fill();
    }
  } else if (profile.hasBanding) {
    // Gas giant — thin wispy bands
    for (let i = 0; i < 15; i++) {
      const y = seededRandom(seed + i * 71) * height;
      const bandH = 3 + seededRandom(seed + i * 73) * 12;
      ctx.fillStyle = `rgba(255,255,255,${0.05 + seededRandom(seed + i * 79) * 0.15})`;
      ctx.fillRect(0, y, width, bandH);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

export default function TexturedExoplanet({
  data,
  prediction,
  visualDistance,
  isSelected,
  onClick,
  controlsRef,
}: {
  data: any;
  prediction: any;
  visualDistance: number;
  isSelected: boolean;
  onClick: () => void;
  controlsRef: React.MutableRefObject<any>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const cloudRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  // Orbit state
  const angle = useRef(Math.random() * Math.PI * 2);
  const speed = 2.0 / Math.pow(visualDistance, 1.5);

  // Classify this planet based on its astrophysical parameters
  const isHabitable = prediction?.is_habitable ?? false;
  const profile = useMemo(
    () => classifyPlanet(data.pl_eqt, data.pl_rade, isHabitable),
    [data.pl_eqt, data.pl_rade, isHabitable]
  );

  // Generate deterministic seed from planet parameters
  const textureSeed = useMemo(
    () => Math.floor((data.pl_eqt || 300) * 100 + (data.pl_rade || 1) * 1000 + visualDistance * 10),
    [data.pl_eqt, data.pl_rade, visualDistance]
  );

  // Procedural surface texture (memoized)
  const surfaceTexture = useMemo(
    () => generateProceduralTexture(profile, textureSeed),
    [profile, textureSeed]
  );

  // Cloud texture
  const cloudTexture = useMemo(
    () => generateCloudTexture(profile, textureSeed + 999),
    [profile, textureSeed]
  );

  useFrame((state, delta) => {
    if (groupRef.current) {
      angle.current += speed * delta;
      groupRef.current.position.x = Math.cos(angle.current) * visualDistance;
      groupRef.current.position.z = Math.sin(angle.current) * visualDistance;

      // Keep camera focused on this planet if selected
      if (isSelected && controlsRef.current) {
        const pos = new THREE.Vector3();
        groupRef.current.getWorldPosition(pos);
        controlsRef.current.target.lerp(pos, 0.05);
      }
    }

    // Slow axial rotation for surface realism
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.15;
    }

    // Slightly faster cloud rotation (differential, like real atmospheres)
    if (cloudRef.current) {
      cloudRef.current.rotation.y += delta * 0.2;
    }
  });

  // Scale radius for visibility, but keep it relative
  const visualRadius = Math.max(0.4, Math.min((data.pl_rade || 1) * 0.4, 2.0));

  // Select highlight color based on classification
  const highlightColor = hovered || isSelected
    ? isHabitable
      ? "#22c55e"
      : profile.type === "lava_world"
        ? "#ff4400"
        : profile.type === "hot_jupiter"
          ? "#ff6633"
          : profile.type === "ice_world"
            ? "#66bbff"
            : "#ef4444"
    : profile.emissiveColor;

  return (
    <group ref={groupRef}>
      {/* Main planet body */}
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
          document.body.style.cursor = "auto";
        }}
        castShadow
        receiveShadow
      >
        <sphereGeometry args={[visualRadius, 64, 64]} />
        <meshStandardMaterial
          map={surfaceTexture}
          emissive={highlightColor}
          emissiveIntensity={
            isSelected
              ? 0.6
              : hovered
                ? 0.3
                : profile.emissiveIntensity
          }
          roughness={profile.roughness}
          metalness={profile.metalness}
        />
      </mesh>

      {/* Cloud / Upper Atmosphere Layer */}
      {profile.cloudOpacity > 0 && (
        <mesh ref={cloudRef} receiveShadow>
          <sphereGeometry args={[visualRadius * 1.02, 48, 48]} />
          <meshStandardMaterial
            map={cloudTexture}
            color={profile.cloudColor}
            transparent={true}
            opacity={profile.cloudOpacity}
            side={THREE.FrontSide}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Outer Atmosphere Glow */}
      <mesh receiveShadow>
        <sphereGeometry args={[visualRadius * 1.15, 48, 48]} />
        <meshStandardMaterial
          color={profile.atmosphereColor}
          transparent={true}
          opacity={profile.atmosphereOpacity}
          side={THREE.FrontSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Ring System (Cold gas giants with R > 5 Re) */}
      {profile.hasRings && (
        <mesh rotation={[Math.PI / 2.5, 0.2, 0]}>
          <ringGeometry
            args={[visualRadius * 1.6, visualRadius * 2.4, 64]}
          />
          <meshBasicMaterial
            color={profile.ringColor}
            transparent
            opacity={profile.ringOpacity}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Selection Highlight Ring */}
      {isSelected && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[visualRadius * 1.4, visualRadius * 1.5, 64]} />
          <meshBasicMaterial
            color="#ffffff"
            transparent
            opacity={0.5}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </group>
  );
}
