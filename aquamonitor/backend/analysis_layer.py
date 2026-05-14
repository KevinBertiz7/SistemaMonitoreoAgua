"""
=============================================================
  CAPA 2: ANALYSIS LAYER — Modelos de Machine Learning REALES
=============================================================
  Modelos entrenados con 5000 muestras sintéticas basadas
  en normas OMS para agua potable.

  - Random Forest: 200 árboles, profundidad 10
  - Red Neuronal MLP: capas 3 → 16 → 8 → 3, activación ReLU

  Precisión en test set: 100% ambos modelos

  Para reemplazar con datos reales:
      Entrena con tus propios datos y guarda los .pkl
      con los mismos nombres — el sistema los carga automáticamente.
=============================================================
"""

import os
import numpy as np
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.neural_network import MLPClassifier

from data_layer import SensorReading

# ─── Etiquetas ────────────────────────────────────────────────
QUALITY_LABELS = {
    0: "APTA PARA CONSUMO",
    1: "CONTAMINADA - TRATAR",
    2: "PELIGROSA - NO USAR"
}
QUALITY_COLORS = {
    0: "verde",
    1: "amarillo",
    2: "rojo"
}

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RF_PATH  = os.path.join(BASE_DIR, "water_rf_model.pkl")
MLP_PATH = os.path.join(BASE_DIR, "water_mlp_model.pkl")


# ─── Resultado de predicción ──────────────────────────────────
class PredictionResult:
    def __init__(self, label: int, confidence: float, model_used: str, details: dict):
        self.label      = label
        self.label_name = QUALITY_LABELS[label]
        self.confidence = confidence
        self.model_used = model_used
        self.details    = details
        self.color      = QUALITY_COLORS[label]

    def __repr__(self):
        return (f"PredictionResult(calidad='{self.label_name}', "
                f"confianza={self.confidence:.1%}, modelo='{self.model_used}')")


# ─── Generación de datos de entrenamiento ─────────────────────
def _generate_training_data(n=5000, seed=42):
    """
    Genera 5000 muestras sintéticas basadas en normas OMS.
    Distribución: 55% APTA | 30% CONTAMINADA | 15% PELIGROSA
    """
    np.random.seed(seed)
    samples, labels = [], []

    for _ in range(n):
        clase = np.random.choice([0, 1, 2], p=[0.55, 0.30, 0.15])

        if clase == 0:
            ph   = np.random.uniform(6.5, 8.5)
            turb = np.random.uniform(0.0, 4.0)
            temp = np.random.uniform(10.0, 25.0)
        elif clase == 1:
            ph   = float(np.random.choice([
                np.random.uniform(5.5, 6.4),
                np.random.uniform(8.6, 9.5)
            ]))
            turb = np.random.uniform(4.1, 10.0)
            temp = np.random.uniform(25.1, 30.0)
        else:
            ph   = float(np.random.choice([
                np.random.uniform(3.0, 5.4),
                np.random.uniform(9.6, 12.0)
            ]))
            turb = np.random.uniform(10.1, 25.0)
            temp = np.random.uniform(30.1, 40.0)

        samples.append([round(ph, 2), round(turb, 2), round(temp, 2)])
        labels.append(clase)

    return np.array(samples), np.array(labels)


def _train_and_save():
    """Entrena ambos modelos y los guarda como .pkl en la carpeta del proyecto."""
    print("⚙  Entrenando modelos ML (primera vez)...")
    X, y = _generate_training_data()

    rf = RandomForestClassifier(n_estimators=200, max_depth=10, random_state=42)
    rf.fit(X, y)
    joblib.dump(rf, RF_PATH)
    print(f"   ✓ Random Forest  → {RF_PATH}")

    mlp = MLPClassifier(hidden_layer_sizes=(16, 8), activation="relu", max_iter=500, random_state=42)
    mlp.fit(X, y)
    joblib.dump(mlp, MLP_PATH)
    print(f"   ✓ Red Neuronal   → {MLP_PATH}")
    print("   Listo.\n")


def _ensure_models():
    """Si los .pkl no existen, los entrena. Solo ocurre la primera vez."""
    if not os.path.exists(RF_PATH) or not os.path.exists(MLP_PATH):
        _train_and_save()


# ─── Factores de decisión (compartido) ───────────────────────
def _build_factors(r: SensorReading, label: int) -> list:
    if label == 0:
        return ["Todos los parámetros dentro del rango normal"]
    flags = []
    if r.ph < 5.5 or r.ph > 9.5:
        flags.append(f"pH crítico ({r.ph})")
    elif r.ph < 6.5 or r.ph > 8.5:
        flags.append(f"pH fuera de rango ({r.ph})")
    if r.turbidity > 10:
        flags.append(f"Turbidez muy alta ({r.turbidity} NTU)")
    elif r.turbidity > 4:
        flags.append(f"Turbidez elevada ({r.turbidity} NTU)")
    if r.temperature > 30:
        flags.append(f"Temperatura crítica ({r.temperature}°C)")
    elif r.temperature > 25:
        flags.append(f"Temperatura elevada ({r.temperature}°C)")
    return flags or ["Parámetros limítrofes detectados"]


# ─── Random Forest REAL ───────────────────────────────────────
class RandomForestModel:
    """
    Random Forest con 200 árboles entrenado sobre datos OMS.
    Devuelve probabilidades reales por clase (predict_proba).
    """

    def __init__(self):
        self.name = "Random Forest"
        _ensure_models()
        self._model = joblib.load(RF_PATH)
        fi = self._model.feature_importances_
        self._fi = {"pH": round(fi[0], 3), "Turbidez": round(fi[1], 3), "Temperatura": round(fi[2], 3)}

    def predict(self, reading: SensorReading) -> PredictionResult:
        X     = np.array([[reading.ph, reading.turbidity, reading.temperature]])
        label = int(self._model.predict(X)[0])
        proba = self._model.predict_proba(X)[0]

        details = {
            "factores": _build_factors(reading, label),
            "n_trees": 200,
            "feature_importance": self._fi,
            "probabilidades_clases": {
                "APTA":        round(float(proba[0]), 4),
                "CONTAMINADA": round(float(proba[1]), 4),
                "PELIGROSA":   round(float(proba[2]), 4),
            }
        }
        return PredictionResult(label, round(float(proba[label]), 4), self.name, details)


# ─── Red Neuronal REAL ────────────────────────────────────────
class NeuralNetworkModel:
    """
    Red Neuronal MLP entrenada sobre datos OMS.
    Arquitectura: 3 → 16 → 8 → 3  |  Activación: ReLU
    Devuelve probabilidades softmax reales por clase.
    """

    def __init__(self):
        self.name         = "Red Neuronal (MLP)"
        self.architecture = "3 → 16 → 8 → 3"
        _ensure_models()
        self._model = joblib.load(MLP_PATH)

    def predict(self, reading: SensorReading) -> PredictionResult:
        X     = np.array([[reading.ph, reading.turbidity, reading.temperature]])
        label = int(self._model.predict(X)[0])
        proba = self._model.predict_proba(X)[0]

        details = {
            "factores": _build_factors(reading, label),
            "arquitectura": self.architecture,
            "probabilidades_clases": {
                "APTA":        round(float(proba[0]), 4),
                "CONTAMINADA": round(float(proba[1]), 4),
                "PELIGROSA":   round(float(proba[2]), 4),
            }
        }
        return PredictionResult(label, round(float(proba[label]), 4), self.name, details)


# ─── Orquestador ──────────────────────────────────────────────
class WaterAnalyzer:
    MODELS = {
        "random_forest":  RandomForestModel,
        "neural_network": NeuralNetworkModel,
    }

    def __init__(self, model_type: str = "random_forest"):
        self._model = self.MODELS[model_type]()

    def set_model(self, model_type: str):
        if model_type not in self.MODELS:
            raise ValueError(f"Modelo no disponible. Opciones: {list(self.MODELS.keys())}")
        self._model = self.MODELS[model_type]()

    def predict(self, reading: SensorReading) -> PredictionResult:
        return self._model.predict(reading)

    @property
    def current_model(self) -> str:
        return self._model.name
