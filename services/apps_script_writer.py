"""
Writer basado en Google Apps Script (GAS) para exportar ventas sin usar la API de Sheets.
Envía las ventas vía HTTP POST a un Web App publicado en Apps Script.
"""
import os
import json
import logging
from datetime import datetime
from pathlib import Path
import csv
import urllib.request
import urllib.error

from config import GOOGLE_APPS_SCRIPT

logger = logging.getLogger(__name__)


class AppsScriptWriter:
    def __init__(self):
        self.gas_url = (GOOGLE_APPS_SCRIPT.get("GAS_URL") or "").strip()
        self.api_key = (GOOGLE_APPS_SCRIPT.get("GAS_API_KEY") or "").strip()
        if not self.gas_url:
            raise ValueError("GAS_URL no configurado. Define la URL del Web App de Apps Script")

        # Directorio de datos locales (para backup CSV)
        self.data_dir = Path("data")
        self.data_dir.mkdir(exist_ok=True)

        # Headers esperados (nuevos campos)
        self.expected_headers = [
            "Fecha", "Notas", "Categoria", "Tipo de Producto", "Link de Fotografia",
            "Precio", "Descuento", "Precio Final", "Unidades", "Forma de pago"
        ]

    def normalizar_fila_datos(self, fila_datos):
        while len(fila_datos) < len(self.expected_headers):
            fila_datos.append("")
        if len(fila_datos) > len(self.expected_headers):
            fila_datos = fila_datos[:len(self.expected_headers)]
        return fila_datos

    def preparar_fila_venta(self, venta: dict):
        # precio ingresado es unitario
        precio_unitario = round(float(venta["precio"]), 2)
        unidades = int(venta["unidades"])  # asegurar entero
        
        # Calcular precio final
        precio_final = round(precio_unitario * unidades, 2)
        
        # Calcular descuento (por defecto 0)
        descuento = venta.get("descuento", 0)
        if descuento > 0:
            precio_final = round(precio_final * (1 - descuento/100), 2)

        fecha_obj = datetime.fromisoformat(str(venta["fecha"]))
        
        # Obtener categoría y link(s) de foto
        categoria = venta.get("categoria", "General")
        fotos = []
        try:
            if isinstance(venta.get("fotos"), list):
                fotos = [str(u).strip() for u in venta.get("fotos") if str(u).strip()]
        except Exception:
            fotos = []
        # Fallback a una sola fotografia si no hay lista
        if not fotos:
            single = venta.get("link_foto", venta.get("fotografia", ""))
            if single:
                fotos = [single]
        # Unir múltiples links en un solo campo (una línea por link)
        link_foto = "\n".join(fotos)
        
        fila = [
            fecha_obj.strftime("%d/%m/%Y"),          # A: Fecha
            str(venta.get("notas", "")),          # B: Notas
            categoria,                             # C: Categoria
            str(venta.get("tipo", venta.get("nombre", ""))),  # D: Tipo de Producto
            link_foto,                             # E: Link de Fotografia
            float(precio_unitario),                # F: Precio (unitario)
            float(descuento),                      # G: Descuento
            float(precio_final),                   # H: Precio Final
            int(unidades),                         # I: Unidades
            str(venta.get("pago", "Efectivo"))    # J: Forma de pago
        ]
        return self.normalizar_fila_datos(fila)

    def _post_gas(self, payload: dict, timeout: int = None):
        import urllib.request
        import urllib.error
        import json
        
        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(self.gas_url, data=body, method="POST")
        req.add_header("Content-Type", "application/json")
        if self.api_key:
            req.add_header("X-API-Key", self.api_key)
            
        try:
            with urllib.request.urlopen(req, timeout=timeout or GOOGLE_APPS_SCRIPT.get("TIMEOUT", 15)) as resp:
                data = resp.read().decode("utf-8")
                return json.loads(data) if data else {"success": True}
        except urllib.error.HTTPError as e:
            err_text = e.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"HTTP {e.code}: {err_text}")
        except urllib.error.URLError as e:
            raise RuntimeError(f"Conexión fallida: {e}")

    def obtener_estado_gas(self):
        try:
            res = self._post_gas({"action": "status"})
            return {"success": True, "gas": res}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def obtener_estado_sheets(self):
        """
        Método de compatibilidad para el endpoint /api/sheets/status cuando se usa Apps Script.
        Devuelve el estado reportado por el Web App (GAS) si está disponible.
        """
        try:
            estado = self.obtener_estado_gas()
            if estado.get("success"):
                return {
                    "success": True,
                    "mode": "apps_script",
                    "gas": estado.get("gas", {})
                }
            return {
                "success": False,
                "mode": "apps_script",
                "error": estado.get("error", "UNKNOWN_ERROR")
            }
        except Exception as e:
            return {"success": False, "mode": "apps_script", "error": str(e)}

    def agregar_multiples_ventas_a_sheets(self, ventas: list):
        if not ventas:
            return {"success": False, "error": "NO_HAY_VENTAS", "mensaje": "No hay ventas para exportar"}

        print(f"🚀 AppsScriptWriter: Exportando {len(ventas)} ventas...")
        print(f"📍 URL: {self.gas_url}")

        # Preparar filas
        filas = [self.preparar_fila_venta(v) for v in ventas]
        print(f"📋 Filas preparadas: {len(filas)}")
        if filas:
            print(f"📝 Primera fila: {filas[0]}")

        # Backup CSV local
        try:
            csv_file = self.data_dir / "ventas_para_sheets.csv"
            with open(csv_file, 'a', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                for fila in filas:
                    writer.writerow(fila)
            print(f"💾 Backup CSV guardado en: {csv_file}")
        except Exception as e:
            print(f"⚠️ No se pudo escribir CSV local: {e}")

        # Enviar en uno o varios lotes si necesario
        max_batch = 300
        total = 0
        errores = []
        
        for i in range(0, len(filas), max_batch):
            lote = filas[i:i+max_batch]
            payload = {
                "action": "appendRows",
                "rows": lote
            }
            print(f"📤 Enviando lote {i//max_batch + 1}: {len(lote)} filas")
            
            try:
                res = self._post_gas(payload)
                print(f"📥 Respuesta del Apps Script: {res}")
                
                if not res or not res.get("success", False):
                    errores.append(res)
                    print(f"❌ Error en lote: {res}")
                else:
                    total += len(lote)
                    print(f"✅ Lote exportado exitosamente")
                    
            except Exception as e:
                errores.append(str(e))
                print(f"❌ Error enviando lote: {e}")

        if total == len(filas):
            print(f"✅ Exportación completa: {total} ventas exportadas")
            return {"success": True, "ventas_exportadas": total, "mensaje": f"✅ {total} ventas exportadas vía Apps Script"}
        else:
            print(f"⚠️ Exportación parcial: {total}/{len(filas)} ventas exportadas")
            return {
                "success": False,
                "error": "EXPORT_PARTIAL",
                "ventas_exportadas": total,
                "errores": errores,
                "mensaje": f"⚠️ {total}/{len(filas)} ventas exportadas vía Apps Script"
            }


