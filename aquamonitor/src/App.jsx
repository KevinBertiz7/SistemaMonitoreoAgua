import { useState, useEffect, useRef } from "react";

const API = "http://localhost:8000";

// UPC Colors
const UPC = {
  green:      "#2d7a2d",
  greenDark:  "#1a4d1a",
  greenLight: "#4CAF50",
  greenPale:  "#e8f5e8",
  yellow:     "#f9c800",
  white:      "#ffffff",
  gray:       "#f4f6f4",
  text:       "#1a3a1a",
  textLight:  "#556677",
  border:     "#dde8dd",
};

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
  const pts = data.slice(-50).map((v, i, arr) => {
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

// ─── MOTOR DE RECOMENDACIONES ─────────────────────────────────
function generarRecomendaciones(ph, turbidity, temperature, label) {
  const recs = [];

  // ── pH ──
  if (ph < 5.5) {
    recs.push({ tipo: "critical", icono: "🚫", titulo: "pH extremadamente ácido",
      desc: `El pH de ${ph} está muy por debajo del mínimo seguro (6.5). El agua puede corroer tuberías y liberar metales tóxicos.`,
      accion: "Aplicar cal hidratada o bicarbonato de sodio para neutralizar. No consumir bajo ninguna circunstancia." });
  } else if (ph < 6.5) {
    recs.push({ tipo: "warning", icono: "⚠️", titulo: "pH ácido — requiere tratamiento",
      desc: `El pH de ${ph} está por debajo del rango potable (6.5–8.5). Puede causar irritación gastrointestinal.`,
      accion: "Tratar con neutralizadores de pH antes del consumo. Revisar fuentes de acidez (lluvia ácida, contaminación industrial)." });
  } else if (ph > 9.5) {
    recs.push({ tipo: "critical", icono: "🚫", titulo: "pH extremadamente alcalino",
      desc: `El pH de ${ph} supera el límite crítico (9.5). Puede causar daños en mucosas y tracto digestivo.`,
      accion: "No consumir. Aplicar ácido cítrico o dióxido de carbono para reducir pH. Investigar fuente de contaminación alcalina." });
  } else if (ph > 8.5) {
    recs.push({ tipo: "warning", icono: "⚠️", titulo: "pH ligeramente alcalino",
      desc: `El pH de ${ph} está sobre el rango recomendado (8.5). No es peligroso de inmediato pero afecta el sabor y la eficiencia del cloro.`,
      accion: "Monitorear continuamente. Considerar sistemas de ósmosis inversa si persiste." });
  } else {
    recs.push({ tipo: "ok", icono: "✅", titulo: "pH dentro del rango óptimo",
      desc: `El pH de ${ph} está dentro del rango potable (6.5–8.5). Condición adecuada para consumo humano.`,
      accion: "Mantener monitoreo periódico." });
  }

  // ── Turbidez ──
  if (turbidity > 10) {
    recs.push({ tipo: "critical", icono: "🚫", titulo: "Turbidez peligrosamente alta",
      desc: `Turbidez de ${turbidity} NTU indica presencia de sólidos en suspensión, sedimentos o microorganismos. Riesgo biológico elevado.`,
      accion: "No consumir. Aplicar floculación, sedimentación y filtración. Verificar integridad de la fuente hídrica." });
  } else if (turbidity > 4) {
    recs.push({ tipo: "warning", icono: "⚠️", titulo: "Turbidez elevada — filtrar antes de usar",
      desc: `Turbidez de ${turbidity} NTU supera el límite OMS (4 NTU). Puede contener partículas que protejan patógenos de la cloración.`,
      accion: "Filtrar con arena o carbón activado. Aumentar dosis de coagulante si hay planta de tratamiento." });
  } else {
    recs.push({ tipo: "ok", icono: "✅", titulo: "Turbidez aceptable",
      desc: `Turbidez de ${turbidity} NTU está dentro del límite OMS (< 4 NTU). Agua visualmente clara.`,
      accion: "Continuar monitoreo. Mantener filtros en buen estado." });
  }

  // ── Temperatura ──
  if (temperature > 30) {
    recs.push({ tipo: "critical", icono: "🌡️", titulo: "Temperatura crítica — riesgo bacteriano",
      desc: `Temperatura de ${temperature}°C favorece la proliferación acelerada de bacterias como Legionella y E. coli.`,
      accion: "No consumir sin tratamiento. Enfriar el agua y aplicar cloración reforzada. Revisar almacenamiento." });
  } else if (temperature > 25) {
    recs.push({ tipo: "warning", icono: "⚠️", titulo: "Temperatura elevada",
      desc: `Temperatura de ${temperature}°C puede acelerar el crecimiento bacteriano y reducir la eficacia del cloro.`,
      accion: "Aumentar vigilancia microbiológica. Evitar almacenamiento prolongado a esta temperatura." });
  } else {
    recs.push({ tipo: "ok", icono: "✅", titulo: "Temperatura adecuada",
      desc: `Temperatura de ${temperature}°C está dentro del rango aceptable (10–25°C). Condiciones favorables para la conservación del agua.`,
      accion: "Mantener condiciones de almacenamiento actuales." });
  }

  // ── Veredicto global ──
  const veredicto = label === 0
    ? { tipo: "ok", icono: "💧", titulo: "APTA PARA CONSUMO HUMANO",
        desc: "Todos los parámetros evaluados están dentro de las normas de la OMS para agua potable.",
        accion: "El agua puede consumirse directamente. Mantener monitoreo regular cada 24–48 horas." }
    : label === 1
    ? { tipo: "warning", icono: "⚗️", titulo: "REQUIERE TRATAMIENTO ANTES DE CONSUMO",
        desc: "Uno o más parámetros están fuera del rango seguro. El agua presenta riesgo para la salud si se consume sin tratar.",
        accion: "Aplicar los tratamientos indicados por parámetro. Re-analizar antes de habilitar el consumo." }
    : { tipo: "critical", icono: "☣️", titulo: "PELIGROSA — NO CONSUMIR",
        desc: "Los parámetros indican contaminación severa. El consumo puede causar enfermedades graves.",
        accion: "Suspender suministro inmediatamente. Notificar autoridades sanitarias. Buscar fuente alternativa certificada." };

  return { recs, veredicto };
}

// ─── MODAL DETALLE DE LECTURA ─────────────────────────────────
function ReadingModal({ entry, onClose }) {
  if (!entry) return null;
  const c = entry.classification;
  const { recs, veredicto } = generarRecomendaciones(
    entry.ph, entry.turbidity, entry.temperature, c.label
  );

  const barW = (val) => `${Math.round(val * 100)}%`;

  const recColor = { ok: { bg:"#e8f5e8", border:"#a5d6a7", text:"#2e7d32", badge:"#4CAF50" },
    warning: { bg:"#fff8e1", border:"#ffe082", text:"#f57f17", badge:"#f9a825" },
    critical: { bg:"#ffebee", border:"#ef9a9a", text:"#c62828", badge:"#e53935" } };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      overflowY: "auto",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "white", border: `2px solid ${c.color}`,
        borderRadius: 16, padding: 24, width: "100%", maxWidth: 580,
        boxShadow: `0 8px 40px ${c.color}30`, maxHeight: "90vh", overflowY: "auto",
        margin: "auto",
      }}>
        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:18 }}>
          <div>
            <div style={{ fontSize:9, color:"#888", letterSpacing:"0.15em", textTransform:"uppercase", marginBottom:4 }}>
              {entry.time} · {entry.model}
            </div>
            <div style={{ fontSize:20, fontWeight:800, color:c.color }}>
              {c.name}
            </div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#aaa", fontSize:22, cursor:"pointer", lineHeight:1 }}>✕</button>
        </div>

        {/* Valores medidos */}
        <div style={{ background:"#f9fafb", borderRadius:10, padding:"14px 16px", marginBottom:14, border:"1px solid #e0e0e0" }}>
          <div style={{ fontSize:9, color:"#888", letterSpacing:"0.15em", textTransform:"uppercase", marginBottom:12 }}>Valores medidos</div>
          {[
            { label:"pH", value:entry.ph, min:6.5, max:8.5, absMin:0, absMax:14, unit:"", color:"#2d7a2d" },
            { label:"Turbidez", value:entry.turbidity, min:0, max:4, absMin:0, absMax:25, unit:" NTU", color:"#f9a825" },
            { label:"Temperatura", value:entry.temperature, min:10, max:25, absMin:0, absMax:50, unit:"°C", color:"#e53935" },
          ].map(p => {
            const inRange = p.value >= p.min && p.value <= p.max;
            const pct = Math.max(0, Math.min(1, (p.value - p.absMin) / (p.absMax - p.absMin)));
            return (
              <div key={p.label} style={{ marginBottom:12 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                  <span style={{ fontSize:11, color:"#555" }}>{p.label}</span>
                  <span style={{ fontSize:13, fontWeight:700, fontFamily:"monospace", color:inRange?"#2d7a2d":"#e53935" }}>
                    {p.value}{p.unit} {inRange?"✓":"✗"}
                  </span>
                </div>
                <div style={{ height:6, background:"#e8e8e8", borderRadius:3, position:"relative" }}>
                  <div style={{ position:"absolute", height:"100%", borderRadius:3,
                    left:`${((p.min-p.absMin)/(p.absMax-p.absMin))*100}%`,
                    width:`${((p.max-p.min)/(p.absMax-p.absMin))*100}%`,
                    background:"#2d7a2d15", border:"1px solid #2d7a2d30" }}/>
                  <div style={{ width:`${pct*100}%`, height:"100%", background:inRange?p.color:"#e53935", borderRadius:3, opacity:.8 }}/>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", marginTop:2 }}>
                  <span style={{ fontSize:8, color:"#bbb" }}>{p.absMin}</span>
                  <span style={{ fontSize:8, color:"#999" }}>Normal: {p.min}–{p.max}</span>
                  <span style={{ fontSize:8, color:"#bbb" }}>{p.absMax}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Probabilidades */}
        {entry.proba && (
          <div style={{ background:"#f9fafb", borderRadius:10, padding:"14px 16px", marginBottom:14, border:"1px solid #e0e0e0" }}>
            <div style={{ fontSize:9, color:"#888", letterSpacing:"0.15em", textTransform:"uppercase", marginBottom:12 }}>
              Probabilidades — {entry.model}
            </div>
            {[
              { label:"APTA PARA CONSUMO", key:"APTA", color:"#4CAF50" },
              { label:"CONTAMINADA", key:"CONTAMINADA", color:"#f9a825" },
              { label:"PELIGROSA", key:"PELIGROSA", color:"#e53935" },
            ].map(p => (
              <div key={p.key} style={{ marginBottom:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                  <span style={{ fontSize:10, color:"#555" }}>{p.label}</span>
                  <span style={{ fontSize:11, fontWeight:700, fontFamily:"monospace", color:p.color }}>
                    {((entry.proba[p.key]||0)*100).toFixed(1)}%
                  </span>
                </div>
                <div style={{ height:5, background:"#e8e8e8", borderRadius:3 }}>
                  <div style={{ width:barW(entry.proba[p.key]||0), height:"100%", background:p.color, borderRadius:3, opacity:.85, transition:"width .4s" }}/>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── RECOMENDACIONES ── */}
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:9, color:"#888", letterSpacing:"0.15em", textTransform:"uppercase", marginBottom:10 }}>
            🔬 Análisis y Recomendaciones
          </div>

          {/* Veredicto global */}
          {(() => { const col = recColor[veredicto.tipo]; return (
            <div style={{ background:col.bg, border:`2px solid ${col.border}`, borderRadius:10, padding:"14px 16px", marginBottom:12 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                <span style={{ fontSize:20 }}>{veredicto.icono}</span>
                <span style={{ fontWeight:800, fontSize:13, color:col.text }}>{veredicto.titulo}</span>
              </div>
              <div style={{ fontSize:11, color:col.text, marginBottom:6, lineHeight:1.5 }}>{veredicto.desc}</div>
              <div style={{ fontSize:11, background:"rgba(0,0,0,.05)", borderRadius:6, padding:"8px 12px", color:col.text, fontWeight:600 }}>
                🔧 {veredicto.accion}
              </div>
            </div>
          ); })()}

          {/* Por parámetro */}
          {recs.map((r, i) => {
            const col = recColor[r.tipo];
            return (
              <div key={i} style={{ background:col.bg, border:`1px solid ${col.border}`, borderRadius:8, padding:"12px 14px", marginBottom:8 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:5 }}>
                  <span style={{ fontSize:15 }}>{r.icono}</span>
                  <span style={{ fontWeight:700, fontSize:12, color:col.text }}>{r.titulo}</span>
                  <span style={{ marginLeft:"auto", fontSize:9, fontWeight:700, background:col.badge, color:"white", padding:"2px 7px", borderRadius:4 }}>
                    {r.tipo === "ok" ? "OK" : r.tipo === "warning" ? "ATENCIÓN" : "CRÍTICO"}
                  </span>
                </div>
                <div style={{ fontSize:11, color:"#555", marginBottom:6, lineHeight:1.5 }}>{r.desc}</div>
                <div style={{ fontSize:11, color:col.text, fontWeight:600, background:"rgba(0,0,0,.04)", borderRadius:5, padding:"6px 10px" }}>
                  📋 {r.accion}
                </div>
              </div>
            );
          })}
        </div>

        {/* Alertas del sistema */}
        {entry.alerts && entry.alerts.length > 0 && (
          <div style={{ background:"#ffebee", borderRadius:8, padding:"12px 14px", border:"1px solid #ffcdd2" }}>
            <div style={{ fontSize:9, color:"#b71c1c", letterSpacing:".15em", textTransform:"uppercase", marginBottom:8 }}>Alertas del sistema</div>
            {entry.alerts.map((a, i) => (
              <div key={i} style={{ fontSize:11, color:a.nivel==="CRITICAL"?"#c62828":"#f9a825", fontFamily:"monospace", marginBottom:4 }}>
                {a.nivel==="CRITICAL"?"🚨":"⚠"} [{a.parametro}] {a.mensaje}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── UPC LOGO SVG ──────────────────────────────────────────
function UPCLogo({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <polygon points="50,5 90,27 90,73 50,95 10,73 10,27" fill="#1a4d1a" stroke="#f9c800" strokeWidth="2"/>
      <polygon points="50,5 90,27 50,49 10,27" fill="#4CAF50"/>
      <polygon points="10,27 50,49 50,95 10,73" fill="#2d7a2d"/>
      <polygon points="90,27 50,49 50,95 90,73" fill="#1a5c1a"/>
      <circle cx="50" cy="42" r="5" fill="#f9c800"/>
      <line x1="50" y1="47" x2="50" y2="95" stroke="#f9c800" strokeWidth="2.5"/>
      <text x="26" y="76" fill="white" fontSize="11" fontWeight="900" fontFamily="Arial">U</text>
      <text x="63" y="76" fill="white" fontSize="11" fontWeight="900" fontFamily="Arial">C</text>
    </svg>
  );
}

export default function WaterMonitor() {
  const [activeTab, setActiveTab]         = useState("monitor");  // "monitor" | "historial"
  const [ph, setPh]                       = useState("7.2");
  const [turbidity, setTurbidity]         = useState("1.5");
  const [temperature, setTemperature]     = useState("18.0");
  const [result, setResult]               = useState(null);
  const [history, setHistory]             = useState([]);
  const [autoMode, setAutoMode]           = useState(false);
  const [loading, setLoading]             = useState(false);
  const [errors, setErrors]               = useState({});
  const [apiError, setApiError]           = useState(null);
  const [animPulse, setAnimPulse]         = useState(false);
  const [selectedReading, setSelectedReading] = useState(null);
  const [datasetInfo, setDatasetInfo]     = useState(null);
  const [datasetLoading, setDatasetLoading] = useState(false);
  // Firebase historial
  const [fbHistory, setFbHistory]         = useState([]);
  const [fbLoading, setFbLoading]         = useState(false);
  const [fbError, setFbError]             = useState(null);
  const [fbSelected, setFbSelected]       = useState(null);
  // Reentrenamiento
  const [reentrenarLoading, setReentrenarLoading] = useState(false);
  const [reentrenarResult, setReentrenarResult]   = useState(null);

  const autoRef     = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (autoMode) { autoRef.current = setInterval(() => handleSimular(), 3000); }
    else          { clearInterval(autoRef.current); }
    return () => clearInterval(autoRef.current);
  }, [autoMode]);

  // Cargar historial Firebase cuando se cambia a esa pestaña
  useEffect(() => {
    if (activeTab === "historial" && fbHistory.length === 0) cargarHistorialFirebase();
  }, [activeTab]);

  async function cargarHistorialFirebase() {
    setFbLoading(true); setFbError(null);
    try {
      const res  = await fetch(`${API}/historial/firebase`);
      const data = await res.json();
      if (data.ok) setFbHistory(data.registros);
      else         setFbError(data.error || "Error al cargar historial");
    } catch { setFbError("No se puede conectar al servidor."); }
    finally { setFbLoading(false); }
  }

  function procesarRespuesta(data) {
    const entry = {
      id: Date.now(), ph: data.lectura.ph, turbidity: data.lectura.turbidity,
      temperature: data.lectura.temperature,
      classification: {
        label: data.clasificacion.label,
        name:  data.clasificacion.nombre,
        color: data.clasificacion.color === "verde"    ? UPC.greenLight
              : data.clasificacion.color === "amarillo" ? "#f5c518" : "#e53935",
      },
      confidence: data.clasificacion.confianza,
      model: data.clasificacion.modelo,
      factors: data.clasificacion.factores,
      alerts: data.alertas,
      proba: data.clasificacion.extra?.probabilidades_clases || null,
      time: new Date().toLocaleTimeString("es", {hour:"2-digit",minute:"2-digit",second:"2-digit"}),
    };
    setResult(entry);
    setHistory(prev => [...prev, entry]);
    setAnimPulse(true); setTimeout(() => setAnimPulse(false), 600);
    setApiError(null);
  }

  async function handleAnalizar() {
    const errs = {};
    const phN=parseFloat(ph), turbN=parseFloat(turbidity), tempN=parseFloat(temperature);
    if (isNaN(phN)||phN<0||phN>14)      errs.ph="0–14";
    if (isNaN(turbN)||turbN<0||turbN>100) errs.turbidity="0–100";
    if (isNaN(tempN)||tempN<0||tempN>60) errs.temperature="0–60";
    setErrors(errs);
    if (Object.keys(errs).length>0) return;
    setLoading(true);
    try {
      const res  = await fetch(`${API}/analizar`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ph:phN,turbidity:turbN,temperature:tempN})});
      procesarRespuesta(await res.json());
    } catch { setApiError("No se puede conectar al servidor. ¿Está corriendo uvicorn?"); }
    finally { setLoading(false); }
  }

  async function handleSimular() {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/simular`);
      const data = await res.json();
      procesarRespuesta(data);
      setPh(String(data.lectura.ph));
      setTurbidity(String(data.lectura.turbidity));
      setTemperature(String(data.lectura.temperature));
    } catch { setApiError("No se puede conectar al servidor."); }
    finally { setLoading(false); }
  }

  async function handleDataset(e) {
    const file = e.target.files[0]; if (!file) return;
    setDatasetLoading(true);
    const form = new FormData(); form.append("file", file);
    try {
      const res  = await fetch(`${API}/dataset`,{method:"POST",body:form});
      const data = await res.json();
      if (data.ok) { setDatasetInfo(data); setApiError(null); }
      else         { setApiError("Error en dataset: " + data.error); }
    } catch { setApiError("No se pudo conectar al servidor."); }
    finally { setDatasetLoading(false); e.target.value=""; }
  }

  async function handleReentrenar() {
    setReentrenarLoading(true); setReentrenarResult(null);
    try {
      const res  = await fetch(`${API}/reentrenar`, { method: "POST" });
      const data = await res.json();
      setReentrenarResult(data);
      if (!data.ok) setApiError("Error reentrenando: " + data.error);
      else setApiError(null);
    } catch { setApiError("No se pudo conectar al servidor."); }
    finally { setReentrenarLoading(false); }
  }

  const phHistory   = history.map(h=>h.ph);
  const turbHistory = history.map(h=>h.turbidity);
  const tempHistory = history.map(h=>h.temperature);
  const statusColor = result ? result.classification.color : UPC.greenLight;
  const alertCount  = history.filter(h=>h.classification.label>0).length;

  // ── Estilos reutilizables ──
  const cardStyle = { background:"white", border:`1px solid ${UPC.border}`,
    borderRadius:12, borderTop:`3px solid ${UPC.green}`,
    boxShadow:"0 2px 8px rgba(45,122,45,.07)", padding:18 };
  const btnPrimary = {
    background:`linear-gradient(135deg,${UPC.greenDark},${UPC.green})`,
    border:"none", color:"white", borderRadius:8, padding:13,
    fontFamily:"'Segoe UI',sans-serif", fontWeight:700, fontSize:12,
    cursor:"pointer", letterSpacing:".06em", transition:"all .2s",
    display:"flex", alignItems:"center", justifyContent:"center", gap:6 };
  const btnOutline = (active) => ({
    background: active ? `linear-gradient(135deg,${UPC.greenDark},${UPC.green})` : "transparent",
    border: active ? `1px solid ${UPC.green}` : `1px solid ${UPC.border}`,
    color: active ? "white" : UPC.textLight,
    borderRadius:8, padding:"11px", fontFamily:"'Segoe UI',sans-serif",
    fontWeight:700, fontSize:12, cursor:"pointer", letterSpacing:".06em", transition:"all .2s" });

  return (
    <>
    <ReadingModal entry={selectedReading} onClose={() => setSelectedReading(null)} />

    <div style={{ minHeight:"100vh", background:UPC.gray, fontFamily:"'Segoe UI',sans-serif", color:UPC.text }}>
      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #f0f7f0; }
        ::-webkit-scrollbar-thumb { background: #a8d5a8; border-radius: 2px; }
        input[type=number] { background: white; border: 1px solid #dde8dd; color: #1a3a1a;
          border-radius: 8px; padding: 10px 14px; font-family: monospace; font-size: 15px;
          width: 100%; outline: none; transition: border .2s; }
        input[type=number]:focus { border-color: #2d7a2d; }
        input[type=number].err { border-color: #e53935; }
        input[type=range] { -webkit-appearance: none; width: 100%; height: 4px;
          border-radius: 2px; outline: none; cursor: pointer; background: transparent; }
        .hist-row:hover { background: #e8f5e8 !important; cursor: pointer; }
        .tab-btn { background: none; border: none; padding: 14px 20px; cursor: pointer;
          font-size: 13px; font-weight: 700; letter-spacing: .05em; font-family: 'Segoe UI', sans-serif;
          border-bottom: 2px solid transparent; transition: all .2s; color: #7a9a7a; }
        .tab-btn.active { color: #2d7a2d; border-bottom-color: #2d7a2d; }
        .tab-btn:hover { color: #1a4d1a; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.015)} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.3} }
      `}</style>

      {/* ── HEADER ── */}
      <div style={{ background:`linear-gradient(135deg,${UPC.greenDark},${UPC.green})`,
        borderBottom:`3px solid ${UPC.yellow}`, padding:"14px 28px",
        display:"flex", alignItems:"center", justifyContent:"space-between",
        position:"sticky", top:0, zIndex:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <UPCLogo size={40} />
          <div>
            <div style={{ fontWeight:800, fontSize:16, color:"white", letterSpacing:".05em" }}>
              AQUAMONITOR
            </div>
            <div style={{ fontSize:9, color:"#a8d5a8", letterSpacing:".15em", textTransform:"uppercase" }}>
              Universidad Popular del Cesar · Monitoreo Hídrico
            </div>
          </div>
        </div>
        <div style={{ display:"flex", gap:24, alignItems:"center" }}>
          {[{val:history.length,label:"LECTURAS",color:"#a8d5a8"},
            {val:alertCount,label:"ALERTAS",color:alertCount>0?"#ffcdd2":"#a8d5a8"}].map(s=>(
            <div key={s.label} style={{ textAlign:"center" }}>
              <div style={{ fontSize:20, fontWeight:800, fontFamily:"monospace", color:s.color }}>{s.val}</div>
              <div style={{ fontSize:9, color:"#88bb88", letterSpacing:".12em" }}>{s.label}</div>
            </div>
          ))}
          {autoMode && (
            <div style={{ display:"flex", alignItems:"center", gap:6, background:"rgba(255,255,255,.15)",
              border:"1px solid rgba(255,255,255,.3)", borderRadius:6, padding:"4px 10px" }}>
              <div style={{ width:6, height:6, borderRadius:"50%", background:UPC.yellow, animation:"blink 1s infinite" }}/>
              <span style={{ fontSize:10, color:UPC.yellow, fontWeight:700 }}>AUTO</span>
            </div>
          )}
        </div>
      </div>

      {/* ── TABS ── */}
      <div style={{ background:"white", borderBottom:`1px solid ${UPC.border}`, padding:"0 28px",
        display:"flex", gap:4 }}>
        <button className={`tab-btn ${activeTab==="monitor"?"active":""}`}
          onClick={()=>setActiveTab("monitor")}>📡 Monitor</button>
        <button className={`tab-btn ${activeTab==="historial"?"active":""}`}
          onClick={()=>setActiveTab("historial")}>🗄️ Historial Firebase</button>
      </div>

      {/* ── API ERROR ── */}
      {apiError && (
        <div style={{ background:"#ffebee", borderBottom:"1px solid #ffcdd2", padding:"10px 28px",
          fontSize:12, color:"#c62828", display:"flex", alignItems:"center", gap:8 }}>
          🚨 {apiError}
        </div>
      )}

      {/* ── DATASET BANNER ── */}
      {datasetInfo && (
        <div style={{ background:"#e8f5e8", borderBottom:`1px solid ${UPC.border}`,
          padding:"10px 28px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:16 }}>📂</span>
            <div>
              <div style={{ fontSize:12, color:UPC.green, fontWeight:700 }}>
                {datasetInfo.archivo} — {datasetInfo.muestras} muestras cargadas
              </div>
              <div style={{ fontSize:10, color:"#5a8a5a", marginTop:2 }}>
                {datasetInfo.tiene_etiquetas ? "Etiquetas reales" : "Etiquetas auto OMS"}
                {" · "}Apta: {datasetInfo.distribucion_clases?.apta}
                {" · "}Contaminada: {datasetInfo.distribucion_clases?.contaminada}
                {" · "}Peligrosa: {datasetInfo.distribucion_clases?.peligrosa}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════
              TAB: MONITOR
          ════════════════════════════════════ */}
      {activeTab === "monitor" && (
        <div style={{ display:"grid", gridTemplateColumns:"360px 1fr", gap:20,
          padding:"20px 28px", maxWidth:1300, margin:"0 auto" }}>

          {/* LEFT */}
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

            {/* Modelo — solo RF */}
            <div style={cardStyle}>
              <div style={{ fontSize:9, color:UPC.textLight, letterSpacing:".15em",
                textTransform:"uppercase", marginBottom:10 }}>Modelo ML</div>
              <div style={{ display:"flex", alignItems:"center", gap:12, background:UPC.greenPale,
                borderRadius:8, padding:"12px 16px", border:`1px solid ${UPC.border}` }}>
                <span style={{ fontSize:22 }}>🌲</span>
                <div>
                  <div style={{ fontWeight:800, color:UPC.green, fontSize:14 }}>Random Forest</div>
                  <div style={{ fontSize:10, color:UPC.textLight, marginTop:2 }}>200 árboles · Profundidad 10 · n_jobs=-1</div>
                </div>
                <div style={{ marginLeft:"auto", background:UPC.green, color:"white",
                  fontSize:9, fontWeight:700, padding:"3px 8px", borderRadius:4, letterSpacing:".08em" }}>
                  ACTIVO
                </div>
              </div>
            </div>

            {/* Sensores */}
            <div style={cardStyle}>
              <div style={{ fontSize:9, color:UPC.textLight, letterSpacing:".15em",
                textTransform:"uppercase", marginBottom:14 }}>Parámetros del Sensor</div>
              {[
                {key:"ph",label:"pH",value:ph,set:setPh,min:0,max:14,step:0.1,nMin:6.5,nMax:8.5,color:UPC.green,unit:""},
                {key:"turbidity",label:"Turbidez",value:turbidity,set:setTurbidity,min:0,max:30,step:0.1,nMin:0,nMax:4,color:"#f9c800",unit:" NTU"},
                {key:"temperature",label:"Temperatura",value:temperature,set:setTemperature,min:0,max:50,step:0.5,nMin:10,nMax:25,color:"#e53935",unit:"°C"},
              ].map(p => {
                const numVal=parseFloat(p.value)||0;
                const inRange=numVal>=p.nMin&&numVal<=p.nMax;
                const pct=Math.max(0,Math.min(1,(numVal-p.min)/(p.max-p.min)));
                return (
                  <div key={p.key} style={{ marginBottom:16 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                      <span style={{ fontSize:10, color:UPC.textLight, letterSpacing:".1em", textTransform:"uppercase" }}>{p.label}</span>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <input type="number" value={p.value} onChange={e=>p.set(e.target.value)}
                          step={p.step} className={errors[p.key]?"err":""}
                          style={{ width:88, padding:"5px 10px", fontSize:14, textAlign:"right" }}/>
                        <span style={{ fontSize:10, color:UPC.textLight, minWidth:26 }}>{p.unit||"—"}</span>
                      </div>
                    </div>
                    <div style={{ position:"relative", height:4, background:UPC.border, borderRadius:2, marginBottom:3 }}>
                      <div style={{ width:`${pct*100}%`, height:"100%",
                        background:inRange?p.color:"#e53935", borderRadius:2, opacity:.8, position:"absolute" }}/>
                      <input type="range" min={p.min} max={p.max} step={p.step} value={numVal}
                        onChange={e=>p.set(e.target.value)}
                        style={{ position:"absolute", top:-6, left:0, width:"100%" }}/>
                      <style>{`input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:${inRange?p.color:"#e53935"};box-shadow:0 0 4px ${inRange?p.color:"#e53935"};cursor:pointer;}`}</style>
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between" }}>
                      <span style={{ fontSize:9, color:"#aaa" }}>{p.min}</span>
                      <span style={{ fontSize:9, color:UPC.textLight }}>Normal: {p.nMin}–{p.nMax}</span>
                      <span style={{ fontSize:9, color:"#aaa" }}>{p.max}</span>
                    </div>
                    {errors[p.key] && <div style={{ fontSize:10, color:"#e53935", marginTop:2 }}>Rango: {errors[p.key]}</div>}
                  </div>
                );
              })}
            </div>

            {/* Botones */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <button onClick={handleAnalizar} disabled={loading} style={btnPrimary}>
                {loading ? <span style={{ display:"inline-block",width:14,height:14,border:"2px solid rgba(255,255,255,.3)",borderTopColor:"white",borderRadius:"50%",animation:"spin .7s linear infinite" }}/> : "📡"} ANALIZAR
              </button>
              <button onClick={handleSimular} disabled={loading}
                style={{ ...btnOutline(false), background:`linear-gradient(135deg,#e8f5e8,${UPC.greenPale})`,
                  border:`1px solid ${UPC.border}`, color:UPC.green }}>
                🎲 SIMULAR
              </button>
            </div>
            <button onClick={()=>setAutoMode(a=>!a)} style={btnOutline(autoMode)}>
              {autoMode?"⏹ DETENER AUTO":"▶ MODO AUTOMÁTICO (cada 3s)"}
            </button>
            <button onClick={()=>window.open(`${API}/reporte`,"_blank")}
              style={{ background:`linear-gradient(135deg,${UPC.greenDark},#1a5c1a)`,
                border:`1px solid ${UPC.yellow}50`, color:UPC.yellow, borderRadius:8, padding:"13px",
                fontFamily:"'Segoe UI',sans-serif", fontWeight:700, fontSize:12, cursor:"pointer",
                letterSpacing:".06em", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
              📋 GENERAR REPORTE DEL MODELO
            </button>
            <input ref={fileInputRef} type="file" accept=".csv" style={{ display:"none" }} onChange={handleDataset}/>
            <button onClick={()=>fileInputRef.current.click()} disabled={datasetLoading}
              style={{ background:datasetInfo?`linear-gradient(135deg,#e8f5e8,#c8e6c8)`:"white",
                border:`1px solid ${UPC.green}50`, color:UPC.green, borderRadius:8, padding:"13px",
                fontFamily:"'Segoe UI',sans-serif", fontWeight:700, fontSize:12, cursor:"pointer",
                letterSpacing:".06em", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
              {datasetLoading
                ? <><span style={{ display:"inline-block",width:12,height:12,border:`2px solid ${UPC.border}`,borderTopColor:UPC.green,borderRadius:"50%",animation:"spin .7s linear infinite" }}/> PROCESANDO...</>
                : "📂 CARGAR DATASET CSV"
              }
            </button>
            {datasetInfo && (
              <button onClick={()=>setDatasetInfo(null)}
                style={{ background:"#ffebee", border:"1px solid #ffcdd2", color:"#c62828",
                  borderRadius:8, padding:"13px", fontFamily:"'Segoe UI',sans-serif",
                  fontWeight:700, fontSize:12, cursor:"pointer", letterSpacing:".06em",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                🗑 LIMPIAR DATASET ({datasetInfo.muestras} filas)
              </button>
            )}

            {/* ── BOTÓN REENTRENAR ── */}
            <button onClick={handleReentrenar} disabled={reentrenarLoading}
              style={{ background: reentrenarLoading
                  ? "#e8f5e8"
                  : `linear-gradient(135deg,#1565C0,#1976D2)`,
                border:`1px solid #1565C030`, color: reentrenarLoading ? UPC.green : "white",
                borderRadius:8, padding:"13px", fontFamily:"'Segoe UI',sans-serif",
                fontWeight:700, fontSize:12, cursor: reentrenarLoading ? "default" : "pointer",
                letterSpacing:".06em", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
              {reentrenarLoading
                ? <><span style={{ display:"inline-block",width:12,height:12,border:`2px solid ${UPC.border}`,borderTopColor:UPC.green,borderRadius:"50%",animation:"spin .7s linear infinite" }}/> REENTRENANDO...</>
                : "🧠 REENTRENAR MODELO"
              }
            </button>

            {/* Resultado del reentrenamiento */}
            {reentrenarResult && (
              <div style={{ background: reentrenarResult.ok ? "#e8f5e8" : "#ffebee",
                border:`1px solid ${reentrenarResult.ok ? UPC.border : "#ffcdd2"}`,
                borderRadius:8, padding:"14px 16px" }}>
                <div style={{ fontSize:11, fontWeight:700,
                  color: reentrenarResult.ok ? UPC.greenDark : "#c62828", marginBottom:8 }}>
                  {reentrenarResult.ok ? "✅ Reentrenamiento exitoso" : "❌ Error en reentrenamiento"}
                </div>
                {reentrenarResult.ok && reentrenarResult.metricas && (
                  <>
                    <div style={{ fontSize:10, color:UPC.textLight, marginBottom:6 }}>
                      {reentrenarResult.mensaje}
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                      {[
                        { l:"Exactitud",  v: (reentrenarResult.metricas.accuracy  * 100).toFixed(2) + "%" },
                        { l:"Precisión",  v: (reentrenarResult.metricas.precision * 100).toFixed(2) + "%" },
                        { l:"Recall",     v: (reentrenarResult.metricas.recall    * 100).toFixed(2) + "%" },
                        { l:"F1-Score",   v: (reentrenarResult.metricas.f1        * 100).toFixed(2) + "%" },
                        { l:"Muestras",   v: reentrenarResult.metricas.total_muestras },
                        { l:"Test set",   v: reentrenarResult.metricas.muestras_test },
                      ].map(m => (
                        <div key={m.l} style={{ background:"white", borderRadius:6,
                          padding:"6px 10px", border:`1px solid ${UPC.border}` }}>
                          <div style={{ fontSize:9, color:UPC.textLight, letterSpacing:".1em" }}>{m.l}</div>
                          <div style={{ fontSize:13, fontWeight:800, color:UPC.greenDark, fontFamily:"monospace" }}>{m.v}</div>
                        </div>
                      ))}
                    </div>
                    {reentrenarResult.metricas.fuentes && (
                      <div style={{ fontSize:9, color:UPC.textLight, marginTop:8 }}>
                        Fuentes: {reentrenarResult.metricas.fuentes.join(" · ")}
                      </div>
                    )}
                  </>
                )}
                {!reentrenarResult.ok && (
                  <div style={{ fontSize:11, color:"#c62828", fontFamily:"monospace" }}>
                    {reentrenarResult.error}
                  </div>
                )}
                <button onClick={()=>setReentrenarResult(null)}
                  style={{ marginTop:8, background:"none", border:"none",
                    fontSize:10, color:UPC.textLight, cursor:"pointer", padding:0 }}>
                  Cerrar ✕
                </button>
              </div>
            )}
          </div>

          {/* RIGHT */}
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

            {/* Result */}
            <div className={animPulse?"pulse":""} style={{ ...cardStyle,
              borderTop:`3px solid ${statusColor}`,
              boxShadow:`0 2px 16px ${statusColor}20`, transition:"all .4s" }}>
              {!result ? (
                <div style={{ textAlign:"center", padding:"36px 0", color:UPC.textLight }}>
                  <div style={{ fontSize:44, marginBottom:12 }}>💧</div>
                  <div style={{ fontSize:13, letterSpacing:".1em" }}>Ingresa parámetros y presiona ANALIZAR</div>
                  <div style={{ fontSize:10, color:"#aaa", marginTop:6 }}>o usa SIMULAR para una lectura automática</div>
                </div>
              ) : (
                <>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
                    <div>
                      <div style={{ fontSize:9, color:UPC.textLight, letterSpacing:".15em", textTransform:"uppercase", marginBottom:6 }}>
                        Clasificación · {result.model}
                      </div>
                      <div style={{ fontSize:22, fontWeight:800, color:statusColor }}>
                        {result.classification.name}
                      </div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:30, fontWeight:800, fontFamily:"monospace", color:statusColor }}>
                        {(result.confidence*100).toFixed(1)}%
                      </div>
                      <div style={{ fontSize:9, color:UPC.textLight, letterSpacing:".12em" }}>CONFIANZA</div>
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:18 }}>
                    <Gauge value={result.ph} min={0} max={14} normalMin={6.5} normalMax={8.5} unit="" label="pH"/>
                    <Gauge value={result.turbidity} min={0} max={20} normalMin={0} normalMax={4} unit=" NTU" label="Turbidez"/>
                    <Gauge value={result.temperature} min={0} max={40} normalMin={10} normalMax={25} unit="°C" label="Temperatura"/>
                  </div>
                  <div style={{ background:UPC.greenPale, borderRadius:8, padding:"12px 16px",
                    border:`1px solid ${UPC.border}`, marginBottom:result.alerts.length?14:0 }}>
                    <div style={{ fontSize:9, color:UPC.textLight, letterSpacing:".15em", textTransform:"uppercase", marginBottom:8 }}>Factores detectados</div>
                    {result.factors.map((f,i)=>(
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                        <div style={{ width:4, height:4, borderRadius:"50%", background:statusColor, flexShrink:0 }}/>
                        <span style={{ fontSize:12, color:UPC.text, fontFamily:"monospace" }}>{f}</span>
                      </div>
                    ))}
                  </div>
                  {result.alerts.length>0 && (
                    <div style={{ background:"#ffebee", borderRadius:8, padding:"12px 16px", border:"1px solid #ffcdd2" }}>
                      <div style={{ fontSize:9, color:"#b71c1c", letterSpacing:".15em", textTransform:"uppercase", marginBottom:8 }}>Alertas activas</div>
                      {result.alerts.map((a,i)=>(
                        <div key={i} style={{ fontSize:11, color:a.nivel==="CRITICAL"?"#c62828":"#f9a825",
                          fontFamily:"monospace", marginBottom:4 }}>
                          {a.nivel==="CRITICAL"?"🚨":"⚠"} [{a.parametro}] {a.mensaje}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Sparklines */}
            {history.length>=2 && (
              <div style={cardStyle}>
                <div style={{ fontSize:9, color:UPC.textLight, letterSpacing:".15em", textTransform:"uppercase", marginBottom:12 }}>
                  Tendencia — últimas {Math.min(50,history.length)} lecturas
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
                  {[
                    {label:"pH",data:phHistory,min:4,max:12,color:UPC.green},
                    {label:"Turbidez NTU",data:turbHistory,min:0,max:20,color:"#f9c800"},
                    {label:"Temperatura °C",data:tempHistory,min:0,max:40,color:"#e53935"},
                  ].map(s=>(
                    <div key={s.label} style={{ background:UPC.greenPale, borderRadius:8,
                      padding:"10px 12px", border:`1px solid ${UPC.border}` }}>
                      <div style={{ fontSize:9, color:UPC.textLight, letterSpacing:".12em", textTransform:"uppercase", marginBottom:6 }}>{s.label}</div>
                      <Sparkline data={s.data} color={s.color} min={s.min} max={s.max}/>
                      <div style={{ fontSize:11, color:s.color, fontFamily:"monospace", marginTop:4, fontWeight:600 }}>
                        {s.data[s.data.length-1]}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Dataset history */}
            {datasetInfo && (
              <div style={cardStyle}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <div style={{ fontSize:9, color:UPC.green, letterSpacing:".15em", textTransform:"uppercase" }}>
                    📂 {datasetInfo.archivo} — {datasetInfo.muestras} muestras
                  </div>
                  <div style={{ fontSize:9, color:UPC.textLight }}>↗ clic para detalle</div>
                </div>
                <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                  {[{l:"Apta",v:datasetInfo.distribucion_clases?.apta,c:UPC.green},
                    {l:"Contaminada",v:datasetInfo.distribucion_clases?.contaminada,c:"#f9c800"},
                    {l:"Peligrosa",v:datasetInfo.distribucion_clases?.peligrosa,c:"#e53935"}].map(s=>(
                    <div key={s.l} style={{ background:UPC.greenPale, borderRadius:6, padding:"4px 10px", border:`1px solid ${s.c}30` }}>
                      <span style={{ fontSize:9, color:UPC.textLight }}>{s.l}: </span>
                      <span style={{ fontSize:11, fontWeight:700, color:s.c, fontFamily:"monospace" }}>{s.v}</span>
                    </div>
                  ))}
                </div>
                <style>{`.hist-row:hover{background:${UPC.greenPale}!important;cursor:pointer}`}</style>
                <div style={{ maxHeight:220, overflowY:"auto" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11, fontFamily:"monospace" }}>
                    <thead>
                      <tr>{["#","pH","Turbidez","Temp","Clase"].map(h=>(
                        <th key={h} style={{ textAlign:"left", padding:"4px 8px", color:UPC.textLight,
                          fontSize:9, letterSpacing:".1em", textTransform:"uppercase",
                          borderBottom:`1px solid ${UPC.border}`, position:"sticky", top:0, background:"white" }}>{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {(datasetInfo._rows||[]).map((row,i)=>(
                        <tr key={i} className="hist-row"
                          onClick={()=>setSelectedReading({id:i,ph:row[0],turbidity:row[1],temperature:row[2],
                            classification:{label:row[3],name:["APTA PARA CONSUMO","CONTAMINADA - TRATAR","PELIGROSA - NO USAR"][row[3]],
                              color:[UPC.greenLight,"#f9a825","#e53935"][row[3]]},
                            confidence:1,model:"Dataset",factors:[],alerts:[],time:`Fila ${i+1}`})}
                          style={{ background:"transparent", transition:"background .15s" }}>
                          <td style={{ padding:"4px 8px", color:UPC.textLight }}>{i+1}</td>
                          <td style={{ padding:"4px 8px", color:row[0]>=6.5&&row[0]<=8.5?UPC.green:"#e53935" }}>{row[0]}</td>
                          <td style={{ padding:"4px 8px", color:row[1]<=4?UPC.green:"#e53935" }}>{row[1]}</td>
                          <td style={{ padding:"4px 8px", color:row[2]>=10&&row[2]<=25?UPC.green:"#e53935" }}>{row[2]}</td>
                          <td style={{ padding:"4px 8px" }}>
                            <span style={{ color:[UPC.greenLight,"#f5c518","#e53935"][row[3]], fontWeight:600 }}>
                              {["✓ APTA","⚠ CONTAM.","✗ PELIGRO"][row[3]]}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Manual history */}
            {history.length>0 && (
              <div style={cardStyle}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <div>
                    <div style={{ fontSize:9, color:UPC.textLight, letterSpacing:".15em", textTransform:"uppercase" }}>
                      📋 Historial de Lecturas
                    </div>
                    <div style={{ fontSize:11, color:UPC.green, fontWeight:700, marginTop:2 }}>
                      {history.length.toLocaleString("es")} lecturas totales
                      {" · "}
                      <span style={{ color:"#e53935" }}>{alertCount} con alertas</span>
                      {" · "}
                      <span style={{ color:UPC.green }}>{history.filter(h=>h.classification.label===0).length} aptas</span>
                    </div>
                  </div>
                  <div style={{ fontSize:9, color:UPC.textLight }}>↗ clic para recomendaciones</div>
                </div>
                {/* Stats bar */}
                {history.length > 0 && (
                  <div style={{ display:"flex", height:8, borderRadius:4, overflow:"hidden", marginBottom:10 }}>
                    {[
                      {c:UPC.greenLight, n:history.filter(h=>h.classification.label===0).length},
                      {c:"#f9a825",     n:history.filter(h=>h.classification.label===1).length},
                      {c:"#e53935",     n:history.filter(h=>h.classification.label===2).length},
                    ].map((s,i)=>(
                      <div key={i} style={{ width:`${(s.n/history.length)*100}%`, background:s.c, transition:"width .3s" }}/>
                    ))}
                  </div>
                )}
                <div style={{ maxHeight:300, overflowY:"auto" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11, fontFamily:"monospace" }}>
                    <thead>
                      <tr>{["#","Hora","pH","Turbidez","Temp","Estado","Conf."].map(h=>(
                        <th key={h} style={{ textAlign:"left", padding:"4px 8px", color:UPC.textLight,
                          fontSize:9, letterSpacing:".1em", textTransform:"uppercase",
                          borderBottom:`1px solid ${UPC.border}`, position:"sticky", top:0, background:"white" }}>{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {[...history].reverse().map((h,i)=>(
                        <tr key={h.id} className="hist-row"
                          onClick={()=>setSelectedReading(h)}
                          style={{ background:i===0?UPC.greenPale:"transparent", transition:"background .15s",
                            borderBottom:`1px solid ${UPC.border}40` }}>
                          <td style={{ padding:"5px 8px", color:"#bbb", fontSize:9 }}>{history.length-i}</td>
                          <td style={{ padding:"5px 8px", color:UPC.textLight }}>{h.time}</td>
                          <td style={{ padding:"5px 8px", color:h.ph>=6.5&&h.ph<=8.5?UPC.green:"#e53935", fontWeight:600 }}>{h.ph}</td>
                          <td style={{ padding:"5px 8px", color:h.turbidity<=4?UPC.green:"#e53935", fontWeight:600 }}>{h.turbidity}</td>
                          <td style={{ padding:"5px 8px", color:h.temperature>=10&&h.temperature<=25?UPC.green:"#e53935", fontWeight:600 }}>{h.temperature}</td>
                          <td style={{ padding:"5px 8px" }}>
                            <span style={{ color:h.classification.color, fontWeight:700, fontSize:10,
                              background:h.classification.color+"15", padding:"2px 6px", borderRadius:4 }}>
                              {["✓ APTA","⚠ CONTAM.","✗ PELIGRO"][h.classification.label]}
                            </span>
                          </td>
                          <td style={{ padding:"5px 8px", color:UPC.textLight }}>{(h.confidence*100).toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════
              TAB: HISTORIAL FIREBASE
          ════════════════════════════════════ */}
      {activeTab === "historial" && (
        <div style={{ maxWidth:1300, margin:"0 auto", padding:"20px 28px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
            <div>
              <div style={{ fontSize:16, fontWeight:800, color:UPC.greenDark }}>🗄️ Historial de Análisis — Firebase</div>
              <div style={{ fontSize:11, color:UPC.textLight, marginTop:4 }}>
                Lecturas guardadas en Firestore · últimas 200 registros
              </div>
            </div>
            <button onClick={cargarHistorialFirebase} disabled={fbLoading}
              style={{ ...btnPrimary, padding:"10px 20px" }}>
              {fbLoading
                ? <><span style={{ display:"inline-block",width:12,height:12,border:"2px solid rgba(255,255,255,.3)",borderTopColor:"white",borderRadius:"50%",animation:"spin .7s linear infinite" }}/> Cargando...</>
                : "🔄 Actualizar"
              }
            </button>
          </div>

          {fbError && (
            <div style={{ background:"#ffebee", border:"1px solid #ffcdd2", borderRadius:8,
              padding:"12px 16px", marginBottom:16, fontSize:12, color:"#c62828" }}>
              ❌ {fbError}
            </div>
          )}

          {fbLoading && !fbHistory.length ? (
            <div style={{ textAlign:"center", padding:"60px 0", color:UPC.textLight }}>
              <div style={{ fontSize:32, marginBottom:12 }}>⏳</div>
              <div>Cargando datos de Firebase...</div>
            </div>
          ) : fbHistory.length === 0 ? (
            <div style={{ textAlign:"center", padding:"60px 0", color:UPC.textLight }}>
              <div style={{ fontSize:32, marginBottom:12 }}>🗄️</div>
              <div>No hay registros en Firebase todavía.</div>
              <div style={{ fontSize:11, marginTop:6, color:"#aaa" }}>Realiza un análisis para guardar el primer registro.</div>
            </div>
          ) : (
            <div style={cardStyle}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                <div style={{ fontSize:9, color:UPC.green, letterSpacing:".15em", textTransform:"uppercase" }}>
                  {fbHistory.length} registros encontrados
                </div>
                <div style={{ display:"flex", gap:12 }}>
                  {[
                    {l:"Apta",v:fbHistory.filter(r=>r.clase===0).length,c:UPC.green},
                    {l:"Contaminada",v:fbHistory.filter(r=>r.clase===1).length,c:"#f9c800"},
                    {l:"Peligrosa",v:fbHistory.filter(r=>r.clase===2).length,c:"#e53935"},
                  ].map(s=>(
                    <div key={s.l} style={{ background:UPC.greenPale, borderRadius:6, padding:"4px 10px", border:`1px solid ${s.c}30` }}>
                      <span style={{ fontSize:9, color:UPC.textLight }}>{s.l}: </span>
                      <span style={{ fontSize:12, fontWeight:700, color:s.c, fontFamily:"monospace" }}>{s.v}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, fontFamily:"monospace" }}>
                  <thead>
                    <tr>{["Fecha","pH","Turbidez","Temp","Clase","Confianza","Modelo","Factores"].map(h=>(
                      <th key={h} style={{ textAlign:"left", padding:"8px 10px", color:UPC.textLight,
                        fontSize:9, letterSpacing:".1em", textTransform:"uppercase",
                        borderBottom:`2px solid ${UPC.green}`, background:"white",
                        position:"sticky", top:0 }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {fbHistory.map((r,i)=>{
                      const claseColor=[UPC.green,"#f9a825","#e53935"][r.clase]||UPC.textLight;
                      const claseLabel=["✓ APTA","⚠ CONTAM.","✗ PELIGROSA"][r.clase]||"—";
                      return (
                        <tr key={r.id} className="hist-row"
                          onClick={()=>setFbSelected(fbSelected?.id===r.id?null:r)}
                          style={{ background:fbSelected?.id===r.id?UPC.greenPale:i%2===0?"white":"#fafffe",
                            transition:"background .15s", borderBottom:`1px solid ${UPC.border}` }}>
                          <td style={{ padding:"8px 10px", color:UPC.textLight, fontSize:10 }}>
                            {r.fecha ? r.fecha.replace("T"," ").slice(0,19) : "—"}
                          </td>
                          <td style={{ padding:"8px 10px", color:r.ph>=6.5&&r.ph<=8.5?UPC.green:"#e53935", fontWeight:600 }}>{r.ph}</td>
                          <td style={{ padding:"8px 10px", color:r.turbidity<=4?UPC.green:"#e53935", fontWeight:600 }}>{r.turbidity}</td>
                          <td style={{ padding:"8px 10px", color:r.temperature>=10&&r.temperature<=25?UPC.green:"#e53935", fontWeight:600 }}>{r.temperature}</td>
                          <td style={{ padding:"8px 10px" }}>
                            <span style={{ color:claseColor, fontWeight:700, fontSize:11 }}>{claseLabel}</span>
                          </td>
                          <td style={{ padding:"8px 10px", color:UPC.text }}>{r.confianza ? `${(r.confianza*100).toFixed(1)}%` : "—"}</td>
                          <td style={{ padding:"8px 10px", color:UPC.textLight, fontSize:10 }}>{r.modelo||"—"}</td>
                          <td style={{ padding:"8px 10px", color:UPC.textLight, fontSize:10 }}>
                            {(r.factores||[]).join(" · ") || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── FOOTER ── */}
      <div style={{ background:UPC.greenDark, borderTop:`3px solid ${UPC.yellow}`,
        padding:"16px 28px", display:"flex", alignItems:"center", justifyContent:"space-between",
        marginTop:20 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <UPCLogo size={28}/>
          <div>
            <div style={{ fontSize:11, color:"white", fontWeight:700 }}>Universidad Popular del Cesar</div>
            <div style={{ fontSize:9, color:"#88bb88", letterSpacing:".1em" }}>© 2025 · Todos los derechos reservados</div>
          </div>
        </div>
        <div style={{ fontSize:9, color:"#5a8a5a", letterSpacing:".1em", textAlign:"right" }}>
          AquaMonitor v2.0 · Random Forest · Firebase Firestore
        </div>
      </div>
    </div>
    </>
  );
}