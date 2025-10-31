from datetime import datetime
import json
from pathlib import Path
from config import GOOGLE_APPS_SCRIPT
try:
    from services.db import has_db, execute, fetchall
except Exception:
    def has_db():
        return False
    def execute(*args, **kwargs):
        raise RuntimeError("DB no disponible")
    def fetchall(*args, **kwargs):
        raise RuntimeError("DB no disponible")

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

# Inicializar tabla en Postgres (append-only) si hay DB
def _init_db_if_needed():
    if not has_db():
        return
    execute(
        """
        CREATE TABLE IF NOT EXISTS ventas_historial (
            id BIGSERIAL PRIMARY KEY,
            fecha TIMESTAMPTZ NOT NULL,
            notas TEXT,
            categoria TEXT,
            tipo TEXT,
            fotografia TEXT,
            precio_base NUMERIC(12,2) NOT NULL,
            descuento NUMERIC(5,2) NOT NULL DEFAULT 0,
            precio_final NUMERIC(12,2) NOT NULL,
            unidades INT NOT NULL,
            pago TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ventas_historial_created_at_idx ON ventas_historial (created_at DESC);
        """
    )

_init_db_if_needed()

# Instancia del escritor de Google Sheets (lazy)
_sheets_writer = None

def _get_sheets_writer():
    global _sheets_writer
    if _sheets_writer is None:
        try:
            # FORZAR uso de Apps Script
            gas_url = (GOOGLE_APPS_SCRIPT.get("GAS_URL") or "").strip()
            print(f"[INFO] GAS_URL configurado: {gas_url}")
            
            if gas_url:
                print("[INFO] FORZANDO uso de AppsScriptWriter")
                from .apps_script_writer import AppsScriptWriter
                _sheets_writer = AppsScriptWriter()
                print("[INFO] AppsScriptWriter inicializado correctamente")
            else:
                print("[ERROR] GAS_URL no configurado - no se puede usar Apps Script")
                _sheets_writer = None
        except Exception as e:
            print(f"⚠️ Error inicializando AppsScriptWriter: {e}")
            import traceback
            traceback.print_exc()
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

    # Campos opcionales para exportación/DB
    descuento_in = data.get("descuento")
    try:
        descuento_val = float(descuento_in) if descuento_in not in (None, "") else 0.0
    except Exception:
        descuento_val = 0.0

    precio_base_in = data.get("precio_base")
    try:
        precio_base_val = float(precio_base_in) if precio_base_in not in (None, "") else precio
    except Exception:
        precio_base_val = precio

    precio_final_in = data.get("precio_final")
    try:
        precio_final_val = float(precio_final_in) if precio_final_in not in (None, "") else precio
    except Exception:
        precio_final_val = precio

    return {
        "fecha": fecha,
        "categoria": categoria,
        "tipo": tipo,
        "fotografia": fotografia,
        "precio": float(precio),
        "precio_base": float(precio_base_val),
        "descuento": float(descuento_val),
        "precio_final": float(precio_final_val),
        "unidades": int(unidades),
        "total": float(total),
        "pago": pago,
        "notas": notas
    }

def listar_ventas():
    return list(_ventas)

def listar_historial():
    """Devuelve el historial agrupado por fecha: { 'YYYY-MM-DD': [ventas...] }
    Si hay DB, se lee desde Postgres (append-only). Sino, fallback al JSON local.
    """
    if has_db():
        rows = fetchall(
            """
            SELECT id, fecha, notas, categoria, tipo, fotografia,
                   precio_base, descuento, precio_final, unidades, pago, created_at
            FROM ventas_historial
            ORDER BY created_at DESC
            LIMIT 1000
            """
        )
        agrupado = {}
        for r in rows:
            fecha_key = str(r["fecha"])[:10]
            venta = {
                "id": r.get("id"),
                "fecha": fecha_key,
                "categoria": r.get("categoria"),
                "tipo": r.get("tipo"),
                "fotografia": r.get("fotografia") or "",
                "precio": float(r.get("precio_final") or 0),  # mantener compatible
                "precio_base": float(r.get("precio_base") or 0),
                "descuento": float(r.get("descuento") or 0),
                "precio_final": float(r.get("precio_final") or 0),
                "unidades": int(r.get("unidades") or 0),
                "total": float((r.get("precio_final") or 0) * (r.get("unidades") or 0)),
                "pago": r.get("pago") or "",
                "notas": r.get("notas") or "",
            }
            agrupado.setdefault(fecha_key, []).append(venta)
        return agrupado
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
    """Mueve todas las ventas actuales al historial agrupándolas por 'fecha' y luego limpia las ventas actuales.
    También exporta automáticamente al Google Sheets de forma silenciosa."""
    global _historial
    if not _ventas:
        return {"success": False, "error": "NO_HAY_VENTAS", "mensaje": "No hay ventas para exportar"}
    try:
        # 1. Exportar al Google Sheets de forma silenciosa (sin notificar al usuario)
        sheets_exported = False
        try:
            sheets_result = exportar_todas_las_ventas_a_sheets()
            sheets_exported = sheets_result.get("success", False)
            if sheets_exported:
                print(f"✅ Exportación silenciosa a Google Sheets exitosa: {sheets_result.get('mensaje', '')}")
            else:
                print(f"⚠️ Exportación silenciosa a Google Sheets falló: {sheets_result.get('mensaje', 'Error desconocido')}")
        except Exception as sheets_error:
            print(f"⚠️ Error en exportación silenciosa a Google Sheets: {sheets_error}")
        
        # 2. Guardar en DB (append-only) si existe
        if has_db():
            for v in _ventas:
                # v ya contiene precio_base, descuento, precio_final si vinieron del cliente
                execute(
                    """
                    INSERT INTO ventas_historial (
                        fecha, notas, categoria, tipo, fotografia,
                        precio_base, descuento, precio_final, unidades, pago
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                    )
                    """,
                    (
                        datetime.fromisoformat(v.get("fecha")),
                        v.get("notas"),
                        v.get("categoria"),
                        v.get("tipo"),
                        v.get("fotografia"),
                        float(v.get("precio_base", v.get("precio", 0.0))),
                        float(v.get("descuento", 0.0)),
                        float(v.get("precio_final", v.get("precio", 0.0))),
                        int(v.get("unidades", 0)),
                        v.get("pago"),
                    )
                )

        # 3. Mover al historial local (siempre se hace como espejo)
        for v in _ventas:
            fecha = v.get('fecha')
            if not fecha:
                continue
            _historial.setdefault(fecha, [])
            # Copia sin el campo 'total' si se prefiere mostrar calculado o mantenerlo
            _historial[fecha].append(dict(v))
        _save_historial()
        
        # 4. Limpiar ventas actuales
        limpiar_ventas()
        
        # 5. Mensaje simple para el usuario (sin mencionar Google Sheets)
        return {
            "success": True, 
            "mensaje": "✅ Ventas exportadas al historial",
            "sheets_exported": sheets_exported  # Para uso interno, no se muestra al usuario
        }
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

def eliminar_historial_item_db(item_id: int):
    """Elimina definitivamente una fila de ventas_historial en la DB por id."""
    if not has_db():
        raise RuntimeError("DB_NO_DISPONIBLE")
    execute("DELETE FROM ventas_historial WHERE id = %s", (int(item_id),))
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
        print(f"🚀 EXPORTACIÓN: Iniciando exportación de {len(_ventas)} ventas...")
        writer = _get_sheets_writer()
        
        if writer is None:
            return {
                "success": False,
                "error": "WRITER_NOT_AVAILABLE",
                "mensaje": "No se pudo inicializar el writer de Google Sheets"
            }
        
        print(f"✅ Writer inicializado: {type(writer).__name__}")
        print(f"🚀 Exportando {len(_ventas)} ventas...")
        
        resultado = writer.agregar_multiples_ventas_a_sheets(_ventas)
        print(f"📊 Resultado de exportación: {resultado}")
        return resultado
        
    except Exception as e:
        print(f"❌ Error en exportar_todas_las_ventas_a_sheets: {e}")
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "error": "EXPORT_ERROR",
            "mensaje": f"Error exportando ventas: {str(e)}"
        }
