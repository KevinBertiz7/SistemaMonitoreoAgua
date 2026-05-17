import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
KEY_PATH = os.path.join(BASE_DIR, "firebase-key.json")

if not firebase_admin._apps:
    cred = credentials.Certificate(KEY_PATH)
    firebase_admin.initialize_app(cred)

db = firestore.client()


def guardar_dataset_entrenamiento(rows):
    batch = db.batch()

    for i, row in enumerate(rows):
        doc_ref = db.collection("dataset_entrenamiento").document()
        batch.set(doc_ref, {
            "ph": float(row[0]),
            "turbidity": float(row[1]),
            "temperature": float(row[2]),
            "clase": int(row[3]),
            "fecha_importacion": datetime.now().isoformat()
        })

        if (i + 1) % 400 == 0:
            batch.commit()
            batch = db.batch()

    batch.commit()


def guardar_historial_analisis(reading, result):
    db.collection("historial_analisis").add({
        "ph": float(reading.ph),
        "turbidity": float(reading.turbidity),
        "temperature": float(reading.temperature),
        "clase_predicha": int(result.label),
        "confianza": float(result.confidence),
        "modelo": result.model_used,
        "factores": result.details.get("factores", []),
        "usar_para_reentrenamiento": float(result.confidence) >= 0.90,
        "fecha": datetime.now().isoformat()
    })


def guardar_entrenamiento(metricas):
    db.collection("entrenamientos_modelo").add({
        **metricas,
        "fecha": datetime.now().isoformat()
    })


def obtener_datos_entrenamiento():
    datos = []

    for doc in db.collection("dataset_entrenamiento").stream():
        d = doc.to_dict()
        datos.append([
            d["ph"],
            d["turbidity"],
            d["temperature"],
            d["clase"]
        ])

    for doc in db.collection("historial_analisis").where("usar_para_reentrenamiento", "==", True).stream():
        d = doc.to_dict()
        datos.append([
            d["ph"],
            d["turbidity"],
            d["temperature"],
            d["clase_predicha"]
        ])

    return datos