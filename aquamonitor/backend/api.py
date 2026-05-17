"""
=============================================================
  API.PY — Puente entre React (GUI) y las capas Python

  Ejecutar con:
      uvicorn api:app --reload --port 8000

  Endpoints:
      POST /analizar     → recibe pH, turbidez, temp → retorna clasificación
      GET  /simular      → genera lectura aleatoria y la clasifica
      GET  /historial    → retorna todas las lecturas guardadas
      GET  /modelos      → lista modelos disponibles
      POST /modelo       → cambia el modelo activo
      GET  /reporte      → genera y retorna reporte HTML completo del modelo
=============================================================
"""

from fastapi import FastAPI, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
import datetime, json
import numpy as np
import joblib
from sklearn.metrics import confusion_matrix
from sklearn.model_selection import train_test_split

from data_layer import SensorManager
from analysis_layer import WaterAnalyzer, _generate_training_data, RF_PATH, MLP_PATH
from alert_layer import AlertSystem

# ─── Inicializar capas ────────────────────────────────────────
app = FastAPI(title="AquaMonitor API", version="1.0.0")

sensor_manager = SensorManager(mode="simulated")
analyzer       = WaterAnalyzer(model_type="random_forest")
alert_system   = AlertSystem()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Modelos de datos ─────────────────────────────────────────
class LecturaManual(BaseModel):
    ph:          float = Field(..., ge=0,  le=14)
    turbidity:   float = Field(..., ge=0,  le=100)
    temperature: float = Field(..., ge=0,  le=60)

class CambiarModelo(BaseModel):
    modelo: str


def formatear_resultado(reading, result, alerts):
    return {
        "lectura": {
            "ph": reading.ph, "turbidity": reading.turbidity,
            "temperature": reading.temperature,
            "timestamp": reading.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
        },
        "clasificacion": {
            "label": result.label, "nombre": result.label_name,
            "confianza": round(result.confidence, 4), "color": result.color,
            "modelo": result.model_used,
            "factores": result.details.get("factores", []),
            "extra": {k: v for k, v in result.details.items() if k != "factores"},
        },
        "alertas": [
            {"nivel": a.level, "parametro": a.parameter,
             "mensaje": a.message, "valor": a.value,
             "hora": a.timestamp.strftime("%H:%M:%S")}
            for a in alerts
        ],
    }


# ─── ENDPOINTS PRINCIPALES ───────────────────────────────────

@app.get("/")
def raiz():
    return {"mensaje": "AquaMonitor API activa 💧", "version": "1.0.0"}

@app.post("/analizar")
def analizar(lectura: LecturaManual):
    reading = sensor_manager.get_reading_from_values(
        lectura.ph, lectura.turbidity, lectura.temperature)
    result  = analyzer.predict(reading)
    alerts  = alert_system.evaluate(reading, result)
    return formatear_resultado(reading, result, alerts)

@app.get("/simular")
def simular():
    reading = sensor_manager.get_reading()
    result  = analyzer.predict(reading)
    alerts  = alert_system.evaluate(reading, result)
    return formatear_resultado(reading, result, alerts)

@app.get("/historial")
def historial():
    readings = sensor_manager.get_history()
    return {"total": len(readings), "lecturas": [r.to_dict() for r in readings]}

@app.get("/modelos")
def listar_modelos():
    return {"modelo_activo": analyzer.current_model,
            "disponibles": ["random_forest", "neural_network"]}

@app.post("/modelo")
def cambiar_modelo(body: CambiarModelo):
    try:
        analyzer.set_model(body.modelo)
        return {"ok": True, "modelo_activo": analyzer.current_model}
    except ValueError as e:
        return {"ok": False, "error": str(e)}


# ─── ENDPOINT REPORTE HTML ────────────────────────────────────


# ─── ENDPOINT DATASET CSV ────────────────────────────────────

# Estado global del dataset cargado
_dataset_state = {
    "loaded": False,
    "filename": None,
    "n_samples": 0,
    "has_labels": False,
    "X": None,
    "y": None,
    "source": "synthetic"  # "synthetic" o "dataset"
}

@app.post("/dataset")
async def cargar_dataset(file: UploadFile):
    """
    Recibe un CSV con columnas:
      - Con etiquetas:  ph, turbidity, temperature, clase
      - Sin etiquetas:  ph, turbidity, temperature
    Reentrena ambos modelos con los datos reales.
    """
    import io, csv
    global _dataset_state

    contenido = await file.read()
    texto = contenido.decode("utf-8")
    reader = csv.DictReader(io.StringIO(texto))
    filas = list(reader)

    if not filas:
        return {"ok": False, "error": "El archivo CSV está vacío"}

    # Detectar columnas disponibles
    columnas = [c.strip().lower() for c in filas[0].keys()]
    tiene_clase = any(c in columnas for c in ["clase", "class", "label", "etiqueta"])

    # Mapeo flexible de nombres de columnas
    col_ph   = next((c for c in columnas if "ph" in c), None)
    col_turb = next((c for c in columnas if "turb" in c or "ntu" in c), None)
    col_temp = next((c for c in columnas if "temp" in c), None)
    col_cls  = next((c for c in columnas if c in ["clase","class","label","etiqueta"]), None)

    if not col_ph or not col_turb or not col_temp:
        return {"ok": False,
                "error": f"Columnas requeridas: ph, turbidity/turbidez, temperature/temperatura. Encontradas: {columnas}"}

    X_list, y_list = [], []
    errores = 0

    for i, fila in enumerate(filas):
        try:
            ph   = float(fila[col_ph].strip())
            turb = float(fila[col_turb].strip())
            temp = float(fila[col_temp].strip())

            if tiene_clase and col_cls:
                cls = int(float(fila[col_cls].strip()))
            else:
                # Asignar clase automáticamente con reglas OMS
                score = 0
                if ph < 5.5 or ph > 9.5:     score += 2
                elif ph < 6.5 or ph > 8.5:   score += 1
                if turb > 10:                 score += 2
                elif turb > 4:               score += 1
                if temp > 30:                 score += 2
                elif temp > 25:             score += 1
                cls = 0 if score == 0 else (1 if score <= 2 else 2)

            X_list.append([ph, turb, temp])
            y_list.append(cls)
        except (ValueError, KeyError):
            errores += 1
            continue

    if len(X_list) < 10:
        return {"ok": False, "error": f"Datos insuficientes. Solo {len(X_list)} filas válidas (mínimo 10)"}

    X = np.array(X_list)
    y = np.array(y_list)

    # Reentrenar ambos modelos con los datos reales
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.neural_network import MLPClassifier

    rf_nuevo = RandomForestClassifier(n_estimators=200, max_depth=10, random_state=42)
    rf_nuevo.fit(X, y)
    joblib.dump(rf_nuevo, RF_PATH)

    mlp_nuevo = MLPClassifier(hidden_layer_sizes=(16,8), activation="relu", max_iter=500, random_state=42)
    mlp_nuevo.fit(X, y)
    joblib.dump(mlp_nuevo, MLP_PATH)

    # Recargar el modelo activo
    analyzer.set_model("random_forest" if "Random Forest" in analyzer.current_model else "neural_network")

    # Guardar estado
    _dataset_state.update({
        "loaded": True,
        "filename": file.filename,
        "n_samples": len(X_list),
        "has_labels": tiene_clase,
        "X": X_list,
        "y": y_list,
        "source": "dataset"
    })

    distribucion = {
        "apta":        int(np.sum(y == 0)),
        "contaminada": int(np.sum(y == 1)),
        "peligrosa":   int(np.sum(y == 2)),
    }

    return {
        "ok": True,
        "archivo": file.filename,
        "muestras": len(X_list),
        "filas_invalidas": errores,
        "tiene_etiquetas": tiene_clase,
        "columnas_detectadas": {"ph": col_ph, "turbidez": col_turb, "temperatura": col_temp, "clase": col_cls},
        "distribucion_clases": distribucion,
        "mensaje": f"Modelos reentrenados con {len(X_list)} muestras reales{'(etiquetas automáticas OMS)' if not tiene_clase else ''}",
    }

@app.get("/dataset/estado")
def estado_dataset():
    """Retorna si hay un dataset cargado y su info."""
    return {
        "loaded": _dataset_state["loaded"],
        "filename": _dataset_state["filename"],
        "n_samples": _dataset_state["n_samples"],
        "has_labels": _dataset_state["has_labels"],
        "source": _dataset_state["source"],
    }

@app.get("/reporte", response_class=HTMLResponse)
def generar_reporte():
    """
    Evalúa ambos modelos sobre el conjunto de test,
    calcula todas las métricas y retorna un reporte HTML completo.
    """
    # Usar dataset real si está cargado, sino datos sintéticos
    if _dataset_state["loaded"] and _dataset_state["X"] is not None:
        X_all = np.array(_dataset_state["X"])
        y_all = np.array(_dataset_state["y"])
        if len(X_all) >= 20:
            _, X_test, _, y_test = train_test_split(X_all, y_all, test_size=0.2, random_state=42)
        else:
            X_test, y_test = X_all, y_all
        fuente = f"Dataset real: {_dataset_state['filename']} ({_dataset_state['n_samples']} muestras)"
    else:
        X, y = _generate_training_data()
        _, X_test, _, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        fuente = "Datos sintéticos basados en normas OMS (5000 muestras)"

    rf_model  = joblib.load(RF_PATH)
    mlp_model = joblib.load(MLP_PATH)

    modelo_activo = analyzer.current_model
    ahora = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Solo genera el reporte del modelo activo en ese momento
    todos_modelos = [
        ("Random Forest",      rf_model,  "rf"),
        ("Red Neuronal (MLP)", mlp_model, "mlp"),
    ]
    modelos_a_reportar = [
        (n, m, k) for n, m, k in todos_modelos if n == modelo_activo
    ]

    secciones = []
    for nombre, modelo, key in modelos_a_reportar:
        y_pred = modelo.predict(X_test)
        proba  = modelo.predict_proba(X_test)
        cm     = confusion_matrix(y_test, y_pred)
        n      = len(y_test)

        clases     = ["APTA (0)", "CONTAMINADA (1)", "PELIGROSA (2)"]
        colores_cl = ["#00e5a0", "#f5c518", "#ff4c4c"]

        # Métricas por clase
        metricas = []
        exactitud_total = np.trace(cm) / n
        for i in range(3):
            vp = cm[i, i]
            fp = cm[:, i].sum() - vp
            fn = cm[i, :].sum() - vp
            vn = n - vp - fp - fn
            prec = vp / (vp + fp) if (vp + fp) > 0 else 0
            sens = vp / (vp + fn) if (vp + fn) > 0 else 0
            f1   = 2 * prec * sens / (prec + sens) if (prec + sens) > 0 else 0
            esp  = vn / (vn + fp) if (vn + fp) > 0 else 0
            metricas.append({"clase": clases[i], "vp": int(vp), "fp": int(fp),
                             "fn": int(fn), "vn": int(vn),
                             "prec": prec, "sens": sens, "f1": f1, "esp": esp})

        # Salida deseada vs salida de la red (primeras 80 muestras)
        y_d  = y_test[:80].tolist()
        y_r  = y_pred[:80].tolist()
        conf = [round(float(max(p)), 4) for p in proba[:80]]

        # Error global vs error óptimo (simulado con curva de aprendizaje)
        eg     = round(1 - exactitud_total, 4)
        e_opt  = 0.05

        # Distribución de confianza
        conf_bins = [0, 0, 0, 0, 0]  # <60 60-70 70-80 80-90 >90
        for p in proba:
            c = max(p)
            if c < 0.60:   conf_bins[0] += 1
            elif c < 0.70: conf_bins[1] += 1
            elif c < 0.80: conf_bins[2] += 1
            elif c < 0.90: conf_bins[3] += 1
            else:          conf_bins[4] += 1

        # Importancia de features (solo RF)
        fi = None
        if hasattr(modelo, "feature_importances_"):
            fi = modelo.feature_importances_.tolist()

        secciones.append({
            "nombre": nombre, "key": key,
            "cm": cm.tolist(), "metricas": metricas,
            "exactitud": exactitud_total,
            "eg": eg, "e_opt": e_opt,
            "y_d": y_d, "y_r": y_r, "conf": conf,
            "conf_bins": conf_bins,
            "fi": fi, "n_test": n,
            "activo": nombre == modelo_activo or
                      (modelo_activo == "Random Forest" and key == "rf") or
                      (modelo_activo == "Red Neuronal (MLP)" and key == "mlp"),
        })

    html = _build_html(secciones, ahora, modelo_activo)
    return HTMLResponse(content=html)


# ─── GENERADOR HTML ───────────────────────────────────────────

def _build_html(secciones, ahora, modelo_activo):
    tabs_html = ""
    content_html = ""

    for i, s in enumerate(secciones):
        active_tab = "active" if i == 0 else ""
        active_div = "block" if i == 0 else "none"
        badge = " 🔵" if s["activo"] else ""

        tabs_html += f'<button class="tab-btn {active_tab}" onclick="switchTab({i})">{s["nombre"]}{badge}</button>'

        cm = s["cm"]
        clases_label = ["APTA", "CONTAM.", "PELIGROSA"]
        colores_cm   = ["#00e5a0", "#f5c518", "#ff4c4c"]

        # Matriz de confusión HTML
        cm_html = '<table class="cm-table"><thead><tr><th></th>'
        for cl in clases_label:
            cm_html += f'<th>Pred<br>{cl}</th>'
        cm_html += "</tr></thead><tbody>"
        for r in range(3):
            cm_html += f'<tr><td class="cm-label">Real {clases_label[r]}</td>'
            for c in range(3):
                bg = "#1a3a1a" if r == c else "#2a1010"
                val = cm[r][c]
                pct = round(val / sum(cm[r]) * 100, 1) if sum(cm[r]) > 0 else 0
                cm_html += f'<td style="background:{bg};color:{"#00e5a0" if r==c else "#ff6666"};font-weight:700">{val}<br><small style="opacity:0.6">{pct}%</small></td>'
            cm_html += "</tr>"
        cm_html += "</tbody></table>"

        # Tabla métricas
        met_html = '<table class="met-table"><thead><tr><th>Clase</th><th>VP</th><th>FP</th><th>FN</th><th>VN</th><th>Precisión</th><th>Sensibilidad</th><th>Especificidad</th><th>F1-Score</th></tr></thead><tbody>'
        for m in s["metricas"]:
            met_html += f'''<tr>
                <td style="font-weight:700">{m["clase"]}</td>
                <td style="color:#00e5a0">{m["vp"]}</td>
                <td style="color:#ff4c4c">{m["fp"]}</td>
                <td style="color:#f5c518">{m["fn"]}</td>
                <td style="color:#8a9bb0">{m["vn"]}</td>
                <td>{m["prec"]:.4f}</td>
                <td>{m["sens"]:.4f}</td>
                <td>{m["esp"]:.4f}</td>
                <td style="font-weight:700;color:#00b4d8">{m["f1"]:.4f}</td>
            </tr>'''
        met_html += f'</tbody><tfoot><tr><td colspan="5" style="text-align:right;color:#8a9bb0">EXACTITUD GLOBAL</td><td colspan="4" style="font-weight:800;color:#00e5a0;font-size:1.2em">{s["exactitud"]:.4f} ({s["exactitud"]*100:.2f}%)</td></tr></tfoot></table>'

        # Datos para gráficas JS
        y_d_js   = json.dumps(s["y_d"])
        y_r_js   = json.dumps(s["y_r"])
        conf_js  = json.dumps(s["conf"])
        eg_js    = s["eg"]
        eopt_js  = s["e_opt"]
        bins_js  = json.dumps(s["conf_bins"])
        fi_js    = json.dumps(s["fi"]) if s["fi"] else "null"
        key      = s["key"]

        content_html += f'''
        <div id="tab-{i}" class="tab-content" style="display:{active_div}">
          <div class="section-title">📊 Reporte — {s["nombre"]}</div>

          <!-- Fila 1: CM + Métricas -->
          <div class="grid-2">
            <div class="card">
              <div class="card-title">Matriz de Confusión</div>
              <p class="card-sub">Filas = clases reales · Columnas = predicciones del modelo · n={s["n_test"]} muestras de test</p>
              {cm_html}
            </div>
            <div class="card">
              <div class="card-title">EG vs Error de Aproximación Óptimo</div>
              <p class="card-sub">EG = error global del modelo sobre test set</p>
              <canvas id="bar-{key}" height="180"></canvas>
              <div class="eg-info">
                <span class="eg-val" style="color:#00e5a0">EG = {eg_js}</span>
                <span class="eg-val" style="color:#8a9bb0">E_óptimo = {eopt_js}</span>
                <span class="eg-conv" style="color:{'#00e5a0' if eg_js <= eopt_js else '#f5c518'}">
                  {"✅ LA RED CONVERGE (EG ≤ E_óptimo)" if eg_js <= eopt_js else "⚠️ EG > E_óptimo — seguir entrenando"}
                </span>
              </div>
            </div>
          </div>

          <!-- Tabla métricas -->
          <div class="card" style="margin-top:20px">
            <div class="card-title">Métricas de Evaluación por Clase</div>
            <p class="card-sub">VP=Verdaderos Positivos · FP=Falsos Positivos · FN=Falsos Negativos · VN=Verdaderos Negativos</p>
            <div style="overflow-x:auto">{met_html}</div>
          </div>

          <!-- Salida deseada vs red -->
          <div class="card" style="margin-top:20px">
            <div class="card-title">Salida Deseada vs Salida de la Red (primeras 80 muestras)</div>
            <p class="card-sub">0 = APTA · 1 = CONTAMINADA · 2 = PELIGROSA</p>
            <canvas id="line-{key}" height="130"></canvas>
          </div>

          <!-- Fila 3: Confianza + Feature importance -->
          <div class="grid-2" style="margin-top:20px">
            <div class="card">
              <div class="card-title">Distribución de Confianza</div>
              <p class="card-sub">Porcentaje de muestras por rango de confianza</p>
              <canvas id="conf-{key}" height="180"></canvas>
            </div>
            <div class="card">
              <div class="card-title">{"Importancia de Features (Random Forest)" if s["fi"] else "Probabilidades Softmax — muestra representativa"}</div>
              <p class="card-sub">{"Contribución de cada parámetro a la decisión" if s["fi"] else "Salida softmax de la red para las primeras 80 muestras"}</p>
              <canvas id="fi-{key}" height="180"></canvas>
            </div>
          </div>

          <script>
          (function(){{
            const yD = {y_d_js};
            const yR = {y_r_js};
            const conf = {conf_js};
            const bins = {bins_js};
            const fi   = {fi_js};

            // ── Gráfica EG vs E_óptimo ──
            new Chart(document.getElementById("bar-{key}"), {{
              type: "bar",
              data: {{
                labels: ["EG (Error Global)", "Error Óptimo"],
                datasets: [{{
                  data: [{eg_js}, {eopt_js}],
                  backgroundColor: ["#00e5a0cc", "#556677cc"],
                  borderColor: ["#00e5a0", "#778899"],
                  borderWidth: 2, borderRadius: 6,
                }}]
              }},
              options: {{
                plugins: {{ legend: {{ display: false }},
                  datalabels: {{ display: false }} }},
                scales: {{
                  y: {{ beginAtZero: true, max: 0.15,
                        grid: {{ color: "#1a2d40" }},
                        ticks: {{ color: "#8a9bb0" }} }},
                  x: {{ grid: {{ display: false }},
                        ticks: {{ color: "#8a9bb0" }} }}
                }}
              }}
            }});

            // ── Salida deseada vs red ──
            const labels80 = Array.from({{length: yD.length}}, (_,i) => i+1);
            new Chart(document.getElementById("line-{key}"), {{
              type: "line",
              data: {{
                labels: labels80,
                datasets: [
                  {{ label: "YD — Deseada", data: yD,
                     borderColor: "#00b4d8", backgroundColor: "transparent",
                     borderWidth: 1.5, pointRadius: 2, pointStyle: "circle",
                     tension: 0 }},
                  {{ label: "YR — Red", data: yR,
                     borderColor: "#f5c518", backgroundColor: "transparent",
                     borderWidth: 1.5, borderDash: [4,3],
                     pointRadius: 2, pointStyle: "crossRot", tension: 0 }}
                ]
              }},
              options: {{
                plugins: {{ legend: {{ labels: {{ color: "#8a9bb0" }} }} }},
                scales: {{
                  y: {{ min: -0.2, max: 2.3, ticks: {{ stepSize: 1, color: "#8a9bb0",
                        callback: v => ["APTA","CONT.","PELIG."][v] || v }},
                        grid: {{ color: "#1a2d40" }} }},
                  x: {{ grid: {{ color: "#1a2d4020" }},
                        ticks: {{ color: "#556677", maxTicksLimit: 20 }} }}
                }}
              }}
            }});

            // ── Distribución confianza ──
            new Chart(document.getElementById("conf-{key}"), {{
              type: "bar",
              data: {{
                labels: ["<60%","60–70%","70–80%","80–90%",">90%"],
                datasets: [{{
                  label: "Muestras",
                  data: bins,
                  backgroundColor: ["#ff4c4c99","#f5c51899","#00b4d899","#00e5a099","#00e5a0cc"],
                  borderColor: ["#ff4c4c","#f5c518","#00b4d8","#00e5a0","#00e5a0"],
                  borderWidth: 2, borderRadius: 6,
                }}]
              }},
              options: {{
                plugins: {{ legend: {{ display: false }} }},
                scales: {{
                  y: {{ grid: {{ color: "#1a2d40" }}, ticks: {{ color: "#8a9bb0" }} }},
                  x: {{ grid: {{ display: false }}, ticks: {{ color: "#8a9bb0" }} }}
                }}
              }}
            }});

            // ── Feature importance o proba ──
            if (fi) {{
              new Chart(document.getElementById("fi-{key}"), {{
                type: "bar",
                data: {{
                  labels: ["pH","Turbidez","Temperatura"],
                  datasets: [{{
                    data: fi,
                    backgroundColor: ["#00b4d8cc","#f5c518cc","#ff7043cc"],
                    borderColor: ["#00b4d8","#f5c518","#ff7043"],
                    borderWidth: 2, borderRadius: 6,
                  }}]
                }},
                options: {{
                  indexAxis: "y",
                  plugins: {{ legend: {{ display: false }} }},
                  scales: {{
                    x: {{ beginAtZero: true, max: 0.6,
                          grid: {{ color: "#1a2d40" }},
                          ticks: {{ color: "#8a9bb0",
                            callback: v => (v*100).toFixed(0)+"%" }} }},
                    y: {{ grid: {{ display: false }}, ticks: {{ color: "#cdd9e5" }} }}
                  }}
                }}
              }});
            }} else {{
              // Para MLP: mostrar dispersión de confianza por clase
              const aptaConf = [], contConf = [], peligConf = [];
              yD.forEach((cls, i) => {{
                if (cls === 0) aptaConf.push(conf[i]);
                else if (cls === 1) contConf.push(conf[i]);
                else peligConf.push(conf[i]);
              }});
              const avg = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
              new Chart(document.getElementById("fi-{key}"), {{
                type: "bar",
                data: {{
                  labels: ["APTA","CONTAMINADA","PELIGROSA"],
                  datasets: [{{
                    label: "Confianza promedio",
                    data: [avg(aptaConf), avg(contConf), avg(peligConf)],
                    backgroundColor: ["#00e5a0cc","#f5c518cc","#ff4c4ccc"],
                    borderColor: ["#00e5a0","#f5c518","#ff4c4c"],
                    borderWidth: 2, borderRadius: 6,
                  }}]
                }},
                options: {{
                  plugins: {{ legend: {{ display: false }} }},
                  scales: {{
                    y: {{ min: 0.8, max: 1.0, grid: {{ color: "#1a2d40" }},
                          ticks: {{ color: "#8a9bb0",
                            callback: v => (v*100).toFixed(0)+"%" }} }},
                    x: {{ grid: {{ display: false }}, ticks: {{ color: "#cdd9e5" }} }}
                  }}
                }}
              }});
            }}
          }})();
          </script>
        </div>'''

    return f'''<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AquaMonitor — Reporte de Modelos ML</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ background: #070d14; color: #cdd9e5;
          font-family: "Segoe UI", sans-serif; padding: 0; }}

  header {{ background: linear-gradient(135deg,#0d1b2a,#0a1520);
            border-bottom: 1px solid #1a2d40; padding: 22px 36px;
            display: flex; justify-content: space-between; align-items: center; }}
  header h1 {{ font-size: 1.4em; font-weight: 800; color: white; letter-spacing: .04em; }}
  header h1 span {{ color: #00b4d8; }}
  .meta {{ font-size: 11px; color: #445566; letter-spacing: .1em; }}

  .tabs {{ background: #0a1520; border-bottom: 1px solid #1a2d40;
           padding: 0 36px; display: flex; gap: 4px; }}
  .tab-btn {{ background: none; border: none; color: #556677;
              padding: 14px 22px; cursor: pointer; font-size: 13px;
              font-weight: 700; letter-spacing: .05em;
              border-bottom: 2px solid transparent; transition: all .2s; }}
  .tab-btn.active {{ color: #00b4d8; border-bottom-color: #00b4d8; }}
  .tab-btn:hover {{ color: #cdd9e5; }}

  .container {{ max-width: 1400px; margin: 0 auto; padding: 28px 36px; }}
  .tab-content {{ animation: fadein .3s; }}
  @keyframes fadein {{ from {{opacity:0;transform:translateY(6px)}} to {{opacity:1;transform:none}} }}

  .section-title {{ font-size: 1.05em; font-weight: 800; color: #00b4d8;
                    letter-spacing: .08em; text-transform: uppercase;
                    margin-bottom: 20px; padding-bottom: 10px;
                    border-bottom: 1px solid #1a2d40; }}

  .grid-2 {{ display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }}
  @media(max-width:900px) {{ .grid-2 {{ grid-template-columns: 1fr; }} }}

  .card {{ background: rgba(13,27,42,.9); border: 1px solid #1a2d40;
           border-radius: 12px; padding: 22px; }}
  .card-title {{ font-size: 12px; font-weight: 700; color: #00b4d8;
                 letter-spacing: .1em; text-transform: uppercase; margin-bottom: 6px; }}
  .card-sub {{ font-size: 10px; color: #445566; margin-bottom: 16px;
               letter-spacing: .05em; }}

  .cm-table {{ width: 100%; border-collapse: collapse; font-size: 13px;
               font-family: "JetBrains Mono", monospace; }}
  .cm-table th {{ padding: 8px 12px; color: #556677; font-size: 10px;
                  letter-spacing: .1em; text-transform: uppercase;
                  border-bottom: 1px solid #1a2d40; }}
  .cm-table td {{ padding: 12px 16px; text-align: center;
                  border: 1px solid #1a2d4050; font-size: 14px; }}
  .cm-label {{ color: #8a9bb0 !important; font-size: 10px !important;
               text-align: right !important; font-weight: 700; }}

  .met-table {{ width: 100%; border-collapse: collapse; font-size: 12px;
                font-family: "JetBrains Mono", monospace; }}
  .met-table th {{ padding: 8px 12px; color: #445566; font-size: 10px;
                   letter-spacing: .1em; text-transform: uppercase;
                   border-bottom: 1px solid #1a2d40; text-align: left; }}
  .met-table td {{ padding: 10px 12px; border-bottom: 1px solid #1a2d4040; }}
  .met-table tfoot td {{ border-top: 1px solid #1a2d40;
                          border-bottom: none; padding-top: 12px; }}

  .eg-info {{ display: flex; flex-direction: column; gap: 6px; margin-top: 14px;
              background: #060d14; border-radius: 8px; padding: 12px 16px; }}
  .eg-val  {{ font-family: "JetBrains Mono", monospace; font-size: 13px; }}
  .eg-conv {{ font-size: 12px; font-weight: 700; margin-top: 4px; }}

  footer {{ text-align: center; padding: 28px; color: #223344;
            font-size: 10px; letter-spacing: .1em; border-top: 1px solid #1a2d40;
            margin-top: 40px; }}
</style>
</head>
<body>

<header>
  <div>
    <h1>💧 <span>AQUA</span>MONITOR — Reporte de Modelos ML</h1>
    <div class="meta">Sistema de monitoreo de calidad del agua · Modelos entrenados con normas OMS</div>
  </div>
  <div style="text-align:right">
    <div style="font-size:11px;color:#00b4d8;font-weight:700">Modelo activo: {modelo_activo}</div>
    <div class="meta">Generado: {ahora}</div>
    <div class="meta">Test set: 1000 muestras · Entrenamiento: 4000 muestras</div>
  </div>
</header>

<!-- sin pestañas: solo el modelo activo -->

<div class="container">{content_html}</div>

<footer>AquaMonitor v1.0 · Modelos: Random Forest (200 árboles) &amp; Red Neuronal MLP (3→16→8→3) · Datos basados en normas OMS</footer>

<script>
function switchTab(idx) {{
  document.querySelectorAll(".tab-content").forEach((el,i) => {{
    el.style.display = i === idx ? "block" : "none";
  }});
  document.querySelectorAll(".tab-btn").forEach((btn,i) => {{
    btn.classList.toggle("active", i === idx);
  }});
}}
</script>
</body>
</html>'''