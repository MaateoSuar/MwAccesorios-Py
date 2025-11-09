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
PRETICKETS_FILE = DATA_DIR / "pre_tickets.json"

# Estructura en memoria
_ventas = []  # lista de dicts: {fecha,categoria,tipo,fotografia,precio,unidades,total,pago,notas}
_historial = {}  # dict por fecha ISO (YYYY-MM-DD) -> lista de ventas exportadas
_pretickets = {}  # dict cliente -> lista de items de venta sin confirmar

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

def _load_pretickets():
    global _pretickets
    try:
        if PRETICKETS_FILE.exists():
            with open(PRETICKETS_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, dict):
                    _pretickets = data
    except Exception as e:
        print(f"⚠️ No se pudo cargar pre_tickets.json: {e}")

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

def _save_pretickets():
    try:
        with open(PRETICKETS_FILE, 'w', encoding='utf-8') as f:
            json.dump(_pretickets, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"⚠️ No se pudo guardar pre_tickets.json: {e}")

# Cargar ventas al iniciar
_load_ventas()
_load_historial()
_load_pretickets()

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
            codigo_regalo TEXT,
            es_regalo BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ventas_historial_created_at_idx ON ventas_historial (created_at DESC);
        -- Asegurar columnas nuevas si la tabla ya existía sin ellas
        DO $$ BEGIN
            BEGIN
                ALTER TABLE ventas_historial ADD COLUMN IF NOT EXISTS codigo_regalo TEXT;
            EXCEPTION WHEN others THEN NULL;
            END;
            BEGIN
                ALTER TABLE ventas_historial ADD COLUMN IF NOT EXISTS es_regalo BOOLEAN NOT NULL DEFAULT FALSE;
            EXCEPTION WHEN others THEN NULL;
            END;
        END $$;
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

    out = {
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
    # Campos opcionales: Regalo
    try:
        if 'es_regalo' in data:
            out['es_regalo'] = bool(data.get('es_regalo'))
        cod = data.get('codigo_regalo')
        if cod not in (None, ""):
            out['codigo_regalo'] = str(cod).strip()
    except Exception:
        pass
    return out

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
                   precio_base, descuento, precio_final, unidades, pago,
                   codigo_regalo, es_regalo, created_at
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
                "codigo_regalo": r.get("codigo_regalo") or "",
                "es_regalo": bool(r.get("es_regalo")) if r.get("es_regalo") is not None else False,
            }
            agrupado.setdefault(fecha_key, []).append(venta)
        return agrupado
    return dict(_historial)

def listar_pretickets():
    return dict(_pretickets)

def agregar_item_preticket(cliente: str, data: dict):
    if not cliente or not isinstance(cliente, str):
        raise ValueError("Cliente inválido")
    item = _normalizar_venta(data)
    _pretickets.setdefault(cliente, [])
    _pretickets[cliente].append(item)
    _save_pretickets()
    return len(_pretickets[cliente]) - 1

def eliminar_item_preticket(cliente: str, index: int):
    if cliente not in _pretickets:
        raise KeyError("CLIENTE_NO_ENCONTRADO")
    items = _pretickets.get(cliente, [])
    if index < 0 or index >= len(items):
        raise IndexError("INDICE_FUERA_DE_RANGO")
    items.pop(index)
    if not items:
        _pretickets.pop(cliente, None)
    _save_pretickets()
    return True

def limpiar_preticket(cliente: str):
    if cliente in _pretickets:
        _pretickets.pop(cliente, None)
        _save_pretickets()
    return True

def actualizar_item_preticket(cliente: str, index: int, data: dict):
    if cliente not in _pretickets:
        raise KeyError("CLIENTE_NO_ENCONTRADO")
    items = _pretickets.get(cliente, [])
    if index < 0 or index >= len(items):
        raise IndexError("INDICE_FUERA_DE_RANGO")
    item = _normalizar_venta(data)
    items[index] = item
    _save_pretickets()
    return dict(item)

def confirmar_preticket_como_venta(cliente: str, payload: dict):
    if cliente not in _pretickets or not _pretickets[cliente]:
        raise ValueError("PRETICKET_VACIO")
    items = _pretickets[cliente]
    fecha_in = payload.get("fecha") or items[0].get("fecha")
    pago_in = str(payload.get("pago", items[0].get("pago", "")) or "")
    notas_extra = str(payload.get("notas", "") or "")
    categoria = str(payload.get("categoria", "Conjunto") or "Conjunto")
    tipo = str(payload.get("tipo", f"Ticket {cliente}") or f"Ticket {cliente}")
    fotografia = str(payload.get("fotografia", "") or "")
    total = 0.0
    detalle = []
    fotos = []
    # Recolectar códigos únicos de regalo
    codigos_regalo = set()
    for it in items:
        try:
            pu = float(it.get("precio", 0.0))
        except Exception:
            pu = 0.0
        try:
            u = int(it.get("unidades", 0))
        except Exception:
            u = 0
        subtotal = round(pu * u, 2)
        total += subtotal
        nombre_tipo = it.get("tipo") or it.get("nombre") or ""
        foto_it = (it.get("fotografia") or "").strip()
        if foto_it:
            fotos.append(foto_it)
        nota_item = (it.get("notas") or "").strip()
        # Remover cualquier mención 'Regalo: ...' de la nota del ítem para no duplicar en la venta agrupada
        try:
            import re
            nota_item = re.sub(r"\bRegalo\s*:\s*[^\n|]+", "", nota_item).strip().strip("-").strip()
        except Exception:
            pass
        # Agregar nota del ítem si existe
        if nota_item:
            detalle.append(f"{nombre_tipo} x{u} ${subtotal} - {nota_item}")
        else:
            detalle.append(f"{nombre_tipo} x{u} ${subtotal}")
        # Recolectar código de regalo si existe
        cod_it = (it.get("codigo_regalo") or "").strip()
        if cod_it:
            codigos_regalo.add(cod_it)
    # Notas multilínea, cada ítem en un renglón con prefijo 'Detalle:'
    detalle_multilinea = []
    for d in detalle:
        detalle_multilinea.append(f"Detalle: {d}")
    notas_partes = [
        f"Items: {len(items)}",
        *detalle_multilinea
    ]
    if codigos_regalo:
        notas_partes.append(f"Regalo: {', '.join(sorted(codigos_regalo))}")
    if notas_extra:
        notas_partes.append(str(notas_extra))
    notas = "\n".join(notas_partes)
    # Tomar referencias para edición futura (ej: precargar formulario)
    categoria_edit = (items[0].get("categoria") or "") if items else ""
    tipo_edit = (items[0].get("tipo") or items[0].get("nombre") or "") if items else ""

    # Determinar flags finales de regalo
    es_regalo_any = bool(codigos_regalo)
    codigo_regalo_principal = sorted(codigos_regalo)[0] if es_regalo_any else ""

    venta_agrupada = {
        "fecha": fecha_in,
        "categoria": categoria,
        "tipo": tipo,
        "fotografia": fotografia,
        "fotos": fotos,
        "detalle": detalle,
        "precio": float(round(total, 2)),
        "unidades": 1,
        "pago": pago_in,
        "notas": notas,
        "items_count": len(items),
        # Campos auxiliares para edición posterior
        "categoria_edit": categoria_edit,
        "tipo_edit": tipo_edit,
        # Regalo
        "es_regalo": es_regalo_any,
        "codigo_regalo": codigo_regalo_principal,
        # Cliente y items originales para reabrir en modo pre-ticket
        "cliente": cliente,
        "items_raw": list(items),
    }
    # Si no se pasó fotografia explícita, usar la primera disponible de los ítems
    if not venta_agrupada.get("fotografia") and fotos:
        venta_agrupada["fotografia"] = fotos[0]
    # Decidir comportamiento según update_index (viene cuando se reabre desde el registro)
    upd_in = payload.get("update_index")
    try:
        upd_index = int(upd_in) if upd_in is not None else None
    except Exception:
        upd_index = None
    if upd_index is not None and 0 <= upd_index < len(_ventas):
        actualizar_venta(upd_index, venta_agrupada)
    else:
        agregar_venta(venta_agrupada)
    _pretickets.pop(cliente, None)
    _save_pretickets()
    return dict(venta_agrupada)

def agregar_venta(data: dict):
    """Agrega una venta SOLO a la memoria local, NO a Google Sheets automáticamente"""
    venta = _normalizar_venta(data)
    # Conservar metadatos opcionales (no usados en cálculos) si vienen presentes
    for k in ("items_count", "detalle", "fotos", "categoria_edit", "tipo_edit", "cliente", "items_raw", "es_regalo", "codigo_regalo"):
        if k in data:
            venta[k] = data[k]
    _ventas.append(venta)
    print(f"✅ Venta agregada a la memoria local (índice: {len(_ventas) - 1})")
    print(f"   NOTA: La venta NO se exportó a Google Sheets. Usa 'Exportar a Google Sheets' cuando estés listo.")
    _save_ventas()

def actualizar_venta(index: int, data: dict):
    if index < 0 or index >= len(_ventas):
        raise IndexError("Índice fuera de rango")
    venta = _normalizar_venta(data)
    # Conservar metadatos opcionales (no usados en cálculos) si vienen presentes
    for k in ("items_count", "detalle", "fotos", "categoria_edit", "tipo_edit", "cliente", "items_raw", "es_regalo", "codigo_regalo"):
        if k in data:
            venta[k] = data[k]
    _ventas[index] = venta
    _save_ventas()

def reabrir_venta_como_preticket(index: int):
    if index < 0 or index >= len(_ventas):
        raise IndexError("Índice fuera de rango")
    venta = _ventas[index]
    cliente = (venta.get("cliente") or "").strip()
    items_raw = venta.get("items_raw") or []
    if not cliente or not isinstance(items_raw, list) or len(items_raw) == 0:
        raise ValueError("SIN_ITEMS_ORIGINALES")
    _pretickets[cliente] = list(items_raw)
    _save_pretickets()
    return {"cliente": cliente, "items": list(items_raw)}

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
                        precio_base, descuento, precio_final, unidades, pago,
                        codigo_regalo, es_regalo
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                        %s, %s
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
                        v.get("codigo_regalo"),
                        bool(v.get("es_regalo"))
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
