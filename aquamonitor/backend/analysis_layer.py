"""
=============================================================
  CAPA 2: ANALYSIS LAYER — Solo Random Forest
=============================================================
"""
import os
import numpy as np
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from data_layer import SensorReading

QUALITY_LABELS = {0: "APTA PARA CONSUMO", 1: "CONTAMINADA - TRATAR", 2: "PELIGROSA - NO USAR"}
QUALITY_COLORS = {0: "verde", 1: "amarillo", 2: "rojo"}

BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
RF_PATH     = os.path.join(BASE_DIR, "water_rf_model.pkl")
MLP_PATH    = os.path.join(BASE_DIR, "water_mlp_model.pkl")   # mantenido por compatibilidad
SCALER_PATH = os.path.join(BASE_DIR, "water_scaler.pkl")


class PredictionResult:
    def __init__(self, label, confidence, model_used, details):
        self.label      = label
        self.label_name = QUALITY_LABELS[label]
        self.confidence = confidence
        self.model_used = model_used
        self.details    = details
        self.color      = QUALITY_COLORS[label]


def _generate_training_data(n=5000, seed=42):
    np.random.seed(seed)
    samples, labels = [], []
    for _ in range(n):
        clase = np.random.choice([0,1,2], p=[0.55,0.30,0.15])
        if clase == 0:
            ph=np.random.uniform(6.5,8.5); turb=np.random.uniform(0,4); temp=np.random.uniform(10,25)
        elif clase == 1:
            ph=float(np.random.choice([np.random.uniform(5.5,6.4),np.random.uniform(8.6,9.5)]))
            turb=np.random.uniform(4.1,10); temp=np.random.uniform(25.1,30)
        else:
            ph=float(np.random.choice([np.random.uniform(3,5.4),np.random.uniform(9.6,12)]))
            turb=np.random.uniform(10.1,25); temp=np.random.uniform(30.1,40)
        samples.append([round(ph,2),round(turb,2),round(temp,2)]); labels.append(clase)
    return np.array(samples), np.array(labels)


def _train_and_save():
    print("⚙  Entrenando Random Forest...")
    X, y = _generate_training_data()
    rf = RandomForestClassifier(n_estimators=200, max_depth=10, random_state=42, n_jobs=-1)
    rf.fit(X, y)
    joblib.dump(rf, RF_PATH)
    print(f"   ✓ Random Forest → {RF_PATH}\n   Listo.")


def _ensure_models():
    if not os.path.exists(RF_PATH):
        _train_and_save()


def _build_factors(r, label):
    if label == 0:
        return ["Todos los parámetros dentro del rango normal"]
    flags = []
    if r.ph < 5.5 or r.ph > 9.5:      flags.append(f"pH crítico ({r.ph})")
    elif r.ph < 6.5 or r.ph > 8.5:    flags.append(f"pH fuera de rango ({r.ph})")
    if r.turbidity > 10:               flags.append(f"Turbidez muy alta ({r.turbidity} NTU)")
    elif r.turbidity > 4:             flags.append(f"Turbidez elevada ({r.turbidity} NTU)")
    if r.temperature > 30:            flags.append(f"Temperatura crítica ({r.temperature}°C)")
    elif r.temperature > 25:          flags.append(f"Temperatura elevada ({r.temperature}°C)")
    return flags or ["Parámetros limítrofes detectados"]


class RandomForestModel:
    def __init__(self):
        self.name = "Random Forest"
        _ensure_models()
        self._model = joblib.load(RF_PATH)
        fi = self._model.feature_importances_
        self._fi = {"pH": round(fi[0],3), "Turbidez": round(fi[1],3), "Temperatura": round(fi[2],3)}

    def reload_model(self):
        self._model = joblib.load(RF_PATH)

    def predict(self, reading):
        X     = np.array([[reading.ph, reading.turbidity, reading.temperature]])
        label = int(self._model.predict(X)[0])
        proba = self._model.predict_proba(X)[0]
        details = {
            "factores": _build_factors(reading, label),
            "n_trees": 200,
            "feature_importance": self._fi,
            "probabilidades_clases": {
                "APTA": round(float(proba[0]),4),
                "CONTAMINADA": round(float(proba[1]),4),
                "PELIGROSA": round(float(proba[2]),4),
            }
        }
        return PredictionResult(label, round(float(proba[label]),4), self.name, details)


class WaterAnalyzer:
    def __init__(self, model_type="random_forest"):
        self._model       = RandomForestModel()
        self._model_key   = "random_forest"

    def set_model(self, model_key):
        # Solo Random Forest — se mantiene la firma para compatibilidad
        self._model     = RandomForestModel()
        self._model_key = "random_forest"

    def predict(self, reading):
        return self._model.predict(reading)

    @property
    def current_model(self):
        return "Random Forest"
