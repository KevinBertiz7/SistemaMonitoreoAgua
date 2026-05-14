"""
=============================================================
  CAPA 1: DATA LAYER — Gestión de Sensores
=============================================================
  Responsabilidad:
    - Obtener lecturas de sensores (pH, turbidez, temperatura)
    - Modo "simulated": valores ingresados o generados aleatoriamente
    - Modo "real": conectar a sensor físico (Arduino, Raspberry Pi, etc.)
    - Guardar historial de lecturas
=============================================================
"""

import random
import datetime


# ─── Rangos normales de referencia ───────────────────────────
NORMAL_RANGES = {
    "ph": (6.5, 8.5),          # Rango potable OMS
    "turbidity": (0.0, 4.0),   # NTU — agua potable < 4 NTU
    "temperature": (10.0, 25.0) # °C — rango aceptable
}


class SensorReading:
    """Representa una lectura de sensores en un momento dado."""

    def __init__(self, ph: float, turbidity: float, temperature: float):
        self.ph = ph
        self.turbidity = turbidity
        self.temperature = temperature
        self.timestamp = datetime.datetime.now()

    def to_dict(self) -> dict:
        return {
            "ph": self.ph,
            "turbidity": self.turbidity,
            "temperature": self.temperature,
            "timestamp": self.timestamp.strftime("%Y-%m-%d %H:%M:%S")
        }

    def to_feature_vector(self) -> list:
        """Convierte la lectura en vector de features para el modelo ML."""
        return [self.ph, self.turbidity, self.temperature]

    def __repr__(self):
        return (f"SensorReading(pH={self.ph}, turbidez={self.turbidity} NTU, "
                f"temp={self.temperature}°C, hora={self.timestamp.strftime('%H:%M:%S')})")


class SensorManager:
    """
    Gestiona la fuente de datos.
    
    mode="simulated" → Genera lecturas aleatorias realistas
    mode="real"      → Se conecta a sensor físico (implementar en get_real_reading)
    """

    def __init__(self, mode: str = "simulated"):
        assert mode in ("simulated", "real"), "Mode debe ser 'simulated' o 'real'"
        self.mode = mode
        self._history: list[SensorReading] = []

    def get_reading(self) -> SensorReading:
        """Obtiene una lectura según el modo configurado."""
        if self.mode == "simulated":
            return self._get_simulated_reading()
        else:
            return self._get_real_reading()

    def get_reading_from_values(self, ph: float, turbidity: float, temperature: float) -> SensorReading:
        """Crea una lectura a partir de valores ingresados manualmente."""
        reading = SensorReading(ph, turbidity, temperature)
        self._history.append(reading)
        return reading

    def get_history(self) -> list[SensorReading]:
        return self._history.copy()

    # ─── Modo simulado ────────────────────────────────────────
    def _get_simulated_reading(self) -> SensorReading:
        """
        Genera valores realistas con algo de ruido.
        ~80% lecturas normales, ~20% con contaminación.
        """
        contaminated = random.random() < 0.20  # 20% de probabilidad de contaminación

        if contaminated:
            ph = round(random.uniform(4.0, 6.4) if random.random() < 0.5 else random.uniform(8.6, 10.0), 2)
            turbidity = round(random.uniform(4.5, 15.0), 2)
            temperature = round(random.uniform(28.0, 35.0), 2)
        else:
            ph = round(random.uniform(6.5, 8.5), 2)
            turbidity = round(random.uniform(0.1, 3.9), 2)
            temperature = round(random.uniform(10.0, 25.0), 2)

        reading = SensorReading(ph, turbidity, temperature)
        self._history.append(reading)
        return reading

    # ─── Modo real (stub para escalar) ───────────────────────
    def _get_real_reading(self) -> SensorReading:
        """
        STUB: Implementar conexión al sensor físico aquí.
        
        Ejemplos de integración:
          - Arduino via serial:  import serial; ser = serial.Serial('/dev/ttyUSB0', 9600)
          - Raspberry Pi GPIO:   import RPi.GPIO as GPIO
          - MQTT broker:         import paho.mqtt.client as mqtt
        """
        raise NotImplementedError(
            "Modo real no implementado. "
            "Conecta tu sensor y agrega la lógica de lectura aquí."
        )
