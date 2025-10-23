from datetime import datetime
import json
from pathlib import Path

DATA_DIR = Path("data")
DATA_DIR.mkdir(exist_ok=True)
SALES_FILE = DATA_DIR / "sales.json"
HISTORY_FILE = DATA_DIR / "history.json"

# Estructura en memoria
_ventas = []  # lista de dicts: {fecha,categoria,tipo,fotografia,precio,unidades,total,pago,notas}
_historial = {}  # dict por fecha ISO (YYYY-MM-DD) -> lista de ventas exportadas

def _load_ventas():
    global _ventas
    try:
        if SALES_FILE.exists():
            with open(SALES_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, list):
                    _ventas = data
    except Exception as e:
        print(f"⚠️ No se pudo cargar sales.json: {e}")

def _load_historial():
    global _historial
    try:
        if HISTORY_FILE.exists():
            with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, dict):
                    _historial = data
    except Exception as e:
        print(f"⚠️ No se pudo cargar history.json: {e}")

def _save_ventas():
    try:
        with open(SALES_FILE, 'w', encoding='utf-8') as f:
            json.dump(_ventas, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"⚠️ No se pudo guardar sales.json: {e}")

def _save_historial():
    try:
        with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
            json.dump(_historial, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"⚠️ No se pudo guardar history.json: {e}")

# Cargar ventas al iniciar
_load_ventas()
_load_historial()

# Instancia del escritor de Google Sheets (lazy)
_sheets_writer = None

def _get_sheets_writer():
    global _sheets_writer
    if _sheets_writer is None:
        try:
            # Forzar uso de API directa de Google Sheets para mayor confiabilidad ahora
            # Si deseas volver a Apps Script, comenta la línea siguiente y descomenta la lógica por GAS_URL.
            print("[INFO] Usando GoogleSheetsWriter (API directa), ignorando GAS_URL temporalmente")
            # Import perezoso para evitar cargar config/credenciales al arranque
            from .google_sheets_writer import GoogleSheetsWriter
            _sheets_writer = GoogleSheetsWriter()
            # -- Modo anterior por GAS_URL --
            # gas_url = (GOOGLE_APPS_SCRIPT.get("GAS_URL") or "").strip()
            # if gas_url:
            #     _sheets_writer = AppsScriptWriter()
            # else:
            #     _sheets_writer = GoogleSheetsWriter()
        except Exception as e:
            print(f"⚠️ No se pudo inicializar GoogleSheetsWriter: {e}")
            _sheets_writer = None
    return _sheets_writer

def _normalizar_venta(data: dict) -> dict:
    """
    Valida y normaliza una venta. Calcula 'total' en servidor.
    """
    required = ["fecha", "categoria", "tipo", "precio", "unidades", "pago"]
    for k in required:
        if k not in data or data[k] in (None, ""):
            raise ValueError(f"Falta el campo requerido: {k}")

    # fecha en formato YYYY-MM-DD
    try:
        fecha_str = str(data["fecha"]).strip()
        # Permite 'YYYY-MM-DD' o fecha compatible
        _ = datetime.fromisoformat(fecha_str)
        fecha = fecha_str[:10]
    except Exception:
        raise ValueError("Fecha inválida (use YYYY-MM-DD)")

    categoria = str(data["categoria"]).strip()
    tipo = str(data["tipo"]).strip()

    try:
        precio = float(data["precio"])
    except Exception:
        raise ValueError("Precio inválido")

    try:
        unidades = int(data["unidades"])
    except Exception:
        raise ValueError("Unidades inválidas")
    # Permitir unidades negativas (devoluciones) y precios negativos si se desea registrar ajustes

    pago = str(data["pago"]).strip() or "Otro"
    notas = str(data.get("notas", "") or "").strip()
    fotografia = str(data.get("fotografia", "") or "").strip()

    total = round(precio * unidades, 2)

    return {
        "fecha": fecha,
        "categoria": categoria,
        "tipo": tipo,
        "fotografia": fotografia,
        "precio": float(precio),
        "unidades": int(unidades),
        "total": float(total),
        "pago": pago,
        "notas": notas
    }

def listar_ventas():
    return list(_ventas)

def listar_historial():
    """Devuelve el historial agrupado por fecha: { 'YYYY-MM-DD': [ventas...] }"""
    return dict(_historial)

def agregar_venta(data: dict):
    """Agrega una venta SOLO a la memoria local, NO a Google Sheets automáticamente"""
    venta = _normalizar_venta(data)
    _ventas.append(venta)
    print(f"✅ Venta agregada a la memoria local (índice: {len(_ventas) - 1})")
    print(f"   NOTA: La venta NO se exportó a Google Sheets. Usa 'Exportar a Google Sheets' cuando estés listo.")
    _save_ventas()

def actualizar_venta(index: int, data: dict):
    if index < 0 or index >= len(_ventas):
        raise IndexError("Índice fuera de rango")
    venta = _normalizar_venta(data)
    _ventas[index] = venta
    _save_ventas()

def eliminar_venta(index: int):
    if index < 0 or index >= len(_ventas):
        raise IndexError("Índice fuera de rango")
    _ventas.pop(index)
    _save_ventas()

def limpiar_ventas():
    """Elimina todas las ventas en memoria"""
    _ventas.clear()
    _save_ventas()

def exportar_ventas_a_historial():
    """Mueve todas las ventas actuales al historial agrupándolas por 'fecha' y luego limpia las ventas actuales."""
    global _historial
    if not _ventas:
        return {"success": False, "error": "NO_HAY_VENTAS", "mensaje": "No hay ventas para exportar"}
    try:
        # Asegurar estructura por fecha
        for v in _ventas:
            fecha = v.get('fecha')
            if not fecha:
                continue
            _historial.setdefault(fecha, [])
            # Copia sin el campo 'total' si se prefiere mostrar calculado o mantenerlo
            _historial[fecha].append(dict(v))
        _save_historial()
        # Limpiar ventas actuales
        limpiar_ventas()
        return {"success": True, "mensaje": "Ventas exportadas al historial"}
    except Exception as e:
        return {"success": False, "error": "EXPORT_HISTORY_ERROR", "mensaje": str(e)}

def eliminar_historial_item(fecha: str, index: int):
    """Elimina un ítem del historial por fecha e índice dentro de esa fecha."""
    if not fecha or fecha not in _historial:
        raise KeyError("FECHA_NO_ENCONTRADA")
    items = _historial.get(fecha, [])
    if index < 0 or index >= len(items):
        raise IndexError("INDICE_FUERA_DE_RANGO")
    items.pop(index)
    # Si la fecha queda vacía, eliminar la clave
    if not items:
        _historial.pop(fecha, None)
    _save_historial()
    return True

def obtener_estado_sheets():
    """Obtiene el estado del Google Sheet"""
    writer = _get_sheets_writer()
    if writer is None:
        return {
            "success": False,
            "error": "GOOGLE_SHEETS_NOT_AVAILABLE",
            "mensaje": "Credenciales de Google Sheets no disponibles"
        }
    return writer.obtener_estado_sheets()

def exportar_todas_las_ventas_a_sheets():
    """Exporta TODAS las ventas acumuladas en memoria a Google Sheets en UNA sola actualización."""
    if not _ventas:
        return {
            "success": False,
            "error": "NO_HAY_VENTAS",
            "mensaje": "No hay ventas para exportar. Agrega algunas ventas primero."
        }

    try:
        writer = _get_sheets_writer()
        print(f"🚀 Exportando {len(_ventas)} ventas...")
        return writer.agregar_multiples_ventas_a_sheets(_ventas)
    except Exception as e:
        return {
            "success": False,
            "error": "EXPORT_ERROR",
            "mensaje": f"Error exportando ventas: {str(e)}"
        }
