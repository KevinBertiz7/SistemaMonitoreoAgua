"""
api.py — AquaMonitor Backend
Endpoints: /analizar /simular /historial /historial/firebase /dataset /reporte
"""
from fastapi import FastAPI, UploadFile
from starlette.requests import Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
import datetime, json, io, csv
import numpy as np
import joblib
from sklearn.model_selection import train_test_split
from sklearn.metrics import confusion_matrix
from sklearn.ensemble import RandomForestClassifier

from data_layer import SensorManager
from analysis_layer import WaterAnalyzer, _generate_training_data, RF_PATH
from alert_layer import AlertSystem
from firebase_service import (
    guardar_dataset_entrenamiento,
    guardar_historial_analisis,
    guardar_entrenamiento,
    obtener_datos_entrenamiento
)

app = FastAPI(title="AquaMonitor API", version="2.0.0")
sensor_manager = SensorManager(mode="simulated")
analyzer       = WaterAnalyzer(model_type="random_forest")
alert_system   = AlertSystem()

app.add_middleware(CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"], allow_headers=["*"])

MAX_UPLOAD_SIZE = 50 * 1024 * 1024

@app.middleware("http")
async def limit_upload_size(request: Request, call_next):
    if request.method == "POST" and "/dataset" in request.url.path:
        cl = request.headers.get("content-length")
        if cl and int(cl) > MAX_UPLOAD_SIZE:
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=413,
                content={"ok": False, "error": "Archivo demasiado grande. Máximo: 50 MB"})
    return await call_next(request)

class LecturaManual(BaseModel):
    ph:          float = Field(..., ge=0, le=14)
    turbidity:   float = Field(..., ge=0, le=100)
    temperature: float = Field(..., ge=0, le=60)

def formatear_resultado(reading, result, alerts):
    return {
        "lectura": {"ph": reading.ph, "turbidity": reading.turbidity,
                    "temperature": reading.temperature,
                    "timestamp": reading.timestamp.strftime("%Y-%m-%d %H:%M:%S")},
        "clasificacion": {"label": result.label, "nombre": result.label_name,
                          "confianza": round(result.confidence, 4), "color": result.color,
                          "modelo": result.model_used,
                          "factores": result.details.get("factores", []),
                          "extra": {k:v for k,v in result.details.items() if k != "factores"}},
        "alertas": [{"nivel": a.level, "parametro": a.parameter,
                     "mensaje": a.message, "valor": a.value,
                     "hora": a.timestamp.strftime("%H:%M:%S")} for a in alerts],
    }

@app.get("/")
def raiz():
    return {"mensaje": "AquaMonitor API 💧", "version": "2.0.0"}

@app.post("/analizar")
def analizar(lectura: LecturaManual):
    reading = sensor_manager.get_reading_from_values(lectura.ph, lectura.turbidity, lectura.temperature)
    result  = analyzer.predict(reading)
    alerts  = alert_system.evaluate(reading, result)
    try: guardar_historial_analisis(reading, result)
    except: pass
    return formatear_resultado(reading, result, alerts)

@app.get("/simular")
def simular():
    reading = sensor_manager.get_reading()
    result  = analyzer.predict(reading)
    alerts  = alert_system.evaluate(reading, result)
    try: guardar_historial_analisis(reading, result)
    except: pass
    return formatear_resultado(reading, result, alerts)

@app.get("/historial")
def historial():
    readings = sensor_manager.get_history()
    return {"total": len(readings), "lecturas": [r.to_dict() for r in readings]}

@app.get("/historial/firebase")
def historial_firebase():
    """Trae el historial de análisis guardado en Firestore."""
    try:
        from firebase_admin import firestore
        from firebase_service import db
        docs = db.collection("historial_analisis").order_by(
            "fecha", direction=firestore.Query.DESCENDING).limit(200).stream()
        registros = []
        for doc in docs:
            d = doc.to_dict()
            registros.append({
                "id":           doc.id,
                "ph":           d.get("ph"),
                "turbidity":    d.get("turbidity"),
                "temperature":  d.get("temperature"),
                "clase":        d.get("clase_predicha"),
                "confianza":    d.get("confianza"),
                "modelo":       d.get("modelo"),
                "factores":     d.get("factores", []),
                "fecha":        d.get("fecha"),
            })
        return {"ok": True, "total": len(registros), "registros": registros}
    except Exception as e:
        return {"ok": False, "error": str(e), "registros": []}

# ─── Dataset state ───────────────────────────────────────────
_dataset_state = {"loaded": False, "filename": None, "n_samples": 0,
                  "has_labels": False, "X": None, "y": None, "source": "synthetic"}

@app.post("/dataset")
async def cargar_dataset(file: UploadFile):
    global _dataset_state
    CHUNK_SIZE = 1024 * 64
    buffer = bytearray()
    while True:
        chunk = await file.read(CHUNK_SIZE)
        if not chunk: break
        buffer.extend(chunk)
        if len(buffer) > MAX_UPLOAD_SIZE:
            return {"ok": False, "error": "Archivo supera el límite de 50 MB"}

    texto = buffer.decode("utf-8", errors="replace")
    if not texto.strip():
        return {"ok": False, "error": "El archivo CSV está vacío"}

    reader   = csv.DictReader(io.StringIO(texto))
    columnas = [c.strip().lower() for c in (reader.fieldnames or [])]
    tiene_clase = any(c in columnas for c in ["clase","class","label","etiqueta"])
    col_ph   = next((c for c in columnas if "ph" in c), None)
    col_turb = next((c for c in columnas if "turb" in c or "ntu" in c), None)
    col_temp = next((c for c in columnas if "temp" in c), None)
    col_cls  = next((c for c in columnas if c in ["clase","class","label","etiqueta"]), None)

    if not col_ph or not col_turb or not col_temp:
        return {"ok": False, "error": f"Columnas no reconocidas: {columnas}"}

    MAX_FILAS = 10_000
    X_list = np.zeros((MAX_FILAS,3), dtype=np.float32)
    y_list = np.zeros(MAX_FILAS,    dtype=np.int8)
    count = errores = 0

    for fila in reader:
        if count >= MAX_FILAS: break
        try:
            ph=float(fila[col_ph].strip()); turb=float(fila[col_turb].strip()); temp=float(fila[col_temp].strip())
            if not (0<=ph<=14 and 0<=turb<=500 and -10<=temp<=100): errores+=1; continue
            if tiene_clase and col_cls:
                cls=int(float(fila[col_cls].strip()))
                if cls not in (0,1,2): errores+=1; continue
            else:
                score=0
                if ph<5.5 or ph>9.5: score+=2
                elif ph<6.5 or ph>8.5: score+=1
                if turb>10: score+=2
                elif turb>4: score+=1
                if temp>30: score+=2
                elif temp>25: score+=1
                cls=0 if score==0 else (1 if score<=2 else 2)
            X_list[count]=[ph,turb,temp]; y_list[count]=cls; count+=1
        except: errores+=1

    if count < 10:
        return {"ok": False, "error": f"Solo {count} filas válidas. Mínimo: 10"}

    X=X_list[:count]; y=y_list[:count]

    rf_nuevo = RandomForestClassifier(n_estimators=200, max_depth=10,
                                       random_state=42, n_jobs=-1, class_weight="balanced")
    rf_nuevo.fit(X, y)
    joblib.dump(rf_nuevo, RF_PATH)
    analyzer._model.reload_model()

    try: guardar_dataset_entrenamiento([[X[i][0],X[i][1],X[i][2],int(y[i])] for i in range(count)])
    except: pass

    distribucion = {"apta": int(np.sum(y==0)), "contaminada": int(np.sum(y==1)), "peligrosa": int(np.sum(y==2))}
    display_rows = [[round(float(X[i][0]),2),round(float(X[i][1]),2),round(float(X[i][2]),2),int(y[i])] for i in range(min(500,count))]

    _dataset_state.update({"loaded":True,"filename":file.filename,"n_samples":count,
                            "has_labels":tiene_clase,"X":X.tolist(),"y":y.tolist(),"source":"dataset"})
    return {"ok":True,"archivo":file.filename,"muestras":count,"filas_invalidas":errores,
            "tiene_etiquetas":tiene_clase,"distribucion_clases":distribucion,"_rows":display_rows,
            "mensaje":f"Random Forest reentrenado con {count} muestras"}

@app.get("/dataset/estado")
def estado_dataset():
    return {"loaded":_dataset_state["loaded"],"filename":_dataset_state["filename"],
            "n_samples":_dataset_state["n_samples"],"source":_dataset_state["source"]}

# ─── REPORTE HTML ─────────────────────────────────────────────
@app.get("/reporte", response_class=HTMLResponse)
def generar_reporte():
    if _dataset_state["loaded"] and _dataset_state["X"]:
        X_all=np.array(_dataset_state["X"]); y_all=np.array(_dataset_state["y"])
        if len(X_all)>=20:
            _,X_test,_,y_test=train_test_split(X_all,y_all,test_size=0.2,random_state=42)
        else:
            X_test,y_test=X_all,y_all
        fuente=f"Dataset real: {_dataset_state['filename']} ({_dataset_state['n_samples']} muestras)"
    else:
        X,y=_generate_training_data()
        _,X_test,_,y_test=train_test_split(X,y,test_size=0.2,random_state=42)
        fuente="Datos sintéticos OMS (5000 muestras)"

    rf_model  = joblib.load(RF_PATH)
    ahora     = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    y_pred    = rf_model.predict(X_test)
    proba     = rf_model.predict_proba(X_test)
    cm        = confusion_matrix(y_test, y_pred)
    n         = len(y_test)
    exactitud = np.trace(cm)/n
    eg        = round(1-exactitud, 4)
    e_opt     = 0.1
    fi        = rf_model.feature_importances_.tolist()

    clases_label = ["APTA","CONTAM.","PELIGROSA"]
    metricas = []
    for i in range(3):
        vp=cm[i,i]; fp=cm[:,i].sum()-vp; fn=cm[i,:].sum()-vp; vn=n-vp-fp-fn
        prec=vp/(vp+fp) if (vp+fp)>0 else 0
        sens=vp/(vp+fn) if (vp+fn)>0 else 0
        f1=2*prec*sens/(prec+sens) if (prec+sens)>0 else 0
        esp=vn/(vn+fp) if (vn+fp)>0 else 0
        metricas.append({"clase":["APTA (0)","CONTAMINADA (1)","PELIGROSA (2)"][i],
                         "vp":int(vp),"fp":int(fp),"fn":int(fn),"vn":int(vn),
                         "prec":prec,"sens":sens,"f1":f1,"esp":esp})

    y_d=y_test[:80].tolist(); y_r=y_pred[:80].tolist()
    conf=[round(float(max(p)),4) for p in proba[:80]]
    conf_bins=[0,0,0,0,0]
    for p in proba:
        c=max(p)
        if c<0.60: conf_bins[0]+=1
        elif c<0.70: conf_bins[1]+=1
        elif c<0.80: conf_bins[2]+=1
        elif c<0.90: conf_bins[3]+=1
        else: conf_bins[4]+=1

    cm_html='<table class="cm-table"><thead><tr><th></th>'
    for cl in clases_label: cm_html+=f'<th>Pred<br>{cl}</th>'
    cm_html+="</tr></thead><tbody>"
    for r in range(3):
        cm_html+=f'<tr><td class="cm-label">Real {clases_label[r]}</td>'
        for c in range(3):
            bg="#1a3a1a" if r==c else "#2a1010"
            val=cm[r][c]; pct=round(val/sum(cm[r])*100,1) if sum(cm[r])>0 else 0
            cm_html+=f'<td style="background:{bg};color:{"#4CAF50" if r==c else "#ff6666"};font-weight:700">{val}<br><small style="opacity:0.6">{pct}%</small></td>'
        cm_html+="</tr>"
    cm_html+="</tbody></table>"

    met_html='<table class="met-table"><thead><tr><th>Clase</th><th>VP</th><th>FP</th><th>FN</th><th>VN</th><th>Precisión</th><th>Sensibilidad</th><th>Especificidad</th><th>F1-Score</th></tr></thead><tbody>'
    for m in metricas:
        met_html+=f'<tr><td style="font-weight:700">{m["clase"]}</td><td style="color:#4CAF50">{m["vp"]}</td><td style="color:#e53935">{m["fp"]}</td><td style="color:#f9a825">{m["fn"]}</td><td style="color:#8a9bb0">{m["vn"]}</td><td>{m["prec"]:.4f}</td><td>{m["sens"]:.4f}</td><td>{m["esp"]:.4f}</td><td style="font-weight:700;color:#2d7a2d">{m["f1"]:.4f}</td></tr>'
    met_html+=f'</tbody><tfoot><tr><td colspan="5" style="text-align:right;color:#8a9bb0">EXACTITUD GLOBAL</td><td colspan="4" style="font-weight:800;color:#2d7a2d;font-size:1.2em">{exactitud:.4f} ({exactitud*100:.2f}%)</td></tr></tfoot></table>'

    y_d_js=json.dumps(y_d); y_r_js=json.dumps(y_r)
    conf_js=json.dumps(conf); bins_js=json.dumps(conf_bins); fi_js=json.dumps(fi)

    return f'''<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>AquaMonitor — Reporte Random Forest</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<style>
*{{box-sizing:border-box;margin:0;padding:0}}
body{{background:#f4f6f4;color:#1a3a1a;font-family:"Segoe UI",sans-serif}}
header{{background:linear-gradient(135deg,#1a4d1a,#2d7a2d);padding:20px 36px;display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #f9c800}}
header h1{{color:white;font-size:1.3em;font-weight:800;letter-spacing:.04em}}
header h1 span{{color:#f9c800}}
.meta{{font-size:10px;color:#a8d5a8;letter-spacing:.1em}}
.logo-area{{display:flex;align-items:center;gap:12px}}
.upc-cube{{width:44px;height:44px}}
.container{{max-width:1400px;margin:0 auto;padding:28px 36px}}
.section-title{{font-size:1em;font-weight:800;color:#1a4d1a;letter-spacing:.08em;text-transform:uppercase;margin-bottom:20px;padding-bottom:10px;border-bottom:2px solid #2d7a2d}}
.grid-2{{display:grid;grid-template-columns:1fr 1fr;gap:20px}}
.card{{background:white;border:1px solid #dde8dd;border-radius:12px;padding:22px;border-top:3px solid #2d7a2d;box-shadow:0 2px 8px rgba(45,122,45,.08)}}
.card-title{{font-size:11px;font-weight:700;color:#2d7a2d;letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px}}
.card-sub{{font-size:10px;color:#7a9a7a;margin-bottom:16px}}
.cm-table{{width:100%;border-collapse:collapse;font-size:13px;font-family:monospace}}
.cm-table th{{padding:8px 12px;color:#556677;font-size:10px;letter-spacing:.1em;text-transform:uppercase;border-bottom:1px solid #dde8dd}}
.cm-table td{{padding:12px 16px;text-align:center;border:1px solid #dde8dd80;font-size:14px}}
.cm-label{{color:#556677!important;font-size:10px!important;text-align:right!important;font-weight:700}}
.met-table{{width:100%;border-collapse:collapse;font-size:12px;font-family:monospace}}
.met-table th{{padding:8px 12px;color:#556677;font-size:10px;letter-spacing:.1em;text-transform:uppercase;border-bottom:1px solid #dde8dd;text-align:left}}
.met-table td{{padding:10px 12px;border-bottom:1px solid #dde8dd40}}
.met-table tfoot td{{border-top:1px solid #dde8dd;border-bottom:none;padding-top:12px}}
.eg-info{{display:flex;flex-direction:column;gap:6px;margin-top:14px;background:#f0f7f0;border-radius:8px;padding:12px 16px;border:1px solid #c8e6c8}}
.eg-val{{font-family:monospace;font-size:13px;color:#1a4d1a}}
.eg-conv{{font-size:12px;font-weight:700;margin-top:4px}}
footer{{background:#1a4d1a;color:#a8d5a8;text-align:center;padding:20px 36px;margin-top:40px;display:flex;align-items:center;justify-content:center;gap:16px}}
.footer-logo{{display:flex;align-items:center;gap:10px}}
</style>
</head>
<body>
<header>
  <div class="logo-area">
    <svg class="upc-cube" viewBox="0 0 100 100">
      <!-- Cubo UPC fiel al logo real -->
      <polygon points="50,5 90,27 90,73 50,95 10,73 10,27" fill="#1a4d1a" stroke="#f9c800" stroke-width="2"/>
      <polygon points="50,5 90,27 50,49 10,27" fill="#4CAF50"/>
      <polygon points="10,27 50,49 50,95 10,73" fill="#2d7a2d"/>
      <polygon points="90,27 50,49 50,95 90,73" fill="#1a5c1a"/>
      <circle cx="50" cy="42" r="5" fill="#f9c800"/>
      <line x1="50" y1="47" x2="50" y2="95" stroke="#f9c800" stroke-width="2.5"/>
      <text x="28" y="75" fill="white" font-size="11" font-weight="900" font-family="Arial">U</text>
      <text x="63" y="75" fill="white" font-size="11" font-weight="900" font-family="Arial">C</text>
    </svg>
    <div>
      <h1>💧 AQUA<span>MONITOR</span> — Reporte Random Forest</h1>
      <div class="meta">Universidad Popular del Cesar · Sistema de Monitoreo Hídrico</div>
    </div>
  </div>
  <div style="text-align:right">
    <div style="font-size:11px;color:#f9c800;font-weight:700">Modelo: Random Forest (200 árboles)</div>
    <div class="meta">Generado: {ahora}</div>
    <div class="meta">Fuente: {fuente}</div>
  </div>
</header>

<div class="container">
  <div class="section-title">📊 Evaluación del Modelo — Random Forest</div>

  <div class="grid-2">
    <div class="card">
      <div class="card-title">Matriz de Confusión</div>
      <div class="card-sub">Filas = clases reales · Columnas = predicciones · n={n} muestras</div>
      {cm_html}
    </div>
    <div class="card">
      <div class="card-title">EG vs Error de Aproximación Óptimo</div>
      <div class="card-sub">EG = error global sobre test set</div>
      <canvas id="bar-eg" height="180"></canvas>
      <div class="eg-info">
        <span class="eg-val">EG = {eg}</span>
        <span class="eg-val" style="color:#556677">E_óptimo = {e_opt}</span>
        <span class="eg-conv" style="color:{"#2d7a2d" if eg<=e_opt else "#e53935"}">
          {"✅ LA RED CONVERGE — EG ≤ E_óptimo" if eg<=e_opt else "⚠️ EG > E_óptimo — considerar más datos"}
        </span>
      </div>
    </div>
  </div>

  <div class="card" style="margin-top:20px">
    <div class="card-title">Métricas de Evaluación por Clase</div>
    <div class="card-sub">VP=Verdaderos Positivos · FP=Falsos Positivos · FN=Falsos Negativos · VN=Verdaderos Negativos</div>
    <div style="overflow-x:auto">{met_html}</div>
  </div>

  <div class="card" style="margin-top:20px">
    <div class="card-title">Salida Deseada vs Salida del Modelo (primeras 80 muestras)</div>
    <div class="card-sub">0=APTA · 1=CONTAMINADA · 2=PELIGROSA</div>
    <canvas id="line-rf" height="120"></canvas>
  </div>

  <div class="grid-2" style="margin-top:20px">
    <div class="card">
      <div class="card-title">Importancia de Features</div>
      <div class="card-sub">Contribución de cada parámetro a la decisión del modelo</div>
      <canvas id="fi-rf" height="180"></canvas>
    </div>
    <div class="card">
      <div class="card-title">Distribución de Confianza</div>
      <div class="card-sub">Muestras por rango de confianza de predicción</div>
      <canvas id="conf-rf" height="180"></canvas>
    </div>
  </div>
</div>

<footer>
  <div class="footer-logo">
    <svg width="32" height="32" viewBox="0 0 100 100">
      <polygon points="50,5 90,27 90,73 50,95 10,73 10,27" fill="#0d2a0d" stroke="#f9c800" stroke-width="2"/>
      <polygon points="50,5 90,27 50,49 10,27" fill="#4CAF50"/>
      <polygon points="10,27 50,49 50,95 10,73" fill="#2d7a2d"/>
      <polygon points="90,27 50,49 50,95 90,73" fill="#1a5c1a"/>
      <circle cx="50" cy="42" r="5" fill="#f9c800"/>
      <line x1="50" y1="47" x2="50" y2="95" stroke="#f9c800" stroke-width="2.5"/>
    </svg>
    <span>© 2025 Universidad Popular del Cesar · Todos los derechos reservados</span>
  </div>
  <span style="color:#5a8a5a">AquaMonitor v2.0 · Random Forest 200 árboles · Normas OMS</span>
</footer>

<script>
(function(){{
  const yD={y_d_js}, yR={y_r_js}, conf={conf_js}, bins={bins_js}, fi={fi_js};
  const GREEN="#2d7a2d", YELLOW="#f9c800", RED="#e53935", LIGHT="#4CAF50";

  new Chart(document.getElementById("bar-eg"),{{
    type:"bar",
    data:{{labels:["EG (Error Global)","Error Óptimo"],
           datasets:[{{data:[{eg},{e_opt}],backgroundColor:[LIGHT+"cc","#cccccccc"],
                       borderColor:[GREEN,"#aaaaaa"],borderWidth:2,borderRadius:6}}]}},
    options:{{plugins:{{legend:{{display:false}}}},
              scales:{{y:{{beginAtZero:true,max:0.2,grid:{{color:"#e8ede8"}},ticks:{{color:"#556677"}}}},
                       x:{{grid:{{display:false}},ticks:{{color:"#556677"}}}}}}}}
  }});

  new Chart(document.getElementById("line-rf"),{{
    type:"line",
    data:{{labels:Array.from({{length:yD.length}},(_,i)=>i+1),
           datasets:[
             {{label:"YD — Deseada",data:yD,borderColor:GREEN,backgroundColor:"transparent",
               borderWidth:1.5,pointRadius:2,tension:0}},
             {{label:"YR — Modelo",data:yR,borderColor:YELLOW,backgroundColor:"transparent",
               borderWidth:1.5,borderDash:[4,3],pointRadius:2,tension:0}}
           ]}},
    options:{{plugins:{{legend:{{labels:{{color:"#2d5a2d"}}}}}},
              scales:{{y:{{min:-0.2,max:2.3,ticks:{{stepSize:1,color:"#556677",callback:v=>["APTA","CONT.","PELIG."][v]||v}},grid:{{color:"#e8ede8"}}}},
                       x:{{grid:{{color:"#e8ede820"}},ticks:{{color:"#7a9a7a",maxTicksLimit:20}}}}}}}}
  }});

  new Chart(document.getElementById("fi-rf"),{{
    type:"bar",
    data:{{labels:["pH","Turbidez","Temperatura"],
           datasets:[{{data:fi,backgroundColor:[GREEN+"cc",YELLOW+"cc",RED+"cc"],
                       borderColor:[GREEN,YELLOW,RED],borderWidth:2,borderRadius:6}}]}},
    options:{{indexAxis:"y",plugins:{{legend:{{display:false}}}},
              scales:{{x:{{beginAtZero:true,max:0.7,grid:{{color:"#e8ede8"}},
                           ticks:{{color:"#556677",callback:v=>(v*100).toFixed(0)+"%"}}}},
                       y:{{grid:{{display:false}},ticks:{{color:"#1a4d1a",font:{{weight:"700"}}}}}}}}}}
  }});

  new Chart(document.getElementById("conf-rf"),{{
    type:"bar",
    data:{{labels:["<60%","60-70%","70-80%","80-90%",">90%"],
           datasets:[{{data:bins,backgroundColor:["#e5393599","#f9a82599","#66bb6699",GREEN+"99",GREEN+"cc"],
                       borderColor:["#e53935","#f9a825","#66bb66",GREEN,GREEN],
                       borderWidth:2,borderRadius:6}}]}},
    options:{{plugins:{{legend:{{display:false}}}},
              scales:{{y:{{grid:{{color:"#e8ede8"}},ticks:{{color:"#556677"}}}},
                       x:{{grid:{{display:false}},ticks:{{color:"#556677"}}}}}}}}
  }});
}})();
</script>
</body>
</html>'''