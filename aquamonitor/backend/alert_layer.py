"""
=============================================================
  CAPA 3: ALERT LAYER — Sistema de Alertas
=============================================================
  Responsabilidad:
    - Evaluar lecturas contra umbrales normativos
    - Generar alertas por parámetro (pH, turbidez, temperatura)
    - Registrar historial de alertas
    - Extensible a: emails, SMS, webhooks, MQTT
=============================================================
"""

import datetime
from data_layer import SensorReading
from analysis_layer import PredictionResult


# ─── Umbrales de alerta ───────────────────────────────────────
THRESHOLDS = {
    "ph": {
        "critical_low": 5.5,
        "warning_low": 6.5,
        "warning_high": 8.5,
        "critical_high": 9.5,
    },
    "turbidity": {
        "warning": 4.0,     # NTU
        "critical": 10.0,
    },
    "temperature": {
        "warning": 25.0,    # °C
        "critical": 30.0,
    }
}


class Alert:
    """Representa una alerta individual."""

    LEVELS = {
        "INFO": "ℹ",
        "WARNING": "⚠",
        "CRITICAL": "🚨"
    }

    def __init__(self, level: str, parameter: str, message: str, value: float):
        self.level = level          # "INFO", "WARNING", "CRITICAL"
        self.parameter = parameter
        self.message = message
        self.value = value
        self.timestamp = datetime.datetime.now()

    def __repr__(self):
        icon = self.LEVELS.get(self.level, "•")
        return f"[{self.level}] {icon} {self.parameter}: {self.message} (valor={self.value})"


class AlertSystem:
    """
    Evalúa lecturas y genera alertas.
    
    Para escalar a notificaciones reales, implementar:
        - send_email(alert)
        - send_sms(alert)
        - publish_mqtt(alert)
    """

    def __init__(self):
        self._alert_history: list[Alert] = []

    def evaluate(self, reading: SensorReading, result: PredictionResult) -> list[Alert]:
        """Evalúa una lectura y retorna lista de alertas activas."""
        alerts = []

        alerts += self._check_ph(reading.ph)
        alerts += self._check_turbidity(reading.turbidity)
        alerts += self._check_temperature(reading.temperature)

        # Alerta global basada en el modelo ML
        if result.label == 2:
            alerts.append(Alert(
                "CRITICAL", "MODELO ML",
                f"{result.model_used} clasificó el agua como PELIGROSA ({result.confidence:.1%} confianza)",
                result.label
            ))
        elif result.label == 1:
            alerts.append(Alert(
                "WARNING", "MODELO ML",
                f"{result.model_used} detectó contaminación ({result.confidence:.1%} confianza)",
                result.label
            ))

        self._alert_history.extend(alerts)
        return alerts

    def get_history(self) -> list[Alert]:
        return self._alert_history.copy()

    # ─── Evaluación por parámetro ─────────────────────────────
    def _check_ph(self, ph: float) -> list[Alert]:
        t = THRESHOLDS["ph"]
        if ph < t["critical_low"] or ph > t["critical_high"]:
            return [Alert("CRITICAL", "pH", f"pH en nivel crítico: {ph}", ph)]
        elif ph < t["warning_low"] or ph > t["warning_high"]:
            return [Alert("WARNING", "pH", f"pH fuera del rango aceptable: {ph}", ph)]
        return []

    def _check_turbidity(self, turbidity: float) -> list[Alert]:
        t = THRESHOLDS["turbidity"]
        if turbidity > t["critical"]:
            return [Alert("CRITICAL", "Turbidez", f"Turbidez peligrosamente alta: {turbidity} NTU", turbidity)]
        elif turbidity > t["warning"]:
            return [Alert("WARNING", "Turbidez", f"Turbidez elevada: {turbidity} NTU (máx recomendado 4 NTU)", turbidity)]
        return []

    def _check_temperature(self, temperature: float) -> list[Alert]:
        t = THRESHOLDS["temperature"]
        if temperature > t["critical"]:
            return [Alert("CRITICAL", "Temperatura", f"Temperatura crítica: {temperature}°C", temperature)]
        elif temperature > t["warning"]:
            return [Alert("WARNING", "Temperatura", f"Temperatura elevada: {temperature}°C", temperature)]
        return []
