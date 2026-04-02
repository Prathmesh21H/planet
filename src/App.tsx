/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, useState, useEffect, useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import TexturedExoplanet from './components/TexturedExoplanet';
import { Search, X, SlidersHorizontal } from 'lucide-react';

// If you are running the frontend in the AI Studio preview and the backend locally,
// you must expose your local backend over HTTPS (e.g., using ngrok) and set this URL.
// Example: const API_BASE_URL = "https://your-ngrok-url.ngrok-free.app";
// If you are running both locally, leave this as an empty string to use the Vite proxy.
const API_BASE_URL = import.meta.env.VITE_API_URL || "";

// Helper to determine star color based on temperature (Kelvin)
function getStarColor(temp: number) {
  if (!temp) return '#ffcc00'; // Default Sun-like
  if (temp < 3500) return '#ff4500'; // Red dwarf
  if (temp < 5000) return '#ffa500'; // Orange dwarf
  if (temp < 6000) return '#ffffcc'; // Yellow dwarf (Sun-like)
  if (temp < 7500) return '#f8f8ff'; // White
  return '#87ceeb'; // Blue-white
}

function Star({ data, position }: { data: any, position: [number, number, number] }) {
  const color = getStarColor(data.st_teff);
  // Scale radius for visual effect, cap it so it doesn't engulf planets
  const radius = Math.min(Math.max((data.st_rad || 1) * 2, 1), 4); 
  
  return (
    <mesh position={position}>
      <sphereGeometry args={[radius, 32, 32]} />
      <meshBasicMaterial color={color} />
      {/* Glow effect */}
      <mesh>
         <sphereGeometry args={[radius * 1.2, 32, 32]} />
         <meshBasicMaterial color={color} transparent opacity={0.15} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {/* Physics: PointLight that casts shadows */}
      <pointLight castShadow intensity={2.5} distance={200} decay={1.5} shadow-mapSize={[2048, 2048]} shadow-bias={-0.001} />
    </mesh>
  );
}

function GoldilocksZone({ innerRadius, outerRadius }: { innerRadius: number, outerRadius: number }) {
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]} receiveShadow>
      <ringGeometry args={[innerRadius, outerRadius, 64]} />
      <meshBasicMaterial color="#22c55e" transparent opacity={0.1} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
  );
}

function OrbitPath({ radius }: { radius: number }) {
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <ringGeometry args={[radius - 0.03, radius + 0.03, 64]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.15} side={THREE.DoubleSide} />
    </mesh>
  );
}

export default function App() {
  const [systems, setSystems] = useState<string[]>([]);
  const [selectedSystem, setSelectedSystem] = useState<string>("");
  const [systemData, setSystemData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [backendStatus, setBackendStatus] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Interactive State
  const [editedStar, setEditedStar] = useState<any>(null);
  const [editedPlanets, setEditedPlanets] = useState<Record<string, any>>({});
  const [predictions, setPredictions] = useState<Record<string, any>>({});
  const [selectedPlanetName, setSelectedPlanetName] = useState<string | null>(null);
  const controlsRef = useRef<any>(null);

  // Fetch list of systems on mount
  useEffect(() => {
    const fetchSystems = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/systems`);
        if (!res.ok) throw new Error('Backend offline');
        const data = await res.json();
        setSystems(data.systems);
        if (data.systems.length > 0) {
          setSelectedSystem(data.systems[0]);
        }
        setBackendStatus('Connected to ML Backend');
      } catch (err) {
        console.warn("Backend offline, waiting...");
        setBackendStatus('Backend offline (Start Python Server)');
      }
    };
    fetchSystems();
  }, []);

  // Fetch system details when selectedSystem changes
  useEffect(() => {
    if (!selectedSystem) return;
    
    const fetchSystemData = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/system/${selectedSystem}`);
        if (!res.ok) throw new Error('Failed to fetch system');
        const data = await res.json();
        
        // Initialize editable state
        if (data.stars && data.stars.length > 0) {
          setEditedStar({ ...data.stars[0] });
        }
        
        const initialEditedPlanets: Record<string, any> = {};
        const initialPredictions: Record<string, any> = {};
        
        data.planets.forEach((p: any) => {
          initialEditedPlanets[p.name] = {
            pl_rade: p.pl_rade || 1,
            pl_orbsmax: p.pl_orbsmax || 1,
            pl_eqt: p.pl_eqt || 250,
            original_orbsmax: p.pl_orbsmax || 1,
            original_eqt: p.pl_eqt || 250,
          };
          initialPredictions[p.name] = {
            is_habitable: p.is_habitable,
            probability: p.probability
          };
        });
        
        setEditedPlanets(initialEditedPlanets);
        setPredictions(initialPredictions);
        setSystemData(data);
        setSelectedPlanetName(null);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchSystemData();
  }, [selectedSystem]);

  // Physics Engine: Update planet temperatures when star or distance changes
  const updatePhysics = (newStar: any, newPlanets: Record<string, any>) => {
    if (!systemData || !systemData.stars[0]) return newPlanets;
    
    const originalStar = systemData.stars[0];
    const updatedPlanets = { ...newPlanets };
    
    Object.keys(updatedPlanets).forEach(pName => {
      const p = updatedPlanets[pName];
      
      // T_eq is proportional to T_star * sqrt(R_star / Distance)
      // We calculate the ratio of change from the original known values
      
      const tempRatio = (newStar.st_teff || 5000) / (originalStar.st_teff || 5000);
      const radRatio = Math.sqrt((newStar.st_rad || 1) / (originalStar.st_rad || 1));
      const distRatio = Math.sqrt((p.original_orbsmax || 1) / (p.pl_orbsmax || 1));
      
      const newEqt = (p.original_eqt || 250) * tempRatio * radRatio * distRatio;
      
      updatedPlanets[pName] = {
        ...p,
        pl_eqt: newEqt
      };
    });
    
    return updatedPlanets;
  };

  // Handle Star Change
  const handleStarChange = (field: string, value: number) => {
    const newStar = { ...editedStar, [field]: value };
    setEditedStar(newStar);
    const updatedPlanets = updatePhysics(newStar, editedPlanets);
    setEditedPlanets(updatedPlanets);
  };

  // Handle Planet Change
  const handlePlanetChange = (pName: string, field: string, value: number) => {
    const newPlanets = { 
      ...editedPlanets, 
      [pName]: { ...editedPlanets[pName], [field]: value } 
    };
    const updatedPlanets = updatePhysics(editedStar, newPlanets);
    setEditedPlanets(updatedPlanets);
  };

  // Debounced ML Prediction Update
  useEffect(() => {
    if (!systemData) return;

    const timer = setTimeout(async () => {
      const newPredictions = { ...predictions };
      
      for (const pName of Object.keys(editedPlanets)) {
        const pData = editedPlanets[pName];
        try {
          const res = await fetch(`${API_BASE_URL}/api/predict_habitability`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              planet_id: pName,
              pl_rade: pData.pl_rade,
              pl_orbsmax: pData.pl_orbsmax,
              pl_eqt: pData.pl_eqt,
              st_teff: editedStar?.st_teff,
              st_rad: editedStar?.st_rad,
              st_mass: editedStar?.st_mass
            })
          });
          if (res.ok) {
            const result = await res.json();
            newPredictions[pName] = {
              is_habitable: result.status === 'Habitable',
              probability: result.probability
            };
          }
        } catch (e) {
          console.error("Failed to update prediction for", pName, e);
        }
      }
      
      setPredictions(newPredictions);
    }, 500); // 500ms debounce for batch updates

    return () => clearTimeout(timer);
  }, [editedPlanets, editedStar]);

  // Calculate Goldilocks Zone (Habitable Zone)
  // Roughly where Teq is between 200K and 320K
  const goldilocksZone = useMemo(() => {
    if (!systemData || !editedStar || Object.keys(editedPlanets).length === 0) return null;
    
    // Find a reference planet to calculate distance scaling
    const refPlanetName = Object.keys(editedPlanets)[0];
    const refPlanet = editedPlanets[refPlanetName];
    
    if (!refPlanet || !refPlanet.pl_eqt || !refPlanet.pl_orbsmax) return null;
    
    // D is proportional to 1 / T_eq^2
    // D_target = D_ref * (T_ref / T_target)^2
    const innerAU = refPlanet.pl_orbsmax * Math.pow(refPlanet.pl_eqt / 320, 2);
    const outerAU = refPlanet.pl_orbsmax * Math.pow(refPlanet.pl_eqt / 200, 2);
    
    // We need to map AU to visual distance. 
    // Let's find the max AU to scale it properly to our visual range (6 to 30)
    const maxAU = Math.max(...Object.values(editedPlanets).map((p: any) => p.pl_orbsmax || 1));
    
    const mapToVisual = (au: number) => {
      return 6 + (au / maxAU) * 24; // Scale to visual range 6-30
    };

    return {
      inner: mapToVisual(innerAU),
      outer: mapToVisual(outerAU)
    };
  }, [editedPlanets, editedStar, systemData]);

  // Handle search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/search?q=${encodeURIComponent(searchQuery)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
        }
      } catch (err) {
        console.error("Search failed", err);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  // Close search when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectSearchResult = (sysName: string) => {
    setSelectedSystem(sysName);
    setIsSearchOpen(false);
    setSearchQuery("");
  };

  return (
    <div className="w-full h-screen bg-black text-white relative">
      {/* UI Header */}
      <div className="absolute top-0 left-0 w-full p-6 z-10 pointer-events-none flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">PLANET</h1>
          <p className="text-gray-400 text-sm mt-1 max-w-md">
            Predictive Learning Approach for Non-Solar Environment Tracking. 
          </p>
          {backendStatus && (
            <div className={`mt-2 text-xs px-2 py-1 rounded inline-block ${backendStatus.includes('offline') ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
              {backendStatus}
            </div>
          )}
        </div>
        
        <div className="pointer-events-auto flex flex-col gap-4 w-80">
          {/* Search Bar */}
          <div className="relative" ref={searchRef}>
            <div className="relative">
              <input
                type="text"
                placeholder="Search systems, stars, planets..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsSearchOpen(true);
                }}
                onFocus={() => setIsSearchOpen(true)}
                className="w-full bg-black/50 border border-white/20 text-white text-sm rounded-xl pl-10 pr-10 py-3 outline-none focus:border-blue-500 backdrop-blur-md transition-colors"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              {searchQuery && (
                <button 
                  onClick={() => {
                    setSearchQuery("");
                    setSearchResults(null);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Search Results Popup */}
            {isSearchOpen && searchResults && (
              <div className="absolute top-full left-0 w-full mt-2 bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden max-h-[60vh] overflow-y-auto z-50 flex flex-col">
                
                {/* Systems */}
                {searchResults.systems?.length > 0 && (
                  <div className="p-2 border-b border-white/5">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-2 mb-1">Systems</h3>
                    {searchResults.systems.map((sys: string) => (
                      <button
                        key={`sys-${sys}`}
                        onClick={() => handleSelectSearchResult(sys)}
                        className="w-full text-left px-2 py-1.5 text-sm text-gray-200 hover:bg-white/10 rounded transition-colors"
                      >
                        {sys}
                      </button>
                    ))}
                  </div>
                )}

                {/* Stars */}
                {searchResults.stars?.length > 0 && (
                  <div className="p-2 border-b border-white/5">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-2 mb-1">Stars</h3>
                    {searchResults.stars.map((star: any) => (
                      <button
                        key={`star-${star.name}`}
                        onClick={() => handleSelectSearchResult(star.hostname)}
                        className="w-full text-left px-2 py-1.5 text-sm text-gray-200 hover:bg-white/10 rounded transition-colors flex justify-between items-center"
                      >
                        <span>{star.name}</span>
                        <span className="text-xs text-gray-500">{star.hostname}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Planets */}
                {searchResults.planets?.length > 0 && (
                  <div className="p-2">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-2 mb-1">Planets</h3>
                    {searchResults.planets.map((planet: any) => (
                      <button
                        key={`pl-${planet.name}`}
                        onClick={() => handleSelectSearchResult(planet.hostname)}
                        className="w-full text-left px-2 py-1.5 text-sm text-gray-200 hover:bg-white/10 rounded transition-colors flex justify-between items-center"
                      >
                        <span>{planet.name}</span>
                        <span className="text-xs text-gray-500">{planet.hostname}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* No Results */}
                {searchResults.systems?.length === 0 && searchResults.stars?.length === 0 && searchResults.planets?.length === 0 && (
                  <div className="p-4 text-center text-sm text-gray-500">
                    No results found for "{searchQuery}"
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-black/50 p-4 rounded-xl border border-white/10 backdrop-blur-md flex flex-col">
            <label className="block text-sm font-medium text-gray-300 mb-2">Select Planetary System</label>
            
            {systems.length > 0 ? (
              <select 
                value={selectedSystem}
                onChange={(e) => setSelectedSystem(e.target.value)}
                className="bg-gray-900 border border-gray-700 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 outline-none mb-3"
                disabled={loading}
              >
                {systems.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            ) : (
              <div className="text-sm text-red-400 mb-3 p-2 bg-red-500/10 rounded border border-red-500/20">
                Please start the Python backend to load systems.
              </div>
            )}

            {systemData && (
              <div className="text-xs text-gray-400 bg-gray-900/50 p-3 rounded-lg border border-white/5">
                <p className="font-bold text-white mb-1">System Overview:</p>
                <p>Stars: {systemData.stars.length}</p>
                <p>Planets: {systemData.planets.length}</p>
              </div>
            )}

            <p className="text-xs text-gray-500 mt-3 leading-relaxed border-t border-white/10 pt-3">
              • <strong>Orbiting</strong> speeds are relative to distance.<br/>
              • <strong>Click</strong> planets to focus & edit properties.<br/>
              • <strong>Goldilocks Zone</strong> is rendered in green.
            </p>
          </div>
        </div>
      </div>

      {/* Right Side Panel for Editing */}
      {selectedPlanetName && editedPlanets[selectedPlanetName] && (
        <div className="absolute top-6 right-6 w-80 bg-black/80 backdrop-blur-xl border border-white/20 p-5 rounded-2xl text-white shadow-2xl z-20 flex flex-col max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-4 border-b border-white/20 pb-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-5 h-5 text-blue-400" />
              <h3 className="text-xl font-bold">{selectedPlanetName}</h3>
            </div>
            <button onClick={() => setSelectedPlanetName(null)} className="text-gray-400 hover:text-white transition-colors bg-white/5 p-1 rounded-full hover:bg-white/10">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className={`p-3 rounded-xl text-center font-bold text-sm mb-3 transition-colors ${predictions[selectedPlanetName]?.is_habitable ? 'bg-green-500/20 text-green-400 border border-green-500/30 shadow-[0_0_15px_rgba(34,197,94,0.2)]' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
            {predictions[selectedPlanetName]?.is_habitable ? 'HABITABLE' : 'NOT HABITABLE'} <br/>
            <span className="text-xs opacity-80 font-normal mt-1 block">ML Probability: {(predictions[selectedPlanetName]?.probability * 100).toFixed(1)}%</span>
          </div>

          {/* Planet Structural Classification Badge */}
          {(() => {
            const T = editedPlanets[selectedPlanetName]?.pl_eqt || 300;
            const R = editedPlanets[selectedPlanetName]?.pl_rade || 1;
            const hab = predictions[selectedPlanetName]?.is_habitable;
            let label = 'Unknown';
            let badgeColor = 'bg-gray-500/20 text-gray-400 border-gray-500/30';
            if (T > 1500 && R < 2.5) { label = '🌋 Lava World'; badgeColor = 'bg-red-600/20 text-red-400 border-red-600/30'; }
            else if (T > 1000 && R >= 2.5) { label = '🔥 Hot Jupiter'; badgeColor = 'bg-orange-500/20 text-orange-400 border-orange-500/30'; }
            else if (T > 500 && T <= 1000 && R >= 2.5) { label = '🌀 Warm Gas Giant'; badgeColor = 'bg-purple-500/20 text-purple-400 border-purple-500/30'; }
            else if (hab || (T >= 200 && T <= 320 && R < 2.5)) { label = '🌍 Habitable Terrestrial'; badgeColor = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'; }
            else if (T > 320 && R < 2.5) { label = '🪨 Rocky Terrestrial'; badgeColor = 'bg-amber-600/20 text-amber-400 border-amber-600/30'; }
            else if (T < 200 && R < 2.5) { label = '🧊 Ice World'; badgeColor = 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'; }
            else if (T <= 500 && R >= 2.5) { label = '🪐 Cold Gas Giant'; badgeColor = 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30'; }
            return (
              <div className={`p-2 rounded-lg text-center text-xs font-bold mb-5 border ${badgeColor}`}>
                {label}
                <span className="block text-[10px] font-normal opacity-70 mt-0.5">Structural Classification</span>
              </div>
            );
          })()}

          <div className="space-y-5">
            <div>
              <h4 className="text-xs font-bold text-blue-300 uppercase tracking-wider mb-3">Planet Properties</h4>
              <div className="space-y-4 text-sm bg-white/5 p-3 rounded-xl border border-white/5">
                <div>
                  <label className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>Radius (Earth Radii)</span>
                    <span className="font-mono text-white">{editedPlanets[selectedPlanetName].pl_rade.toFixed(2)}</span>
                  </label>
                  <input type="range" min="0.1" max="5" step="0.1" value={editedPlanets[selectedPlanetName].pl_rade} onChange={e => handlePlanetChange(selectedPlanetName, 'pl_rade', parseFloat(e.target.value))} className="w-full accent-blue-500" />
                </div>
                <div>
                  <label className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>Distance (AU)</span>
                    <span className="font-mono text-white">{editedPlanets[selectedPlanetName].pl_orbsmax.toFixed(3)}</span>
                  </label>
                  <input type="range" min="0.01" max="5" step="0.01" value={editedPlanets[selectedPlanetName].pl_orbsmax} onChange={e => handlePlanetChange(selectedPlanetName, 'pl_orbsmax', parseFloat(e.target.value))} className="w-full accent-blue-500" />
                </div>
                <div>
                  <label className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>Equilibrium Temp (K)</span>
                    <span className="font-mono text-white">{editedPlanets[selectedPlanetName].pl_eqt.toFixed(1)}</span>
                  </label>
                  <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden mt-2">
                    <div className="h-full bg-gradient-to-r from-blue-500 via-green-500 to-red-500" style={{ width: `${Math.min(100, (editedPlanets[selectedPlanetName].pl_eqt / 1000) * 100)}%` }}></div>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1 text-right">Auto-calculated via physics</p>
                </div>
              </div>
            </div>

            {editedStar && (
              <div>
                <h4 className="text-xs font-bold text-orange-300 uppercase tracking-wider mb-3">Host Star: {editedStar.name}</h4>
                <div className="space-y-4 text-sm bg-white/5 p-3 rounded-xl border border-white/5">
                  <div>
                    <label className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Temperature (K)</span>
                      <span className="font-mono text-white">{editedStar.st_teff?.toFixed(0)}</span>
                    </label>
                    <input type="range" min="2000" max="10000" step="100" value={editedStar.st_teff} onChange={e => handleStarChange('st_teff', parseFloat(e.target.value))} className="w-full accent-orange-500" />
                  </div>
                  <div>
                    <label className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Radius (Solar Radii)</span>
                      <span className="font-mono text-white">{editedStar.st_rad?.toFixed(2)}</span>
                    </label>
                    <input type="range" min="0.1" max="5" step="0.1" value={editedStar.st_rad} onChange={e => handleStarChange('st_rad', parseFloat(e.target.value))} className="w-full accent-orange-500" />
                  </div>
                  <div>
                    <label className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Mass (Solar Masses)</span>
                      <span className="font-mono text-white">{editedStar.st_mass?.toFixed(2)}</span>
                    </label>
                    <input type="range" min="0.1" max="5" step="0.1" value={editedStar.st_mass} onChange={e => handleStarChange('st_mass', parseFloat(e.target.value))} className="w-full accent-orange-500" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <Canvas shadows camera={{ position: [0, 20, 40], fov: 45 }}>
        <color attach="background" args={['#050505']} />
        <ambientLight intensity={0.05} />
        
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
        
        {editedStar && (
          <Star data={editedStar} position={[0, 0, 0]} />
        )}

        {goldilocksZone && (
          <GoldilocksZone innerRadius={goldilocksZone.inner} outerRadius={goldilocksZone.outer} />
        )}

        <Suspense fallback={null}>
          {systemData && Object.keys(editedPlanets).length > 0 && [...systemData.planets]
            .sort((a, b) => (a.pl_orbsmax || 0) - (b.pl_orbsmax || 0))
            .map((planet: any, index: number) => {
            
            const pData = editedPlanets[planet.name];
            if (!pData) return null;

            // Map AU to visual distance
            const maxAU = Math.max(...Object.values(editedPlanets).map((p: any) => p.pl_orbsmax || 1));
            const visualDistance = 6 + (pData.pl_orbsmax / maxAU) * 24;
            
            return (
              <group key={planet.name}>
                <OrbitPath radius={visualDistance} />
                <TexturedExoplanet 
                  data={pData} 
                  prediction={predictions[planet.name]}
                  visualDistance={visualDistance}
                  isSelected={selectedPlanetName === planet.name}
                  onClick={() => setSelectedPlanetName(planet.name)}
                  controlsRef={controlsRef}
                />
              </group>
            );
          })}
        </Suspense>
        
        <OrbitControls 
          ref={controlsRef}
          enablePan={true} 
          enableZoom={true} 
          enableRotate={true}
          maxDistance={150}
          minDistance={5}
        />
      </Canvas>
    </div>
  );
}
