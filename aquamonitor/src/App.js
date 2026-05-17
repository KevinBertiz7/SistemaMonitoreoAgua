import { useState, useEffect, useRef } from "react";

const API = "http://localhost:8000";

// ─── GAUGE SVG ─────────────────────────────────────────────────
function Gauge({ value, min, max, normalMin, normalMax, unit, label }) {
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const angle = -135 + pct * 270;
  const r = 52, cx = 64, cy = 64;

  const polarToXY = (angleDeg, radius) => {
    const a = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
  };
  const arcPath = (startAngle, endAngle, radius) => {
    const s = polarToXY(startAngle, radius);
    const e = polarToXY(endAngle, radius);
    const large = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${large} 1 ${e.x} ${e.y}`;
  };

  const needle = polarToXY(angle, 40);
  const isNormal = value >= normalMin && value <= normalMax;
  const color = isNormal ? "#00e5a0" : "#ff4c4c";

  return (
    <div style={{ textAlign: "center" }}>
      <svg viewBox="0 0 128 90" width="160" height="112">
        <path d={arcPath(-135, 135, r)} fill="none" stroke="#1e2a35" strokeWidth="10" strokeLinecap="round" />
        <path d={arcPath(-135, -135 + pct * 270, r)} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
        <line x1={cx} y1={cy} x2={needle.x} y2={needle.y}
          stroke={color} strokeWidth="2.5" strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 3px ${color})` }} />
        <circle cx={cx} cy={cy} r="4" fill={color} />
        <text x={cx} y={cy + 20} textAnchor="middle" fill="white"
          fontSize="13" fontWeight="700" fontFamily="'JetBrains Mono', monospace">
          {value}{unit}
        </text>
      </svg>
      <div style={{ color: "#8a9bb0", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", marginTop: -8 }}>{label}</div>
      <div style={{ fontSize: 10, marginTop: 4, color, fontFamily: "'JetBrains Mono', monospace" }}>
        {isNormal ? "✓ Normal" : "✗ Fuera de rango"}
      </div>
    </div>
  );
}

function Sparkline({ data, color, min, max }) {
  if (data.length < 2) return null;
  const w = 120, h = 28;
  const range = max - min || 1;
  const pts = data.slice(-20).map((v, i, arr) => {
    const x = (i / (arr.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 2px ${color})` }} />
    </svg>
  );
}

// ─── MODAL DETALLE DE LECTURA ─────────────────────────────────
function ReadingModal({ entry, onClose }) {
  if (!entry) return null;
  const c = entry.classification;

  const barW = (val) => `${Math.round(val * 100)}%`;

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 50,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#0d1b2a", border: `1px solid ${c.color}40`,
        borderRadius: 16, padding: 28, width: "100%", maxWidth: 520,
        boxShadow: `0 0 40px ${c.color}20`,
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 9, color: "#445566", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 6 }}>
              {entry.time} · {entry.model}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: c.color, textShadow: `0 0 16px ${c.color}50` }}>
              {c.name}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#445566", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>

        {/* Parámetros */}
        <div style={{ background: "#060d14", borderRadius: 10, padding: "14px 16px", marginBottom: 16, border: "1px solid #1a2d40" }}>
          <div style={{ fontSize: 9, color: "#445566", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 12 }}>Valores medidos</div>
          {[
            { label: "pH", value: entry.ph, min: 6.5, max: 8.5, absMin: 0, absMax: 14, unit: "", color: "#00b4d8" },
            { label: "Turbidez", value: entry.turbidity, min: 0, max: 4, absMin: 0, absMax: 25, unit: " NTU", color: "#f5c518" },
            { label: "Temperatura", value: entry.temperature, min: 10, max: 25, absMin: 0, absMax: 50, unit: "°C", color: "#ff7043" },
          ].map(p => {
            const inRange = p.value >= p.min && p.value <= p.max;
            const pct = Math.max(0, Math.min(1, (p.value - p.absMin) / (p.absMax - p.absMin)));
            return (
              <div key={p.label} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 11, color: "#8a9bb0" }}>{p.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: inRange ? "#00e5a0" : "#ff4c4c" }}>
                    {p.value}{p.unit} {inRange ? "✓" : "✗"}
                  </span>
                </div>
                <div style={{ height: 6, background: "#1a2d3a", borderRadius: 3, position: "relative" }}>
                  {/* rango normal */}
                  <div style={{
                    position: "absolute", height: "100%", borderRadius: 3,
                    left: `${((p.min - p.absMin) / (p.absMax - p.absMin)) * 100}%`,
                    width: `${((p.max - p.min) / (p.absMax - p.absMin)) * 100}%`,
                    background: "#00e5a015", border: "1px solid #00e5a030",
                  }} />
                  {/* valor */}
                  <div style={{ width: `${pct * 100}%`, height: "100%", background: inRange ? p.color : "#ff4c4c", borderRadius: 3, opacity: 0.8 }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                  <span style={{ fontSize: 8, color: "#334455" }}>{p.absMin}</span>
                  <span style={{ fontSize: 8, color: "#445566" }}>Normal: {p.min}–{p.max}</span>
                  <span style={{ fontSize: 8, color: "#334455" }}>{p.absMax}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Probabilidades de los modelos */}
        {entry.proba && (
          <div style={{ background: "#060d14", borderRadius: 10, padding: "14px 16px", marginBottom: 16, border: "1px solid #1a2d40" }}>
            <div style={{ fontSize: 9, color: "#445566", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 12 }}>
              Probabilidades del modelo — {entry.model}
            </div>
            {[
              { label: "APTA PARA CONSUMO", key: "APTA", color: "#00e5a0" },
              { label: "CONTAMINADA", key: "CONTAMINADA", color: "#f5c518" },
              { label: "PELIGROSA", key: "PELIGROSA", color: "#ff4c4c" },
            ].map(p => (
              <div key={p.key} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: "#8a9bb0" }}>{p.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: p.color }}>
                    {((entry.proba[p.key] || 0) * 100).toFixed(1)}%
                  </span>
                </div>
                <div style={{ height: 5, background: "#1a2d3a", borderRadius: 3 }}>
                  <div style={{ width: barW(entry.proba[p.key] || 0), height: "100%", background: p.color, borderRadius: 3, opacity: 0.85, transition: "width 0.4s" }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Factores y alertas */}
        <div style={{ background: "#060d14", borderRadius: 10, padding: "14px 16px", border: "1px solid #1a2d40" }}>
          <div style={{ fontSize: 9, color: "#445566", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 10 }}>Factores detectados</div>
          {entry.factors.map((f, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 5, alignItems: "center" }}>
              <div style={{ width: 4, height: 4, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: "#8a9bb0", fontFamily: "'JetBrains Mono',monospace" }}>{f}</span>
            </div>
          ))}
          {entry.alerts && entry.alerts.length > 0 && (
            <>
              <div style={{ fontSize: 9, color: "#664444", letterSpacing: "0.15em", textTransform: "uppercase", marginTop: 14, marginBottom: 8 }}>Alertas</div>
              {entry.alerts.map((a, i) => (
                <div key={i} style={{ fontSize: 11, color: a.nivel === "CRITICAL" ? "#ff4c4c" : "#f5c518", fontFamily: "'JetBrains Mono',monospace", marginBottom: 4 }}>
                  {a.nivel === "CRITICAL" ? "🚨" : "⚠"} [{a.parametro}] {a.mensaje}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function WaterMonitor() {
  const [ph, setPh] = useState("7.2");
  const [turbidity, setTurbidity] = useState("1.5");
  const [temperature, setTemperature] = useState("18.0");
  const [model, setModel] = useState("random_forest");
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [autoMode, setAutoMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState(null);
  const [animPulse, setAnimPulse] = useState(false);
  const [selectedReading, setSelectedReading] = useState(null);
  const autoRef = useRef(null);

  // ─── Cambiar modelo en el backend ──────────────────────────
  useEffect(() => {
    fetch(`${API}/modelo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelo: model }),
    }).catch(() => {});
  }, [model]);

  // ─── Modo automático ────────────────────────────────────────
  useEffect(() => {
    if (autoMode) {
      autoRef.current = setInterval(() => handleSimular(), 3000);
    } else {
      clearInterval(autoRef.current);
    }
    return () => clearInterval(autoRef.current);
  }, [autoMode]);

  function procesarRespuesta(data) {
    const entry = {
      id: Date.now(),
      ph: data.lectura.ph,
      turbidity: data.lectura.turbidity,
      temperature: data.lectura.temperature,
      classification: {
        label: data.clasificacion.label,
        name: data.clasificacion.nombre,
        color: data.clasificacion.color === "verde" ? "#00e5a0"
          : data.clasificacion.color === "amarillo" ? "#f5c518" : "#ff4c4c",
      },
      confidence: data.clasificacion.confianza,
      model: data.clasificacion.modelo,
      factors: data.clasificacion.factores,
      alerts: data.alertas,
      proba: data.clasificacion.extra?.probabilidades_clases || null,
      time: new Date().toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    };
    setResult(entry);
    setHistory(prev => [...prev.slice(-49), entry]);
    setAnimPulse(true);
    setTimeout(() => setAnimPulse(false), 600);
    setApiError(null);
  }

  async function handleAnalizar() {
    const errs = {};
    const phN = parseFloat(ph);
    const turbN = parseFloat(turbidity);
    const tempN = parseFloat(temperature);
    if (isNaN(phN) || phN < 0 || phN > 14) errs.ph = "0 – 14";
    if (isNaN(turbN) || turbN < 0 || turbN > 100) errs.turbidity = "0 – 100";
    if (isNaN(tempN) || tempN < 0 || tempN > 60) errs.temperature = "0 – 60";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    try {
      const res = await fetch(`${API}/analizar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ph: phN, turbidity: turbN, temperature: tempN }),
      });
      const data = await res.json();
      procesarRespuesta(data);
      setPh(String(phN));
      setTurbidity(String(turbN));
      setTemperature(String(tempN));
    } catch {
      setApiError("No se puede conectar al servidor Python. ¿Está corriendo uvicorn?");
    } finally {
      setLoading(false);
    }
  }

  async function handleSimular() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/simular`);
      const data = await res.json();
      procesarRespuesta(data);
      setPh(String(data.lectura.ph));
      setTurbidity(String(data.lectura.turbidity));
      setTemperature(String(data.lectura.temperature));
    } catch {
      setApiError("No se puede conectar al servidor Python. ¿Está corriendo uvicorn?");
    } finally {
      setLoading(false);
    }
  }

  const statusColor = result ? result.classification.color : "#445566";
  const alertCount = history.filter(h => h.classification.label > 0).length;
  const phHistory = history.map(h => h.ph);
  const turbHistory = history.map(h => h.turbidity);
  const tempHistory = history.map(h => h.temperature);

  return (
    <>
    <ReadingModal entry={selectedReading} onClose={() => setSelectedReading(null)} />
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #070d14 0%, #0d1b2a 50%, #0a1520 100%)",
      fontFamily: "'Syne', 'Segoe UI', sans-serif",
      color: "#cdd9e5", padding: 0, overflow: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0d1b2a; }
        ::-webkit-scrollbar-thumb { background: #1e3a5a; border-radius: 2px; }
        .card { background: rgba(13,27,42,0.85); border: 1px solid #1a2d40; border-radius: 14px; }
        input[type=number] { background: #0a1520; border: 1px solid #1e3a5a; color: #cdd9e5; border-radius: 8px; padding: 10px 14px; font-family: 'JetBrains Mono', monospace; font-size: 15px; width: 100%; outline: none; transition: border 0.2s; }
        input[type=number]:focus { border-color: #00b4d8; }
        input[type=number].err { border-color: #ff4c4c; }
        input[type=range] { -webkit-appearance: none; width: 100%; height: 4px; border-radius: 2px; outline: none; cursor: pointer; background: transparent; }
        .pulse { animation: pulse 0.5s ease; }
        @keyframes pulse { 0%,100% { transform:scale(1); } 50% { transform:scale(1.015); } }
        @keyframes blink { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: "1px solid #1a2d40", padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(7,13,20,0.95)", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,#0077b6,#00b4d8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, boxShadow: "0 0 14px #00b4d840" }}>💧</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: "white", letterSpacing: "0.05em" }}>AQUAMONITOR</div>
            <div style={{ fontSize: 9, color: "#445566", letterSpacing: "0.15em", textTransform: "uppercase" }}>Sistema de Monitoreo · Fuentes Hídricas</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          {[{ val: history.length, label: "LECTURAS", color: "#00b4d8" }, { val: alertCount, label: "ALERTAS", color: alertCount > 0 ? "#ff4c4c" : "#00e5a0" }].map(s => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: s.color }}>{s.val}</div>
              <div style={{ fontSize: 9, color: "#445566", letterSpacing: "0.12em" }}>{s.label}</div>
            </div>
          ))}
          {autoMode && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#0d2a1a", border: "1px solid #00e5a040", borderRadius: 6, padding: "4px 10px" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#00e5a0", animation: "blink 1s infinite" }} />
              <span style={{ fontSize: 10, color: "#00e5a0", fontWeight: 700, letterSpacing: "0.1em" }}>AUTO</span>
            </div>
          )}
        </div>
      </div>

      {/* API error banner */}
      {apiError && (
        <div style={{ background: "#2a0a0a", borderBottom: "1px solid #ff4c4c30", padding: "10px 28px", fontSize: 12, color: "#ff4c4c", display: "flex", alignItems: "center", gap: 8 }}>
          <span>🚨</span> {apiError}
          <span style={{ color: "#664444", marginLeft: 8 }}>→ Ejecuta: <code style={{ background: "#1a0808", padding: "2px 6px", borderRadius: 4 }}>cd backend && uvicorn api:app --reload --port 8000</code></span>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 20, padding: "20px 28px", maxWidth: 1300, margin: "0 auto" }}>

        {/* LEFT */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Model selector */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 9, color: "#445566", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 10 }}>Modelo ML</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[{ key: "random_forest", label: "Random Forest", icon: "🌲" }, { key: "neural_network", label: "Red Neuronal", icon: "🧠" }].map(m => (
                <button key={m.key} onClick={() => setModel(m.key)} style={{
                  background: model === m.key ? "linear-gradient(135deg,#0d2a3a,#0a3d5c)" : "transparent",
                  border: model === m.key ? "1px solid #00b4d860" : "1px solid #1e3a5a",
                  color: model === m.key ? "#00b4d8" : "#556677",
                  borderRadius: 8, padding: "10px 8px", cursor: "pointer",
                  fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 11,
                  transition: "all 0.2s", boxShadow: model === m.key ? "0 0 12px #00b4d820" : "none"
                }}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{m.icon}</div>{m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sliders */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 9, color: "#445566", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 14 }}>Parámetros del Sensor</div>
            {[
              { key: "ph", label: "pH", value: ph, set: setPh, min: 0, max: 14, step: 0.1, nMin: 6.5, nMax: 8.5, color: "#00b4d8", unit: "" },
              { key: "turbidity", label: "Turbidez", value: turbidity, set: setTurbidity, min: 0, max: 30, step: 0.1, nMin: 0, nMax: 4, color: "#f5c518", unit: " NTU" },
              { key: "temperature", label: "Temperatura", value: temperature, set: setTemperature, min: 0, max: 50, step: 0.5, nMin: 10, nMax: 25, color: "#ff7043", unit: "°C" },
            ].map(p => {
              const numVal = parseFloat(p.value) || 0;
              const inRange = numVal >= p.nMin && numVal <= p.nMax;
              const pct = Math.max(0, Math.min(1, (numVal - p.min) / (p.max - p.min)));
              return (
                <div key={p.key} style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 10, color: "#8a9bb0", letterSpacing: "0.1em", textTransform: "uppercase" }}>{p.label}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input type="number" value={p.value} onChange={e => p.set(e.target.value)}
                        step={p.step} className={errors[p.key] ? "err" : ""}
                        style={{ width: 88, padding: "5px 10px", fontSize: 14, textAlign: "right" }} />
                      <span style={{ fontSize: 10, color: "#556677", minWidth: 26 }}>{p.unit || "—"}</span>
                    </div>
                  </div>
                  <div style={{ position: "relative", height: 4, background: "#1e2d3a", borderRadius: 2, marginBottom: 3 }}>
                    <div style={{ width: `${pct * 100}%`, height: "100%", background: inRange ? p.color : "#ff4c4c", borderRadius: 2, opacity: 0.7, position: "absolute" }} />
                    <input type="range" min={p.min} max={p.max} step={p.step} value={numVal}
                      onChange={e => p.set(e.target.value)}
                      style={{ position: "absolute", top: -6, left: 0, width: "100%" }} />
                    <style>{`input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:${inRange ? p.color : "#ff4c4c"};box-shadow:0 0 5px ${inRange ? p.color : "#ff4c4c"};cursor:pointer;}`}</style>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 9, color: "#334455" }}>{p.min}</span>
                    <span style={{ fontSize: 9, color: "#445566" }}>Normal: {p.nMin}–{p.nMax}</span>
                    <span style={{ fontSize: 9, color: "#334455" }}>{p.max}</span>
                  </div>
                  {errors[p.key] && <div style={{ fontSize: 10, color: "#ff4c4c", marginTop: 2 }}>Rango válido: {errors[p.key]}</div>}
                </div>
              );
            })}
          </div>

          {/* Buttons */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <button onClick={handleAnalizar} disabled={loading} style={{ background: loading ? "#0d1b2a" : "linear-gradient(135deg,#0077b6,#00b4d8)", border: "none", color: "white", borderRadius: 8, padding: 13, fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 12, cursor: loading ? "default" : "pointer", letterSpacing: "0.06em", transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              {loading ? <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid #334455", borderTopColor: "#00b4d8", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> : "📡"} ANALIZAR
            </button>
            <button onClick={handleSimular} disabled={loading} style={{ background: "linear-gradient(135deg,#1a3a2a,#0d5c3a)", border: "1px solid #00e5a030", color: "#00e5a0", borderRadius: 8, padding: 13, fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 12, cursor: loading ? "default" : "pointer", letterSpacing: "0.06em", transition: "all 0.2s" }}>
              🎲 SIMULAR
            </button>
          </div>
          <button onClick={() => setAutoMode(a => !a)} style={{ background: autoMode ? "linear-gradient(135deg,#1a3a2a,#0d5c3a)" : "transparent", border: autoMode ? "1px solid #00e5a060" : "1px solid #1e3a5a", color: autoMode ? "#00e5a0" : "#556677", borderRadius: 8, padding: "11px", fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 12, cursor: "pointer", letterSpacing: "0.06em", transition: "all 0.2s" }}>
            {autoMode ? "⏹ DETENER AUTO" : "▶ MODO AUTOMÁTICO (cada 3s)"}
          </button>

          {/* ── Botón Reporte ── */}
          <button
            onClick={() => window.open("http://localhost:8000/reporte", "_blank")}
            onMouseEnter={e => e.currentTarget.style.boxShadow = "0 0 20px #7c3aed35"}
            onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}
            style={{ background: "linear-gradient(135deg,#1a1a3a,#2a1a5c)", border: "1px solid #7c3aed50", color: "#a78bfa", borderRadius: 8, padding: "13px", fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 12, cursor: "pointer", letterSpacing: "0.06em", transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            📋 GENERAR REPORTE DEL MODELO
          </button>
        </div>

        {/* RIGHT */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Result */}
          <div className={`card ${animPulse ? "pulse" : ""}`} style={{ padding: 24, border: result ? `1px solid ${statusColor}30` : "1px solid #1a2d40", boxShadow: result ? `0 0 30px ${statusColor}12` : "none", transition: "all 0.4s" }}>
            {!result ? (
              <div style={{ textAlign: "center", padding: "36px 0", color: "#334455" }}>
                <div style={{ fontSize: 44, marginBottom: 12 }}>💧</div>
                <div style={{ fontSize: 13, letterSpacing: "0.1em" }}>Ingresa parámetros y presiona ANALIZAR</div>
                <div style={{ fontSize: 10, color: "#223344", marginTop: 6 }}>o usa SIMULAR para una lectura automática</div>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                  <div>
                    <div style={{ fontSize: 9, color: "#445566", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 6 }}>Clasificación · {result.model}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: statusColor, textShadow: `0 0 20px ${statusColor}50` }}>{result.classification.name}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 30, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: statusColor }}>{(result.confidence * 100).toFixed(1)}%</div>
                    <div style={{ fontSize: 9, color: "#445566", letterSpacing: "0.12em" }}>CONFIANZA</div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 18 }}>
                  <Gauge value={result.ph} min={0} max={14} normalMin={6.5} normalMax={8.5} unit="" label="pH" />
                  <Gauge value={result.turbidity} min={0} max={20} normalMin={0} normalMax={4} unit=" NTU" label="Turbidez" />
                  <Gauge value={result.temperature} min={0} max={40} normalMin={10} normalMax={25} unit="°C" label="Temperatura" />
                </div>
                <div style={{ background: "#060d14", borderRadius: 8, padding: "12px 16px", border: "1px solid #1a2d40", marginBottom: result.alerts.length ? 14 : 0 }}>
                  <div style={{ fontSize: 9, color: "#445566", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 8 }}>Factores detectados</div>
                  {result.factors.map((f, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <div style={{ width: 4, height: 4, borderRadius: "50%", background: statusColor, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: "#8a9bb0", fontFamily: "'JetBrains Mono',monospace" }}>{f}</span>
                    </div>
                  ))}
                </div>
                {result.alerts.length > 0 && (
                  <div style={{ background: "#1a0808", borderRadius: 8, padding: "12px 16px", border: "1px solid #ff4c4c20" }}>
                    <div style={{ fontSize: 9, color: "#664444", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 8 }}>Alertas activas</div>
                    {result.alerts.map((a, i) => (
                      <div key={i} style={{ fontSize: 11, color: a.nivel === "CRITICAL" ? "#ff4c4c" : "#f5c518", fontFamily: "'JetBrains Mono',monospace", marginBottom: 4 }}>
                        {a.nivel === "CRITICAL" ? "🚨" : "⚠"} [{a.parametro}] {a.mensaje}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Sparklines */}
          {history.length >= 2 && (
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 9, color: "#445566", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 12 }}>Tendencia — últimas {Math.min(20, history.length)} lecturas</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                {[
                  { label: "pH", data: phHistory, min: 4, max: 12, color: "#00b4d8" },
                  { label: "Turbidez NTU", data: turbHistory, min: 0, max: 20, color: "#f5c518" },
                  { label: "Temperatura °C", data: tempHistory, min: 0, max: 40, color: "#ff7043" },
                ].map(s => (
                  <div key={s.label} style={{ background: "#060d14", borderRadius: 8, padding: "10px 12px", border: "1px solid #1a2d40" }}>
                    <div style={{ fontSize: 9, color: "#445566", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>{s.label}</div>
                    <Sparkline data={s.data} color={s.color} min={s.min} max={s.max} />
                    <div style={{ fontSize: 11, color: s.color, fontFamily: "'JetBrains Mono',monospace", marginTop: 4, fontWeight: 600 }}>{s.data[s.data.length - 1]}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* History */}
          {history.length > 0 && (
            <div className="card" style={{ padding: 16, maxHeight: 260, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 9, color: "#445566", letterSpacing: "0.15em", textTransform: "uppercase" }}>Historial de Lecturas</div>
                <div style={{ fontSize: 9, color: "#334455" }}>↗ clic en una fila para ver detalle</div>
              </div>
              <style>{`.hist-row:hover { background: #0d2235 !important; cursor: pointer; }`}</style>
              <div style={{ overflowY: "auto", flex: 1 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "'JetBrains Mono',monospace" }}>
                  <thead>
                    <tr>{["Hora", "pH", "Turbidez", "Temp", "Estado", "Confianza"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "4px 8px", color: "#334455", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", borderBottom: "1px solid #1a2d40" }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {[...history].reverse().map((h, i) => (
                      <tr key={h.id} className="hist-row"
                        onClick={() => setSelectedReading(h)}
                        style={{ background: i === 0 ? "#0a1a2a" : "transparent", transition: "background 0.15s" }}>
                        <td style={{ padding: "5px 8px", color: "#556677" }}>{h.time}</td>
                        <td style={{ padding: "5px 8px", color: h.ph >= 6.5 && h.ph <= 8.5 ? "#00e5a0" : "#ff4c4c" }}>{h.ph}</td>
                        <td style={{ padding: "5px 8px", color: h.turbidity <= 4 ? "#00e5a0" : "#ff4c4c" }}>{h.turbidity}</td>
                        <td style={{ padding: "5px 8px", color: h.temperature >= 10 && h.temperature <= 25 ? "#00e5a0" : "#ff4c4c" }}>{h.temperature}</td>
                        <td style={{ padding: "5px 8px" }}>
                          <span style={{ color: h.classification.color, fontSize: 10, fontWeight: 600 }}>
                            {["✓ APTA", "⚠ CONTAM.", "✗ PELIGRO"][h.classification.label]}
                          </span>
                        </td>
                        <td style={{ padding: "5px 8px", color: "#556677" }}>{(h.confidence * 100).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
}