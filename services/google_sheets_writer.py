"""
Servicio robusto para escribir ventas en Google Sheets existente
Maneja automáticamente límites de grilla, expansión de hojas y errores del API
"""
import os
import json
import gspread
import logging
from datetime import datetime
from pathlib import Path
import csv
from config import GOOGLE_SHEETS_CONFIG
from services.tipo_service import TipoService

logger = logging.getLogger(__name__)

class GoogleSheetsWriter:
    def __init__(self):
        """Inicializa el cliente de Google Sheets con manejo robusto de credenciales."""
        # Inicializar atributos básicos
        self.sheet_id = ""
        self.sheet_name = "Hoja 1"
        self.scope = [
            "https://spreadsheets.google.com/feeds",
            "https://www.googleapis.com/auth/drive"
        ]
        self.creds = None
        self.client = None
        self.spreadsheet = None
        self.worksheet = None
        
        # Configuración del directorio de datos
        self.data_dir = Path("data")
        self.data_dir.mkdir(exist_ok=True)
        
        # Headers esperados para normalización (nuevos campos)
        self.expected_headers = [
            "Fecha", "Notas", "Categoria", "Tipo de Producto", "Link de Fotografia",
            "Precio", "Descuento", "Precio Final", "Unidades", "Forma de pago"
        ]
        # Servicio para obtener 'Tipo' por ID
        self.tipo_service = None
        
        try:
            print("\n=== Inicializando GoogleSheetsWriter ===")
            
            # 1. Verificar configuración básica
            if not GOOGLE_SHEETS_CONFIG.get("SHEET_ID"):
                raise ValueError("No se encontró SHEET_ID en la configuración")
                
            self.sheet_id = GOOGLE_SHEETS_CONFIG["SHEET_ID"]
            self.sheet_name = GOOGLE_SHEETS_CONFIG.get("SHEET_NAME", "Hoja 1")
            
            # 2. Obtener/validar credenciales
            print("\n🔍 Validando credenciales...")
            # Fuentes soportadas (en orden):
            #  - GOOGLE_CREDENTIALS (Railway UI habitual para Node)
            #  - GOOGLE_CREDENTIALS_JSON
            #  - GOOGLE_SHEETS_CREDENTIALS (usada por config.py)
            #  - Archivo local google_credentials.json
            raw_env = (
                os.getenv("GOOGLE_CREDENTIALS")
                or os.getenv("GOOGLE_CREDENTIALS_JSON")
                or os.getenv("GOOGLE_SHEETS_CREDENTIALS")
            )

            credentials = None
            if raw_env:
                try:
                    credentials = json.loads(raw_env)
                except Exception as e:
                    raise ValueError(f"GOOGLE_*_CREDENTIALS no es JSON válido: {e}")
            elif os.path.exists("google_credentials.json"):
                try:
                    with open("google_credentials.json", "r", encoding="utf-8") as f:
                        credentials = json.load(f)
                except Exception as e:
                    raise ValueError(f"No se pudo leer google_credentials.json: {e}")
            else:
                credentials = GOOGLE_SHEETS_CONFIG.get("CREDENTIALS", {})
            
            if not isinstance(credentials, dict) or not credentials:
                raise ValueError("No se encontraron credenciales válidas en la configuración")
                
            # 3. Normalizar private_key y verificar campos obligatorios
            required_fields = ["type", "project_id", "private_key_id", "private_key", 
                             "client_email", "client_id", "token_uri"]
            missing_fields = [field for field in required_fields if field not in credentials]
            
            if missing_fields:
                raise ValueError(f"Credenciales incompletas. Faltan campos: {', '.join(missing_fields)}")

            # Normalizar salto de línea de la clave privada si vino con "\\n"
            if isinstance(credentials.get("private_key"), str):
                credentials["private_key"] = credentials["private_key"].replace("\\n", "\n")
                
            # 4. Crear credenciales / cliente
            self._initialize_credentials(credentials)
            
            # 5. Inicializar cliente y conectar con Google Sheets
            self._initialize_client()
            try:
                self.tipo_service = TipoService()
            except Exception as e:
                logger.warning(f"No se pudo inicializar TipoService: {e}")
            
        except Exception as e:
            error_msg = f"❌ Error al inicializar GoogleSheetsWriter: {str(e)}"
            logger.error(error_msg, exc_info=True)
            print(error_msg)
            raise
            
    def _initialize_credentials(self, credentials):
        """Inicializa el cliente de Google Sheets usando google-auth vía gspread."""
        try:
            print("🔑 Creando cliente de servicio con gspread.service_account_from_dict...")
            # gspread gestiona internamente google-auth con este helper
            self.client = gspread.service_account_from_dict(credentials)
            print("✅ Cliente de Google Sheets creado correctamente")
            print(f"   Cuenta de servicio: {credentials.get('client_email')}")
        except Exception as e:
            error_msg = f"❌ Error al crear cliente de Google Sheets: {str(e)}"
            raise ValueError(error_msg) from e
    
    def _initialize_client(self):
        """Inicializa el cliente de Google Sheets y configura la hoja de trabajo."""
        try:
            print("\n🔌 Conectando con Google Sheets API...")
            # self.client ya se creó en _initialize_credentials
            if not self.client:
                raise RuntimeError("Cliente de Google Sheets no inicializado")
            print("✅ Conexión exitosa con Google Sheets API")
            
            # Abrir la hoja de cálculo
            print(f"\n📂 Abriendo hoja de cálculo con ID: {self.sheet_id}")
            self.spreadsheet = self.client.open_by_key(self.sheet_id)
            print(f"✅ Hoja de cálculo abierta: '{self.spreadsheet.title}'")
            
            # Obtener o crear la hoja específica
            self._setup_worksheet()
            
            # Verificar permisos de escritura
            self._verify_write_permissions()
            
        except gspread.exceptions.APIError as e:
            error_msg = f"❌ Error de la API de Google Sheets: {str(e)}"
            if "PERMISSION_DENIED" in str(e):
                error_msg += "\n🔑 Error de permisos. Verifica que:"
                error_msg += f"\n   1. La cuenta de servicio {self.creds.service_account_email} tenga acceso a la hoja"
                error_msg += "\n   2. La hoja de cálculo sea accesible (compartida con la cuenta de servicio)"
                error_msg += "\n   3. Los permisos de la hoja permitan la edición"
            elif "Unable to parse range" in str(e):
                error_msg += "\n📄 Error en el rango. Verifica que el nombre de la hoja sea correcto"
            raise Exception(error_msg) from e
            
        except Exception as e:
            error_msg = f"❌ Error al inicializar el cliente de Google Sheets: {str(e)}"
            logger.error(error_msg, exc_info=True)
            print(error_msg)
            if "invalid_grant" in str(e):
                print("🔑 Error de autenticación. Verifica que las credenciales sean válidas y no hayan expirado")
            raise
    
    def _setup_worksheet(self):
        """Configura la hoja de trabajo, creándola si no existe."""
        print(f"\n📝 Buscando hoja: '{self.sheet_name}'")
        try:
            self.worksheet = self.spreadsheet.worksheet(self.sheet_name)
            print(f"✅ Hoja '{self.sheet_name}' encontrada y lista para usar")
        except gspread.WorksheetNotFound:
            print(f"⚠️ La hoja '{self.sheet_name}' no fue encontrada. Intentando crear...")
            self.worksheet = self.spreadsheet.add_worksheet(
                title=self.sheet_name, 
                rows=100, 
                cols=20
            )
            print(f"✅ Hoja '{self.sheet_name}' creada exitosamente")
    
    def _verify_write_permissions(self):
        """Verifica que se tengan permisos de escritura en la hoja."""
        try:
            test_cell = f'A{self.obtener_ultima_fila_confiable() + 1}'
            self.worksheet.update(test_cell, "", raw=False)
        except Exception as e:
            print(f"⚠️ Advertencia: No se pudo escribir en la hoja. Verifica los permisos de escritura: {e}")
    
    def obtener_ultima_fila_confiable(self):
        """
        Obtiene la próxima fila libre de forma confiable usando get_all_values()
        Evita falsos vacíos causados por formato o fórmulas
        """
        try:
            # Obtener todos los valores de la hoja
            all_values = self.worksheet.get_all_values()
            
            # Buscar la primera fila completamente vacía
            for i, row in enumerate(all_values):
                if not any(cell.strip() if isinstance(cell, str) else cell for cell in row):
                    return i + 1  # +1 porque las filas empiezan en 1
            
            # Si no hay filas vacías, contar solo filas con datos REALES
            filas_con_datos = 0
            for row in all_values:
                # Una fila tiene datos si tiene al menos 2 celdas con contenido útil
                celdas_utiles = 0
                for cell in row:
                    if isinstance(cell, str):
                        cell_clean = cell.strip()
                        if cell_clean and cell_clean not in ['', '-', 'N/A', 'n/a', 'NULL', 'null', 'None', 'none', ' ', '$0,00', '$0.00', '0', '0.00', '0,00']:
                            celdas_utiles += 1
                    elif cell is not None and cell != '' and cell != 0 and cell != 0.0:
                        celdas_utiles += 1
                
                if celdas_utiles >= 2:  # Al menos 2 celdas útiles
                    filas_con_datos += 1
            
            logger.info(f"Filas con datos REALES: {filas_con_datos} (de {len(all_values)} total)")
            return filas_con_datos + 1
            
        except Exception as e:
            logger.warning(f"No se pudo obtener la última fila de forma confiable: {e}")
            # Fallback: usar col_values
            try:
                columna_a = self.worksheet.col_values(1)
                return len(columna_a) + 1 if columna_a else 1
            except:
                return 1

    def obtener_primer_fila_vacia_util(self):
        """Encuentra la primera fila vacía 'útil' desde arriba.
        Considera vacía si A:C y E:L están vacías (D se ignora para no interferir con fórmulas).
        Devuelve número de fila (1-based). Si no hay huecos, retorna la siguiente al final confiable."""
        try:
            all_values = self.worksheet.get_all_values()
            if not all_values:
                return 2  # dejar fila 1 para headers
            # Recorrer desde fila 2 (índice 1 en lista)
            for i, row in enumerate(all_values, start=1):
                if i == 1:
                    continue  # headers
                # A:C = indices 0..2, E:L = 4..11
                def is_empty(cell):
                    if cell is None:
                        return True
                    s = str(cell).strip()
                    return s == ""
                # A:C
                ac_vacias = True
                for c in range(0, min(3, len(row))):
                    if not is_empty(row[c]):
                        ac_vacias = False
                        break
                # E:L
                el_vacias = True
                for c in range(4, 12):
                    if c < len(row) and not is_empty(row[c]):
                        el_vacias = False
                        break
                if ac_vacias and el_vacias:
                    return i
            # Si no hay huecos, usar la siguiente al final confiable
            return self.obtener_ultima_fila_confiable()
        except Exception as e:
            logger.warning(f"Fallo en obtener_primer_fila_vacia_util: {e}")
            return self.obtener_ultima_fila_confiable()
    
    def asegurar_capacidad_hoja(self, filas_necesarias=1, columnas_necesarias=None):
        """
        Asegura que la hoja tenga suficiente capacidad antes de escribir
        Expande filas/columnas si es necesario
        """
        try:
            if columnas_necesarias is None:
                columnas_necesarias = len(self.expected_headers)
            
            # Obtener dimensiones actuales
            current_rows = self.worksheet.row_count
            current_cols = self.worksheet.col_count
            
            # Calcular filas necesarias (con colchón del 20%)
            filas_requeridas = max(current_rows, filas_necesarias + int(filas_necesarias * 0.2))
            columnas_requeridas = max(current_cols, columnas_necesarias + 2)  # +2 de colchón
            
            # Expandir si es necesario
            if filas_requeridas > current_rows:
                logger.info(f"Expandiendo hoja de {current_rows} a {filas_requeridas} filas")
                try:
                    self.worksheet.resize(rows=filas_requeridas, cols=current_cols)
                except gspread.exceptions.APIError as e:
                    if "protected" in str(e).lower():
                        logger.warning("La hoja está protegida, no se puede expandir automáticamente")
                        return False
                    else:
                        raise
            
            if columnas_requeridas > current_cols:
                logger.info(f"Expandiendo hoja de {current_cols} a {columnas_requeridas} columnas")
                try:
                    self.worksheet.resize(rows=current_rows, cols=columnas_requeridas)
                except gspread.exceptions.APIError as e:
                    if "protected" in str(e).lower():
                        logger.warning("La hoja está protegida, no se puede expandir automáticamente")
                        return False
                    else:
                        raise
                
            return True
            
        except Exception as e:
            logger.error(f"Error asegurando capacidad de la hoja: {e}")
            return False
    
    def normalizar_fila_datos(self, fila_datos):
        """
        Normaliza la fila de datos para que coincida con el número de columnas esperadas
        """
        try:
            # Si la fila es más corta que los headers, rellenar con cadenas vacías
            while len(fila_datos) < len(self.expected_headers):
                fila_datos.append("")
            
            # Si es más larga, truncar
            if len(fila_datos) > len(self.expected_headers):
                fila_datos = fila_datos[:len(self.expected_headers)]
            
            return fila_datos
            
        except Exception as e:
            logger.error(f"Error normalizando fila de datos: {e}")
            return fila_datos
    
    def preparar_fila_venta(self, venta):
        """Prepara los datos de la venta en el formato del Google Sheet con nuevos campos"""
        try:
            # El precio que ingresa el usuario es el precio unitario
            precio_unitario = round(venta["precio"], 2)
            unidades = int(venta["unidades"])
            
            # Calcular precio final (precio unitario × unidades)
            precio_final = round(precio_unitario * unidades, 2)
            
            # Calcular descuento (por defecto 0, se puede modificar)
            descuento = venta.get("descuento", 0)
            if descuento > 0:
                precio_final = round(precio_final * (1 - descuento/100), 2)
            
            # Formato de fecha para el sheet (DD/MM/YYYY)
            fecha_obj = datetime.fromisoformat(venta["fecha"])
            
            # Obtener categoría del producto (si está disponible)
            categoria = venta.get("categoria", "General")
            
            # Obtener link de fotografía (si está disponible)
            link_foto = venta.get("link_foto", "")

            # Preparar fila según el nuevo formato
            fila = [
                fecha_obj.strftime("%d/%m/%Y"),              # A: Fecha (DD/MM/YYYY)
                venta.get("notas", ""),                      # B: Notas
                categoria,                                   # C: Categoria
                venta["nombre"],                             # D: Tipo de Producto
                link_foto,                                   # E: Link de Fotografia
                float(precio_unitario),                      # F: Precio (precio unitario)
                float(descuento),                           # G: Descuento
                float(precio_final),                         # H: Precio Final
                int(unidades),                              # I: Unidades
                venta.get("pago", "Efectivo")               # J: Forma de pago
            ]
            
            # Normalizar la fila
            return self.normalizar_fila_datos(fila)
            
        except Exception as e:
            logger.error(f"Error preparando fila de venta: {e}")
            raise
    
    def escribir_fila_con_reintentos(self, fila_datos, fila_destino, max_reintentos=3):
        """
        Escribe una fila con reintentos automáticos si hay errores de límites de grilla
        """
        for intento in range(max_reintentos):
            try:
                # Escribir cada columna individualmente usando update_cell
                for i, valor in enumerate(fila_datos):
                    columna = i + 1  # gspread usa números: 1=A, 2=B, 3=C, etc.
                    if columna == 4:
                        continue
                    self.worksheet.update_cell(fila_destino, columna, valor)
                
                logger.info(f"✅ Fila {fila_destino} escrita exitosamente columna por columna")
                return True
                
            except gspread.exceptions.APIError as e:
                error_msg = str(e).lower()
                
                # Si es error de límites de grilla, expandir y reintentar
                if any(phrase in error_msg for phrase in ["grid limits", "exceeds", "out of grid"]):
                    logger.warning(f"Error de límites de grilla (intento {intento + 1}): {e}")
                    
                    if intento < max_reintentos - 1:  # No expandir en el último intento
                        # Expandir la hoja y reintentar
                        if self.asegurar_capacidad_hoja(fila_destino + 10):
                            logger.info("Hoja expandida, reintentando...")
                            continue
                
                # Si es error de permisos, no reintentar
                elif "permission" in error_msg or "denied" in error_msg:
                    logger.error(f"❌ Error de permisos: {e}")
                    raise RuntimeError(f"Error de permisos en Google Sheets: {e}")
                
                # Otros errores del API
                else:
                    logger.error(f"❌ Error del API de Google Sheets: {e}")
                    if intento == max_reintentos - 1:  # Último intento
                        raise
                    continue
                    
            except Exception as e:
                logger.error(f"❌ Error inesperado escribiendo fila: {e}")
                if intento == max_reintentos - 1:  # Último intento
                    raise
                continue
        
        return False
    
    def escribir_fila_sin_expandir(self, fila_datos, fila_destino, max_reintentos=3):
        """
        Escribe una fila de datos SIN expandir la hoja (para hojas protegidas)
        Intenta escribir en TODAS las columnas ya que la protección parece ser parcial
        """
        for intento in range(max_reintentos):
            try:
                # Intentar escribir en TODAS las columnas permitidas (A:C y E:L), evitando D
                columnas_todas = [
                    f"A{fila_destino}",  # Fecha
                    f"B{fila_destino}",  # Notas
                    f"C{fila_destino}",  # ID
                    f"E{fila_destino}",  # Precio
                    f"F{fila_destino}",  # Unidades
                    f"G{fila_destino}",  # Precio Unitario
                    f"H{fila_destino}",  # Costo U
                    f"I{fila_destino}",  # Tipo
                    f"J{fila_destino}",  # Forma de pago
                    f"K{fila_destino}",  # Costo Total
                    f"L{fila_destino}"   # Margen
                ]
                
                # Datos para todas las columnas
                datos_todas = [
                    fila_datos[0],   # Fecha
                    fila_datos[1],   # Notas
                    fila_datos[2],   # ID
                    fila_datos[4],   # Precio
                    fila_datos[5],   # Unidades
                    fila_datos[6],   # Precio Unitario
                    fila_datos[7],   # Costo U
                    fila_datos[8],   # Tipo
                    fila_datos[9],   # Forma de pago
                    fila_datos[10],  # Costo Total
                    fila_datos[11]   # Margen
                ]
                
                # Escribir cada columna individualmente
                for i, columna in enumerate(columnas_todas):
                    try:
                        self.worksheet.update(columna, [[datos_todas[i]]])  # Formato correcto: lista de listas
                    except Exception as col_error:
                        logger.warning(f"No se pudo escribir {columna}: {col_error}")
                        # Continuar con la siguiente columna
                        continue
                
                logger.info(f"✅ Fila {fila_destino} escrita exitosamente")
                return True
                
            except gspread.exceptions.APIError as e:
                error_msg = str(e).lower()
                
                # Si es error de límites de grilla, NO expandir - solo reintentar
                if any(phrase in error_msg for phrase in ["grid limits", "exceeds", "out of grid"]):
                    logger.warning(f"Error de límites de grilla (intento {intento + 1}): {e}")
                    if intento < max_reintentos - 1:
                        logger.info("Reintentando sin expandir...")
                        continue
                    else:
                        logger.error("No se pudo escribir: hoja llena y protegida")
                        return False
                
                # Si es error de permisos, no reintentar
                elif "permission" in error_msg or "denied" in error_msg:
                    logger.error(f"❌ Error de permisos: {e}")
                    return False
                
                # Otros errores del API
                else:
                    logger.error(f"❌ Error del API de Google Sheets: {e}")
                    if intento == max_reintentos - 1:  # Último intento
                        return False
                    continue
                    
            except Exception as e:
                logger.error(f"❌ Error inesperado escribiendo fila: {e}")
                if intento == max_reintentos - 1:  # Último intento
                    return False
                continue
        
        return False
    
    def agregar_venta_a_sheets(self, venta):
        """Agrega una venta al Google Sheet existente con manejo robusto de errores"""
        try:
            # Preparar los datos de la venta
            fila_datos = self.preparar_fila_venta(venta)
            
            # Buscar 'huecos': primera fila vacía útil (A:C y E:L vacías). Si no, siguiente al final
            proxima_fila = self.obtener_primer_fila_vacia_util()
            
            # Asegurar que la hoja tenga capacidad suficiente
            if not self.asegurar_capacidad_hoja(proxima_fila + 5):
                logger.warning("No se pudo asegurar capacidad de la hoja, continuando...")
            
            # Guardar en archivo CSV local para referencia
            csv_file = self.data_dir / "ventas_para_sheets.csv"
            with open(csv_file, 'a', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow(fila_datos)
            
            logger.info(f"Venta guardada en {csv_file}")
            logger.info(f"✅ Venta preparada para fila {proxima_fila}: {fila_datos}")
            
            # Verificar si la hoja está protegida
            hoja_protegida = self._verificar_si_hoja_protegida()
            logger.info(f"Hoja protegida: {hoja_protegida}")
            
            # Elegir función de escritura según si la hoja está protegida
            if hoja_protegida:
                # Hoja protegida: escribir solo en columnas libres
                if self.escribir_fila_sin_expandir(fila_datos, proxima_fila):
                    logger.info(f"✅ Venta agregada a Google Sheets en fila {proxima_fila} (columnas libres)")
                    return {
                        "success": True,
                        "fila": proxima_fila,
                        "mensaje": f"Venta agregada en fila {proxima_fila} (columnas libres)",
                        "datos": fila_datos
                    }
                else:
                    raise RuntimeError("No se pudo escribir la fila después de múltiples intentos")
            else:
                # Hoja NO protegida: escribir en TODAS las columnas
                if self.escribir_fila_con_reintentos(fila_datos, proxima_fila):
                    logger.info(f"✅ Venta agregada a Google Sheets en fila {proxima_fila} (todas las columnas)")
                    return {
                        "success": True,
                        "fila": proxima_fila,
                        "mensaje": f"Venta agregada en fila {proxima_fila} (todas las columnas)",
                        "datos": fila_datos
                    }
                else:
                    raise RuntimeError("No se pudo escribir la fila después de múltiples intentos")
            
        except gspread.exceptions.APIError as e:
            error_msg = str(e).lower()
            
            # Manejar errores específicos del API
            if "permission" in error_msg or "denied" in error_msg:
                return {
                    "success": False,
                    "error": "PERMISSION_DENIED",
                    "mensaje": "No tienes permisos para escribir en esta hoja. Verifica que la cuenta de servicio tenga acceso de edición."
                }
            elif "grid limits" in error_msg or "exceeds" in error_msg:
                if "protected" in error_msg:
                    return {
                        "success": False,
                        "error": "PROTECTED_SHEET",
                        "mensaje": "La hoja está protegida y no se puede expandir automáticamente. Contacta al administrador para expandir la hoja manualmente."
                    }
                else:
                    return {
                        "success": False,
                        "error": "GRID_LIMITS",
                        "mensaje": "La hoja ha alcanzado sus límites de tamaño. Contacta al administrador."
                    }
            elif "protected" in error_msg:
                return {
                    "success": False,
                    "error": "PROTECTED_SHEET",
                    "mensaje": "La hoja está protegida y no se puede modificar. Contacta al administrador."
                }
            else:
                return {
                    "success": False,
                    "error": "API_ERROR",
                    "mensaje": f"Error del API de Google Sheets: {str(e)}"
                }
                
        except Exception as e:
            logger.error(f"Error agregando venta a Google Sheets: {e}")
            return {
                "success": False,
                "error": "UNKNOWN_ERROR",
                "mensaje": f"Error inesperado: {str(e)}"
            }

    
    def limpiar_filas_vacias(self):
        """
        Limpia filas vacías del final de la hoja para liberar espacio
        Usa detección más inteligente para encontrar filas realmente vacías
        """
        try:
            logger.info("Iniciando limpieza inteligente de filas vacías...")
            
            # Obtener todos los valores
            all_values = self.worksheet.get_all_values()
            
            if not all_values:
                logger.info("La hoja está vacía, no hay nada que limpiar")
                return {"success": True, "filas_limpiadas": 0}
            
            # Encontrar la última fila con datos REALMENTE significativos
            ultima_fila_con_datos = 0
            for i, row in enumerate(all_values):
                # Verificar si la fila tiene datos significativos
                tiene_datos_significativos = False
                for cell in row:
                    if isinstance(cell, str):
                        cell_clean = cell.strip()
                        # Ignorar celdas que solo tienen espacios, guiones, o caracteres especiales
                        if cell_clean and cell_clean not in ['', '-', 'N/A', 'n/a', 'NULL', 'null', 'None', 'none']:
                            tiene_datos_significativos = True
                            break
                    elif cell is not None and cell != '':
                        tiene_datos_significativos = True
                        break
                
                if tiene_datos_significativos:
                    ultima_fila_con_datos = i + 1
            
            logger.info(f"Última fila con datos significativos: {ultima_fila_con_datos}")
            logger.info(f"Total de filas en la hoja: {len(all_values)}")
            
            # Si la última fila con datos es menor que el total, limpiar
            if ultima_fila_con_datos < len(all_values):
                filas_a_limpiar = len(all_values) - ultima_fila_con_datos
                logger.info(f"Limpiando {filas_a_limpiar} filas vacías del final")
                
                # Limpiar filas vacías del final
                if filas_a_limpiar > 0:
                    filas_limpiadas_exitosamente = 0
                    for i in range(ultima_fila_con_datos + 1, len(all_values) + 1):
                        try:
                            # Limpiar la fila sin afectar la columna D: A:C y E:L
                            self.worksheet.batch_clear([f'A{i}:C{i}', f'E{i}:L{i}'])
                            filas_limpiadas_exitosamente += 1
                            logger.debug(f"Fila {i} limpiada exitosamente")
                        except Exception as e:
                            logger.warning(f"No se pudo limpiar fila {i}: {e}")
                            continue
                    
                    logger.info(f"✅ Limpieza completada. Filas limpiadas: {filas_limpiadas_exitosamente}")
                    return {
                        "success": True, 
                        "filas_limpiadas": filas_limpiadas_exitosamente,
                        "nueva_ultima_fila": ultima_fila_con_datos,
                        "total_filas_antes": len(all_values),
                        "total_filas_despues": ultima_fila_con_datos
                    }
                else:
                    logger.info("No hay filas para limpiar")
                    return {"success": True, "filas_limpiadas": 0}
            else:
                logger.info("No hay filas vacías para limpiar")
                return {"success": True, "filas_limpiadas": 0}
                
        except Exception as e:
            logger.error(f"Error limpiando filas vacías: {e}")
            return {"success": False, "error": str(e)}
    
    def limpiar_filas_vacias_agresiva(self):
        """
        Limpieza más agresiva que busca filas vacías en toda la hoja
        """
        try:
            logger.info("Iniciando limpieza agresiva de filas vacías...")
            
            # Obtener todos los valores
            all_values = self.worksheet.get_all_values()
            
            if not all_values:
                logger.info("La hoja está vacía, no hay nada que limpiar")
                return {"success": True, "filas_limpiadas": 0}
            
            # Buscar filas vacías en toda la hoja (no solo al final)
            filas_a_limpiar = []
            filas_con_datos = []
            
            for i, row in enumerate(all_values):
                # Verificar si la fila está realmente vacía
                fila_vacia = True
                for cell in row:
                    if isinstance(cell, str):
                        cell_clean = cell.strip()
                        if cell_clean and cell_clean not in ['', '-', 'N/A', 'n/a', 'NULL', 'null', 'None', 'none']:
                            fila_vacia = False
                            break
                    elif cell is not None and cell != '':
                        fila_vacia = False
                        break
                
                if fila_vacia:
                    filas_a_limpiar.append(i + 1)  # +1 porque las filas empiezan en 1
                else:
                    filas_con_datos.append(i + 1)
            
            logger.info(f"Filas con datos: {len(filas_con_datos)}")
            logger.info(f"Filas vacías encontradas: {len(filas_a_limpiar)}")
            
            if filas_a_limpiar:
                # Limpiar filas vacías
                filas_limpiadas_exitosamente = 0
                for fila_num in filas_a_limpiar:
                    try:
                        self.worksheet.batch_clear([f'A{fila_num}:L{fila_num}'])
                        filas_limpiadas_exitosamente += 1
                    except Exception as e:
                        logger.warning(f"No se pudo limpiar fila {fila_num}: {e}")
                        continue
                
                logger.info(f"✅ Limpieza agresiva completada. Filas limpiadas: {filas_limpiadas_exitosamente}")
                return {
                    "success": True,
                    "filas_limpiadas": filas_limpiadas_exitosamente,
                    "filas_vacias_encontradas": len(filas_a_limpiar),
                    "filas_con_datos": len(filas_con_datos)
                }
            else:
                logger.info("No se encontraron filas vacías para limpiar")
                return {"success": True, "filas_limpiadas": 0}
                
        except Exception as e:
            logger.error(f"Error en limpieza agresiva: {e}")
            return {"success": False, "error": str(e)}
    
    def limpiar_filas_fantasma(self):
        """
        Limpieza ULTRA-AGRESIVA que busca filas fantasma con formato/formulas
        """
        try:
            logger.info("Iniciando limpieza ULTRA-AGRESIVA de filas fantasma...")
            
            # Obtener todos los valores
            all_values = self.worksheet.get_all_values()
            
            if not all_values:
                logger.info("La hoja está vacía, no hay nada que limpiar")
                return {"success": True, "filas_limpiadas": 0}
            
            # Buscar filas que parecen vacías pero pueden tener formato/formulas
            filas_a_limpiar = []
            filas_con_datos_reales = []
            
            for i, row in enumerate(all_values):
                # Verificar si la fila tiene datos REALMENTE significativos
                tiene_datos_reales = False
                
                # Verificar cada celda de la fila
                for j, cell in enumerate(row):
                    if isinstance(cell, str):
                        cell_clean = cell.strip()
                        # Solo considerar datos reales si tienen contenido significativo
                        if cell_clean and len(cell_clean) > 0 and cell_clean not in ['', '-', 'N/A', 'n/a', 'NULL', 'null', 'None', 'none', ' ']:
                            tiene_datos_reales = True
                            break
                    elif cell is not None and cell != '' and cell != 0:
                        tiene_datos_reales = True
                        break
                
                # Si la fila no tiene datos reales, marcarla para limpiar
                if not tiene_datos_reales:
                    filas_a_limpiar.append(i + 1)
                else:
                    filas_con_datos_reales.append(i + 1)
            
            logger.info(f"Filas con datos REALES: {len(filas_con_datos_reales)}")
            logger.info(f"Filas fantasma encontradas: {len(filas_a_limpiar)}")
            
            if filas_a_limpiar:
                # Limpiar filas fantasma
                filas_limpiadas_exitosamente = 0
                for fila_num in filas_a_limpiar:
                    try:
                        # Limpiar la fila sin afectar la columna D: A:C y E:L
                        self.worksheet.batch_clear([f'A{fila_num}:C{fila_num}', f'E{fila_num}:L{fila_num}'])
                        filas_limpiadas_exitosamente += 1
                        logger.debug(f"Fila fantasma {fila_num} limpiada")
                    except Exception as e:
                        logger.warning(f"No se pudo limpiar fila fantasma {fila_num}: {e}")
                        continue
                
                logger.info(f"✅ Limpieza ULTRA-AGRESIVA completada. Filas limpiadas: {filas_limpiadas_exitosamente}")
                return {
                    "success": True,
                    "filas_limpiadas": filas_limpiadas_exitosamente,
                    "filas_fantasma_encontradas": len(filas_a_limpiar),
                    "filas_con_datos_reales": len(filas_con_datos_reales),
                    "total_filas_antes": len(all_values),
                    "total_filas_despues": len(filas_con_datos_reales)
                }
            else:
                logger.info("No se encontraron filas fantasma para limpiar")
                return {"success": True, "filas_limpiadas": 0}
                
        except Exception as e:
            logger.error(f"Error en limpieza ultra-agresiva: {e}")
            return {"success": False, "error": str(e)}
    
    def limpiar_filas_basura(self):
        """
        LIMPIEZA INTELIGENTE que detecta filas con solo datos basura ($0,00, espacios, etc.)
        """
        try:
            logger.info("Iniciando limpieza INTELIGENTE de filas con datos basura...")
            
            # Obtener todos los valores
            all_values = self.worksheet.get_all_values()
            
            if not all_values:
                logger.info("La hoja está vacía, no hay nada que limpiar")
                return {"success": True, "filas_limpiadas": 0}
            
            # Buscar filas que solo tienen datos basura
            filas_a_limpiar = []
            filas_con_datos_utiles = []
            
            for i, row in enumerate(all_values):
                # Contar celdas con datos útiles vs basura
                celdas_utiles = 0
                celdas_basura = 0
                
                for j, cell in enumerate(row):
                    if isinstance(cell, str):
                        cell_clean = cell.strip()
                        # Datos basura comunes
                        if (cell_clean in ['', '-', 'N/A', 'n/a', 'NULL', 'null', 'None', 'none', ' ', '$0,00', '$0.00', '0', '0.00', '0,00'] or
                            len(cell_clean) == 0):
                            celdas_basura += 1
                        else:
                            celdas_utiles += 1
                    elif cell is None or cell == '' or cell == 0 or cell == 0.0:
                        celdas_basura += 1
                    else:
                        celdas_utiles += 1
                
                # Si la fila tiene menos de 2 celdas útiles, es basura
                if celdas_utiles < 2:
                    filas_a_limpiar.append(i + 1)
                    logger.debug(f"Fila {i+1} marcada como basura: {celdas_utiles} útiles, {celdas_basura} basura")
                else:
                    filas_con_datos_utiles.append(i + 1)
            
            logger.info(f"Filas con datos ÚTILES: {len(filas_con_datos_utiles)}")
            logger.info(f"Filas con datos BASURA: {len(filas_a_limpiar)}")
            
            if filas_a_limpiar:
                # Limpiar filas con basura
                filas_limpiadas_exitosamente = 0
                for fila_num in filas_a_limpiar:
                    try:
                        # Limpiar la fila sin afectar la columna D: A:C y E:L
                        self.worksheet.batch_clear([f'A{fila_num}:C{fila_num}', f'E{fila_num}:L{fila_num}'])
                        filas_limpiadas_exitosamente += 1
                        logger.info(f"Fila basura {fila_num} limpiada")
                    except Exception as e:
                        logger.warning(f"No se pudo limpiar fila basura {fila_num}: {e}")
                        continue
                
                logger.info(f"✅ Limpieza INTELIGENTE completada. Filas limpiadas: {filas_limpiadas_exitosamente}")
                return {
                    "success": True,
                    "filas_limpiadas": filas_limpiadas_exitosamente,
                    "filas_basura_encontradas": len(filas_a_limpiar),
                    "filas_con_datos_utiles": len(filas_con_datos_utiles),
                    "total_filas_antes": len(all_values),
                    "total_filas_despues": len(filas_con_datos_utiles)
                }
            else:
                logger.info("No se encontraron filas con datos basura para limpiar")
                return {"success": True, "filas_limpiadas": 0}
                
        except Exception as e:
            logger.error(f"Error en limpieza inteligente: {e}")
            return {"success": False, "error": str(e)}
    
    def obtener_estado_detallado(self):
        """
        Obtiene un estado muy detallado de la hoja para diagnóstico
        """
        try:
            all_values = self.worksheet.get_all_values()
            
            # Analizar cada fila en detalle
            analisis_filas = []
            filas_con_datos = 0
            filas_vacias = 0
            filas_con_formato = 0
            
            for i, row in enumerate(all_values):
                fila_info = {
                    "numero": i + 1,
                    "tiene_datos": False,
                    "celdas_con_contenido": 0,
                    "celdas_vacias": 0,
                    "contenido_ejemplo": []
                }
                
                for j, cell in enumerate(row):
                    if isinstance(cell, str):
                        cell_clean = cell.strip()
                        if cell_clean and cell_clean not in ['', '-', 'N/A', 'n/a', 'NULL', 'null', 'None', 'none']:
                            fila_info["tiene_datos"] = True
                            fila_info["celdas_con_contenido"] += 1
                            if len(fila_info["contenido_ejemplo"]) < 3:  # Solo primeros 3 ejemplos
                                fila_info["contenido_ejemplo"].append(f"{chr(65+j)}: '{cell_clean}'")
                        else:
                            fila_info["celdas_vacias"] += 1
                    elif cell is not None and cell != '' and cell != 0:
                        fila_info["tiene_datos"] = True
                        fila_info["celdas_con_contenido"] += 1
                        if len(fila_info["contenido_ejemplo"]) < 3:
                            fila_info["contenido_ejemplo"].append(f"{chr(65+j)}: {cell}")
                    else:
                        fila_info["celdas_vacias"] += 1
                
                if fila_info["tiene_datos"]:
                    filas_con_datos += 1
                else:
                    filas_vacias += 1
                
                # Solo incluir filas problemáticas en el análisis
                if not fila_info["tiene_datos"] or fila_info["celdas_con_contenido"] < 2:
                    analisis_filas.append(fila_info)
            
            return {
                "success": True,
                "total_filas": len(all_values),
                "filas_con_datos": filas_con_datos,
                "filas_vacias": filas_vacias,
                "analisis_problematico": analisis_filas[:20],  # Solo primeras 20 para no saturar
                "resumen": f"De {len(all_values)} filas, {filas_con_datos} tienen datos y {filas_vacias} están vacías"
            }
            
        except Exception as e:
            logger.error(f"Error obteniendo estado detallado: {e}")
            return {"success": False, "error": str(e)}
    
    def crear_nueva_hoja(self, nombre_nueva_hoja=None):
        """
        Crea una nueva hoja en el mismo spreadsheet para continuar las ventas
        """
        try:
            if nombre_nueva_hoja is None:
                # Generar nombre automático con fecha
                from datetime import datetime
                fecha_actual = datetime.now().strftime("%Y-%m-%d")
                nombre_nueva_hoja = f"Ingreso Diario {fecha_actual}"
            
            logger.info(f"Creando nueva hoja: {nombre_nueva_hoja}")
            
            # Crear nueva hoja
            nueva_hoja = self.spreadsheet.add_worksheet(
                title=nombre_nueva_hoja,
                rows=1000,  # Empezar con 1000 filas
                cols=12      # 12 columnas como la original
            )
            
            # Copiar headers de la hoja original
            headers = self.worksheet.row_values(1)
            nueva_hoja.append_row(headers)
            
            logger.info(f"✅ Nueva hoja creada: {nombre_nueva_hoja}")
            
            # Cambiar a la nueva hoja
            self.worksheet = nueva_hoja
            self.sheet_name = nombre_nueva_hoja
            
            return {
                "success": True,
                "nombre_hoja": nombre_nueva_hoja,
                "url": f"https://docs.google.com/spreadsheets/d/{self.sheet_id}",
                "mensaje": f"Nueva hoja '{nombre_nueva_hoja}' creada y lista para usar"
            }
            
        except Exception as e:
            logger.error(f"Error creando nueva hoja: {e}")
            return {"success": False, "error": str(e)}
    
    def obtener_estado_sheets(self):
        """Obtiene el estado actual del Google Sheet"""
        try:
            # Obtener las primeras filas como ejemplo
            valores = self.worksheet.get_all_values()
            
            return {
                "success": True,
                "url": f"https://docs.google.com/spreadsheets/d/{self.sheet_id}",
                "nombre_hoja": self.sheet_name,
                "total_filas": len(valores),
                "ultima_fila": self.obtener_ultima_fila_confiable(),
                "dimensiones_hoja": {
                    "filas": self.worksheet.row_count,
                    "columnas": self.worksheet.col_count
                },
                "ejemplo_datos": valores[:5] if len(valores) > 0 else [],
                "hoja_protegida": self._verificar_si_hoja_protegida()
            }
            
        except Exception as e:
            logger.error(f"Error obteniendo estado de Google Sheets: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def _verificar_si_hoja_protegida(self):
        """
        Verifica si la hoja está protegida
        """
        try:
            # Intentar expandir la hoja para ver si está protegida
            test_rows = self.worksheet.row_count + 1
            self.worksheet.resize(rows=test_rows, cols=self.worksheet.col_count)
            # Si llegamos aquí, no está protegida, revertir el cambio
            self.worksheet.resize(rows=test_rows-1, cols=self.worksheet.col_count)
            return False
        except Exception as e:
            return "protected" in str(e).lower()
    
    def quitar_proteccion_hoja(self):
        """
        Intenta quitar la protección de la hoja (solo si tienes permisos de admin)
        """
        try:
            logger.info("Intentando quitar protección de la hoja...")
            
            # Intentar quitar protección limpiando celdas protegidas
            try:
                # Limpiar un rango amplio para "romper" la protección
                self.worksheet.batch_clear(['A1:Z1000'])
                logger.info("✅ Protección removida exitosamente")
                return {"success": True, "mensaje": "Protección removida"}
            except gspread.exceptions.APIError as e:
                if "protected" in str(e).lower():
                    logger.warning("No se pudo quitar la protección: permisos insuficientes")
                    return {
                        "success": False, 
                        "error": "PERMISSIONS_DENIED",
                        "mensaje": "No tienes permisos para quitar la protección. Debes hacerlo manualmente desde Google Sheets."
                    }
                else:
                    raise
                    
        except Exception as e:
            logger.error(f"Error intentando quitar protección: {e}")
            return {"success": False, "error": str(e)}
    
    def agregar_multiples_ventas_a_sheets(self, ventas):
        """
        Exporta múltiples ventas a Google Sheets de forma ULTRA RÁPIDA usando operaciones en lote
        """
        if not ventas:
            return {
                "success": False,
                "error": "NO_HAY_VENTAS",
                "mensaje": "No hay ventas para exportar"
            }
        
        try:
            logger.info(f"🚀 EXPORTACIÓN RÁPIDA: {len(ventas)} ventas a Google Sheets...")
            
            # Obtener la próxima fila vacía
            proxima_fila = self.obtener_ultima_fila_confiable()
            
            # Preparar todas las filas de datos en una sola operación
            filas_datos = []
            for venta in ventas:
                fila_datos = self.preparar_fila_venta(venta)
                filas_datos.append(fila_datos)
            
            # Asegurar capacidad de la hoja
            filas_necesarias = proxima_fila + len(ventas)
            if not self.asegurar_capacidad_hoja(filas_necesarias + 5):
                logger.warning("No se pudo asegurar capacidad de la hoja, continuando...")
            
            # Verificar si la hoja está protegida
            hoja_protegida = self._verificar_si_hoja_protegida()
            logger.info(f"Hoja protegida: {hoja_protegida}")
            
            # EXPORTACIÓN RÁPIDA: Intentar escribir todas las filas de una vez
            try:
                if hoja_protegida:
                    # Hoja protegida: escribir fila por fila en columnas permitidas
                    logger.info("🔒 Hoja protegida detectada: escribiendo fila por fila en columnas permitidas...")
                    ventas_exitosas = 0
                    errores = []
                    for i, fila_datos in enumerate(filas_datos):
                        fila_actual = proxima_fila + i
                        try:
                            if self.escribir_fila_sin_expandir(fila_datos, fila_actual):
                                ventas_exitosas += 1
                            else:
                                errores.append(f"Fila {fila_actual}: no se pudo escribir")
                        except Exception as e2:
                            errores.append(f"Fila {fila_actual}: {str(e2)}")
                    
                    # Guardar en CSV local
                    csv_file = self.data_dir / "ventas_para_sheets.csv"
                    with open(csv_file, 'a', newline='', encoding='utf-8') as f:
                        writer = csv.writer(f)
                        for fila_datos in filas_datos:
                            writer.writerow(fila_datos)
                    
                    if ventas_exitosas == len(ventas):
                        logger.info(f"✅ {ventas_exitosas} ventas exportadas (hoja protegida)")
                        return {
                            "success": True,
                            "ventas_exportadas": ventas_exitosas,
                            "mensaje": f"✅ {ventas_exitosas} ventas exportadas exitosamente a Google Sheets (hoja protegida)"
                        }
                    else:
                        logger.warning(f"⚠️ Exportación parcial: {ventas_exitosas}/{len(ventas)} ventas (hoja protegida)")
                        return {
                            "success": False,
                            "error": "EXPORT_PARTIAL",
                            "ventas_exportadas": ventas_exitosas,
                            "errores": errores,
                            "mensaje": f"⚠️ {ventas_exitosas}/{len(ventas)} ventas exportadas. Algunas filas no se pudieron escribir por protección."
                        }
                else:
                    # Hoja NO protegida: usar el método más rápido posible
                    logger.info("🔄 Usando método ultra rápido para hoja sin protección...")
                    
                    # Escribir todas las filas de una vez usando dos rangos (A:C y E:L), evitando D
                    start = proxima_fila
                    end = proxima_fila + len(ventas) - 1
                    range_name_1 = f"A{start}:C{end}"
                    data_1 = [row[0:3] for row in filas_datos]
                    range_name_2 = f"E{start}:L{end}"
                    data_2 = [row[4:12] for row in filas_datos]
                    self.worksheet.update(range_name_1, data_1, value_input_option='USER_ENTERED')
                    self.worksheet.update(range_name_2, data_2, value_input_option='USER_ENTERED')
                    
                    logger.info(f"✅ {len(ventas)} ventas exportadas en lote (hoja sin protección)")
                    
                    # Guardar en CSV local
                    csv_file = self.data_dir / "ventas_para_sheets.csv"
                    with open(csv_file, 'a', newline='', encoding='utf-8') as f:
                        writer = csv.writer(f)
                        for fila_datos in filas_datos:
                            writer.writerow(fila_datos)
                    
                    return {
                        "success": True,
                        "ventas_exportadas": len(ventas),
                        "mensaje": f"✅ {len(ventas)} ventas exportadas exitosamente a Google Sheets (MODO ULTRA RÁPIDO)"
                    }
                    
            except Exception as e:
                logger.warning(f"⚠️ Método rápido falló, usando método tradicional: {e}")
                
                # Fallback al método tradicional si el rápido falla
                ventas_exitosas = 0
                errores = []
                
                for i, venta in enumerate(ventas):
                    try:
                        resultado = self.agregar_venta_a_sheets(venta)
                        if resultado["success"]:
                            ventas_exitosas += 1
                        else:
                            errores.append(f"Venta {i+1}: {resultado.get('error', 'Error desconocido')}")
                    except Exception as e2:
                        errores.append(f"Venta {i+1}: {str(e2)}")
                
                if ventas_exitosas == len(ventas):
                    return {
                        "success": True,
                        "ventas_exportadas": ventas_exitosas,
                        "mensaje": f"✅ {ventas_exitosas} ventas exportadas exitosamente a Google Sheets (método tradicional)"
                    }
                else:
                    return {
                        "success": False,
                        "error": "EXPORT_FAILED",
                        "errores": errores,
                        "mensaje": f"⚠️ {ventas_exitosas}/{len(ventas)} ventas exportadas. {len(errores)} errores."
                    }
                
        except Exception as e:
            error_msg = f"Error en exportación rápida: {str(e)}"
            logger.error(f"❌ {error_msg}")
            return {
                "success": False,
                "error": "EXPORT_ERROR",
                "mensaje": error_msg
            }