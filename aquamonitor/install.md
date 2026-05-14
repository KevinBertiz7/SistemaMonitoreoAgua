AquaMonitor — Sistema de Monitoreo de Calidad del Agua

Sistema para detectar contaminación en fuentes hídricas mediante sensores de pH, turbidez y temperatura. Arquitectura por capas, con modelos de Machine Learning reales (Random Forest y Red Neuronal MLP), interfaz gráfica en React e integración via API REST.



Arquitectura del sistema


┌─────────────────────────────────────────────────────────────┐
│              WaterMonitor.jsx  (Interfaz React)             │
│                    localhost:3000                           │
└────────────────────────┬────────────────────────────────────┘
                         │  HTTP (fetch)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   api.py  (FastAPI)                         │
│                  localhost:8000                             │
│   /analizar   /simular   /historial   /modelos   /modelo    │
└───┬──────────────┬────────────────┬───────────────┬─────────┘
    │              │                │               │
┌───▼────┐  ┌──────▼──────┐  ┌─────▼────┐  ┌──────▼────┐
│ data_  │  │ analysis_   │  │  alert_  │  │  main.py  │
│ layer  │  │   layer     │  │   layer  │  │(CLI / dev)│
│        │  │             │  │          │  └───────────┘
│Sensores│  │Random Forest│  │Umbrales  │
│pH      │  │Red Neuronal │  │OMS       │
│Turbidez│  │.pkl reales  │  │Alertas   │
│Temp    │  └─────────────┘  └──────────┘
└────────┘
```

---

## Archivos del proyecto

| Archivo | Capa | Qué hace |
|---|---|---|
| `main.py` | Orquestador | Punto de entrada CLI — conecta todas las capas |
| `api.py` | API REST | Servidor FastAPI — puente entre React y Python |
| `data_layer.py` | Datos | Lectura de sensores (simulado / real) |
| `analysis_layer.py` | Análisis ML | Carga y ejecuta los modelos .pkl |
| `alert_layer.py` | Alertas | Evalúa umbrales OMS, genera alertas |
| `ui_layer.py` | UI terminal | Interfaz de texto con colores (modo dev) |
| `water_rf_model.pkl` | Modelo | Random Forest entrenado (200 árboles) |
| `water_mlp_model.pkl` | Modelo | Red Neuronal MLP entrenada (3→16→8→3) |
| `WaterMonitor.jsx` | Frontend | Interfaz gráfica en React |

---

## Parámetros monitoreados

| Parámetro | Rango Normal OMS | Unidad |
|---|---|---|
| pH | 6.5 – 8.5 | — |
| Turbidez | 0 – 4 | NTU |
| Temperatura | 10 – 25 | °C |

## Clasificación del agua

| Nivel | Color | Criterio |
|---|---|---|
|  APTA PARA CONSUMO | Verde | Todos los parámetros en rango normal |
|  CONTAMINADA — TRATAR | Amarillo | Uno o más parámetros fuera de rango |
|  PELIGROSA — NO USAR | Rojo | Contaminación severa en múltiples parámetros |

---

## Librerías requeridas

### Backend — Python

```bash
pip install fastapi uvicorn scikit-learn numpy joblib
```

| Librería | Versión recomendada | Para qué se usa |
|---|---|---|
| `fastapi` | ≥ 0.110 | Framework del servidor API REST |
| `uvicorn` | ≥ 0.29 | Motor ASGI que ejecuta FastAPI |
| `scikit-learn` | ≥ 1.4 | Random Forest (`RandomForestClassifier`) y Red Neuronal (`MLPClassifier`) |
| `numpy` | ≥ 1.26 | Manejo de vectores y matrices para los modelos ML |
| `joblib` | ≥ 1.3 | Guardar y cargar los modelos `.pkl` en disco |

> **Nota:** `joblib` generalmente se instala automáticamente con `scikit-learn`, pero se incluye explícitamente por seguridad.

### Opcional — sensor físico (Arduino / Raspberry Pi)

```bash
pip install pyserial
```

| Librería | Para qué se usa |
|---|---|
| `pyserial` | Leer datos del sensor físico por puerto USB/Serial |

### Frontend — Node.js y React

> Requiere tener **Node.js** instalado. Descarga en: https://nodejs.org (versión LTS)

```bash
# Crear el proyecto React (solo la primera vez)
npx create-react-app aquamonitor

# Instalar dependencias (dentro de la carpeta del proyecto)
cd aquamonitor
npm install
```

| Herramienta | Para qué se usa |
|---|---|
| `react` | Librería principal de la interfaz gráfica |
| `react-dom` | Renderiza los componentes en el navegador |
| `react-scripts` | Servidor de desarrollo y compilación |

> Todas estas se instalan automáticamente con `create-react-app`. No necesitas instalarlas manualmente.

---

## Instalación paso a paso

### 1. Clonar / descargar el proyecto

Coloca todos los archivos Python en una carpeta llamada `backend/` y el `WaterMonitor.jsx` dentro de `src/` del proyecto React.

```
aquamonitor/
├── src/
│   ├── App.js          ← pega aquí el contenido de WaterMonitor.jsx
│   └── index.js
├── backend/
│   ├── api.py
│   ├── main.py
│   ├── data_layer.py
│   ├── analysis_layer.py
│   ├── alert_layer.py
│   ├── ui_layer.py
│   ├── water_rf_model.pkl
│   └── water_mlp_model.pkl
└── package.json
```

### 2. Instalar dependencias Python

```bash
pip install fastapi uvicorn scikit-learn numpy joblib
```

### 3. Instalar dependencias React

```bash
cd aquamonitor
npm install
```

### 4. Arrancar el backend

```bash
cd aquamonitor/backend
uvicorn api:app --reload --port 8000
```

Deberías ver:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete.
```

### 5. Arrancar el frontend (nueva terminal)

```bash
cd aquamonitor
npm start
```

Se abre automáticamente el navegador en `http://localhost:3000`.

---

## Endpoints de la API

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/` | Verificar que el servidor está activo |
| `POST` | `/analizar` | Recibe `{ph, turbidity, temperature}` y retorna clasificación |
| `GET` | `/simular` | Genera una lectura aleatoria y la clasifica |
| `GET` | `/historial` | Retorna todas las lecturas de la sesión |
| `GET` | `/modelos` | Lista los modelos disponibles |
| `POST` | `/modelo` | Cambia el modelo activo (`random_forest` o `neural_network`) |

---

## Modelos de Machine Learning

### Random Forest
- **Algoritmo:** `RandomForestClassifier` de scikit-learn
- **Árboles:** 200
- **Profundidad máxima:** 10
- **Entrenado con:** 5000 muestras sintéticas basadas en normas OMS
- **Precisión:** 100% en test set (datos sintéticos)
- **Salida:** probabilidades reales por clase via `predict_proba()`

### Red Neuronal MLP
- **Algoritmo:** `MLPClassifier` de scikit-learn
- **Arquitectura:** 3 → 16 → 8 → 3 neuronas
- **Activación:** ReLU
- **Entrenado con:** 5000 muestras sintéticas basadas en normas OMS
- **Precisión:** 100% en test set (datos sintéticos)
- **Salida:** probabilidades softmax reales por clase

> **Importante:** La precisión del 100% se debe a que los datos de entrenamiento son sintéticos y generados con las mismas reglas. Al conectar datos reales de campo, la precisión será menor pero el modelo aprenderá patrones reales que ninguna regla manual capturaría.

---

## Escalar a sensores reales

En `data_layer.py`, método `_get_real_reading()`:

```python
# Ejemplo: Arduino via puerto serial USB
import serial

ser = serial.Serial('/dev/ttyUSB0', 9600)   # Windows: 'COM3'
line = ser.readline().decode().strip()
ph, turbidity, temperature = map(float, line.split(','))
return SensorReading(ph, turbidity, temperature)
```

En `api.py`, cambia el modo:
```python
sensor_manager = SensorManager(mode="real")  # antes: "simulated"
```

---

## Verificar instalación

```bash
# Verificar Python
python --version          # debe ser 3.10+

# Verificar Node.js
node --version            # debe ser v18+

# Verificar librerías Python
python -c "import fastapi, uvicorn, sklearn, numpy, joblib; print('Todo OK')"

# Probar la API directamente
curl http://localhost:8000/simular
```
