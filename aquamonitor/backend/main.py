"""
=============================================================
  SISTEMA DE MONITOREO DE CALIDAD DEL AGUA
  Arquitectura por capas - Modo Simulado
=============================================================
  Capas:
    1. data_layer.py      → Sensores (simulado / real)
    2. analysis_layer.py  → Modelos ML (Random Forest / Red Neuronal)
    3. alert_layer.py     → Sistema de alertas
    4. ui_layer.py        → Interfaz de usuario (terminal)
    5. main.py            → Orquestador principal
=============================================================
"""

from data_layer import SensorManager
from analysis_layer import WaterAnalyzer
from alert_layer import AlertSystem
from ui_layer import UI


def main():
    ui = UI()
    sensor_manager = SensorManager(mode="simulated")  # Cambiar a "real" para sensores físicos
    analyzer = WaterAnalyzer(model_type="random_forest")  # o "neural_network"
    alert_system = AlertSystem()

    ui.show_banner()

    while True:
        choice = ui.show_menu()

        if choice == "1":
            # Ingresar lectura manual
            reading = ui.get_manual_reading()
            result = analyzer.predict(reading)
            alerts = alert_system.evaluate(reading, result)
            ui.show_result(reading, result, alerts)

        elif choice == "2":
            # Simular lectura automática del sensor
            reading = sensor_manager.get_reading()
            result = analyzer.predict(reading)
            alerts = alert_system.evaluate(reading, result)
            ui.show_result(reading, result, alerts)

        elif choice == "3":
            # Ver historial
            history = sensor_manager.get_history()
            ui.show_history(history)

        elif choice == "4":
            # Cambiar modelo ML
            model = ui.select_model()
            analyzer.set_model(model)
            ui.print_success(f"Modelo cambiado a: {model}")

        elif choice == "5":
            ui.print_success("Sistema cerrado. ¡Hasta pronto!")
            break

        else:
            ui.print_error("Opción no válida.")


if __name__ == "__main__":
    main()
