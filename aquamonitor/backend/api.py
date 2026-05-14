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
=============================================================
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import datetime

from data_layer import SensorManager
from analysis_layer import WaterAnalyzer
from alert_layer import AlertSystem

# ─── Inicializar capas ────────────────────────────────────────
app = FastAPI(title="AquaMonitor API", version="1.0.0")

sensor_manager = SensorManager(mode="simulated")
analyzer = WaterAnalyzer(model_type="random_forest")
alert_system = AlertSystem()

# ─── CORS: permite que React (puerto 3000) hable con FastAPI (puerto 8000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Modelos de datos (entrada/salida) ───────────────────────
class LecturaManual(BaseModel):
    ph: float = Field(..., ge=0, le=14, description="Nivel de pH (0–14)")
    turbidity: float = Field(..., ge=0, le=100, description="Turbidez en NTU")
    temperature: float = Field(..., ge=0, le=60, description="Temperatura en °C")

class CambiarModelo(BaseModel):
    modelo: str  # "random_forest" o "neural_network"


def formatear_resultado(reading, result, alerts):
    """Convierte objetos Python en JSON para React."""
    return {
        "lectura": {
            "ph": reading.ph,
            "turbidity": reading.turbidity,
            "temperature": reading.temperature,
            "timestamp": reading.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
        },
        "clasificacion": {
            "label": result.label,
            "nombre": result.label_name,
            "confianza": round(result.confidence, 4),
            "color": result.color,
            "modelo": result.model_used,
            "factores": result.details.get("factores", []),
            "extra": {k: v for k, v in result.details.items() if k != "factores"},
        },
        "alertas": [
            {
                "nivel": a.level,
                "parametro": a.parameter,
                "mensaje": a.message,
                "valor": a.value,
                "hora": a.timestamp.strftime("%H:%M:%S"),
            }
            for a in alerts
        ],
    }


# ─── ENDPOINTS ───────────────────────────────────────────────

@app.get("/")
def raiz():
    return {"mensaje": "AquaMonitor API activa 💧", "version": "1.0.0"}


@app.post("/analizar")
def analizar(lectura: LecturaManual):
    """
    Recibe valores ingresados manualmente desde React
    y retorna la clasificación del modelo ML.
    """
    reading = sensor_manager.get_reading_from_values(
        lectura.ph, lectura.turbidity, lectura.temperature
    )
    result = analyzer.predict(reading)
    alerts = alert_system.evaluate(reading, result)
    return formatear_resultado(reading, result, alerts)


@app.get("/simular")
def simular():
    """
    Genera una lectura aleatoria simulada
    (80% normal, 20% contaminada) y la clasifica.
    """
    reading = sensor_manager.get_reading()
    result = analyzer.predict(reading)
    alerts = alert_system.evaluate(reading, result)
    return formatear_resultado(reading, result, alerts)


@app.get("/historial")
def historial():
    """Retorna todas las lecturas guardadas en esta sesión."""
    readings = sensor_manager.get_history()
    return {
        "total": len(readings),
        "lecturas": [r.to_dict() for r in readings]
    }


@app.get("/modelos")
def listar_modelos():
    """Lista los modelos ML disponibles."""
    return {
        "modelo_activo": analyzer.current_model,
        "disponibles": ["random_forest", "neural_network"]
    }


@app.post("/modelo")
def cambiar_modelo(body: CambiarModelo):
    """Cambia el modelo ML activo."""
    try:
        analyzer.set_model(body.modelo)
        return {"ok": True, "modelo_activo": analyzer.current_model}
    except ValueError as e:
        return {"ok": False, "error": str(e)}
