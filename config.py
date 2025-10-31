"""
Configuración centralizada para Milo Store ERP
"""
import os
import json

# Cargar variables de entorno desde archivo .env
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    print("⚠️ python-dotenv no está instalado. Instala con: pip install python-dotenv")

def get_google_credentials():
    """Obtiene las credenciales de Google Sheets desde variables de entorno o archivo."""
    try:
        creds_dict = {}
        
        # Primero intenta cargar desde la variable de entorno
        creds_json = os.getenv("GOOGLE_CREDENTIALS_JSON")
        if creds_json:
            try:
                creds_dict = json.loads(creds_json)
                print("✅ Credenciales cargadas desde variable de entorno")
                return creds_dict
            except json.JSONDecodeError as e:
                print(f"❌ Error: GOOGLE_CREDENTIALS_JSON no es un JSON válido: {e}")
        
        # Si no está en variables de entorno, busca el archivo local
        creds_path = os.path.join(os.path.dirname(__file__), 'google_credentials.json')
        if os.path.exists(creds_path):
            try:
                with open(creds_path, 'r', encoding='utf-8') as f:
                    creds_dict = json.load(f)
                    print("✅ Credenciales cargadas desde archivo local")
                    return creds_dict
            except Exception as e:
                print(f"❌ Error al leer el archivo de credenciales: {e}")
        
        # Si llegamos aquí, no se pudieron cargar las credenciales
        error_msg = """
        ⚠️ No se encontraron credenciales de Google Sheets.
        Por favor, configura una de las siguientes opciones:
        1. Variable de entorno GOOGLE_CREDENTIALS_JSON con el contenido del JSON de credenciales
        2. Archivo google_credentials.json en el directorio raíz del proyecto
        
        Asegúrate de que las credenciales tengan el formato correcto y los permisos necesarios.
        """
        print(error_msg)
        return {}
        
    except Exception as e:
        print(f"❌ Error inesperado al cargar credenciales: {e}")
        return {}

# Configuración de Google Sheets
GOOGLE_SHEETS_CONFIG = {
    "SHEET_ID": os.getenv("GOOGLE_SHEETS_SHEET_ID", "1yGcWVzdZzfSREiv39l4THat_8qsOF1cfQZaxdAQbBRw"),
    "SHEET_NAME": os.getenv("GOOGLE_SHEETS_SHEET_NAME", "Hoja 1"),
    "CATALOG_GID": os.getenv("GOOGLE_SHEETS_CATALOG_GID", "0"),  # GID de la hoja principal
    "TIMEOUT": int(os.getenv("GOOGLE_SHEETS_TIMEOUT", "10")),  # segundos
    "RETRY_ATTEMPTS": int(os.getenv("GOOGLE_SHEETS_RETRY_ATTEMPTS", "3")),
    "CREDENTIALS": get_google_credentials()
}

# Configuración de Google Apps Script (GAS)
GOOGLE_APPS_SCRIPT = {
    "GAS_URL": os.getenv("GAS_URL", "https://script.google.com/macros/s/AKfycbwJSgzppM13yjR-fMFccp-A5oc1LA3oqJlndR3phx_X_65wNsF40eyYAbLOD1bNjshsng/exec"),
    "GAS_API_KEY": os.getenv("GAS_API_KEY", ""),
    "TIMEOUT": int(os.getenv("GAS_TIMEOUT", "15")),
}

# Configuración de la aplicación
APP_CONFIG = {
    "DEBUG": True,
    "HOST": "0.0.0.0",
    "PORT": 5000,
    "SECRET_KEY": "milo-store-secret-key-2024"
}

# Configuración de archivos
FILE_CONFIG = {
    "DATA_DIR": "data",
    "EXCEL_FILENAME": "Milo Store ERP.xlsx",  # Nombre correcto del archivo
    "BACKUP_DIR": "backups",
    "USE_EXISTING_FILE": True,  # No crear archivos nuevos
    "EXISTING_FILE_PATH": "Milo Store ERP.xlsx"  # Ruta al archivo existente
}

# Configuración de logging
LOGGING_CONFIG = {
    "LEVEL": "INFO",
    "FORMAT": "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
} 