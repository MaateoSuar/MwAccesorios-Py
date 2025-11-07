from flask import Flask, render_template, request, jsonify, send_file, abort, redirect, url_for, flash
from werkzeug.utils import secure_filename
import os
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from functools import wraps
from pathlib import Path
from services.sales_service import (
    listar_ventas, agregar_venta, actualizar_venta, eliminar_venta, limpiar_ventas,
    listar_historial, listar_pretickets,
    agregar_item_preticket, actualizar_item_preticket, eliminar_item_preticket, limpiar_preticket,
    confirmar_preticket_como_venta, reabrir_venta_como_preticket, exportar_ventas_a_historial
)
from services.sales_service import eliminar_historial_item_db
import importlib
import threading
import requests
import csv
import io

app = Flask(__name__)
app.secret_key = 'your-secret-key-here'  # Change this to a secure secret key in production

# Initialize Flask-Login
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# User class for authentication
class User(UserMixin):
    def __init__(self, id):
        self.id = id

# Hardcoded user (in production, use a database)
USERS = {
    'MwAccesorios@gmail.com': {
        'password': 'Mw2025',
        'id': 1
    }
}

@login_manager.user_loader
def load_user(user_id):
    for email, user_data in USERS.items():
        if user_data['id'] == int(user_id):
            return User(user_data['id'])
    return None

@app.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
        
    if request.method == "POST":
        email = request.form.get('email')
        password = request.form.get('password')
        
        if email in USERS and USERS[email]['password'] == password:
            user = User(USERS[email]['id'])
            login_user(user)
            next_page = request.args.get('next')
            return redirect(next_page or url_for('index'))
        else:
            flash('Correo o contraseña incorrectos', 'error')
    
    return render_template("login.html")

@app.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

@app.route("/")
@login_required
def index():
    return render_template("index.html")

@app.route("/historial")
@login_required
def historial():
    return render_template("historial.html")

# API de ventas (memoria)
@app.route("/api/ventas", methods=["GET"])
def api_listar_ventas():
    return jsonify(listar_ventas())

@app.route("/api/ventas", methods=["POST"])
def api_agregar_venta():
    data = request.get_json(force=True, silent=True) or {}
    try:
        agregar_venta(data)

        def _post_to_gas(payload):
            try:
                gas_url = os.environ.get("GAS_WEBAPP_URL", "").strip()
                if not gas_url:
                    try:
                        from config import GOOGLE_APPS_SCRIPT
                        gas_url = (GOOGLE_APPS_SCRIPT.get("GAS_URL") or "").strip()
                    except Exception:
                        gas_url = ""
                if not gas_url:
                    return
                headers = {"Content-Type": "application/json"}
                body = {"action": "submit", "venta": payload}
                requests.post(gas_url, json=body, headers=headers, timeout=5)
            except Exception:
                pass

        venta_payload = {
            "fecha": data.get("fecha", ""),
            "notas": data.get("notas", ""),
            "categoria": data.get("categoria", ""),
            "tipo": data.get("tipo", ""),
            # Link de Cloudinary ya viene en 'fotografia' desde /api/upload
            "fotografia": data.get("fotografia", ""),
            # Para Sheets:
            # F Precio (base), G Descuento, H Precio Final (unitario)
            "precio": data.get("precio_base", data.get("precio", 0)),
            "descuento": data.get("descuento", ""),
            "precioFinal": data.get("precio_final", data.get("precio", 0)),
            "unidades": data.get("unidades", 0),
            "pago": data.get("pago", ""),
        }
        threading.Thread(target=_post_to_gas, args=(venta_payload,), daemon=True).start()
        return jsonify({"message": "Venta agregada"}), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/ventas/<int:index>", methods=["PUT"])
def api_actualizar_venta(index: int):
    data = request.get_json(force=True, silent=True) or {}
    try:
        actualizar_venta(index, data)
        return jsonify({"message": "Venta actualizada"}), 200
    except IndexError:
        return jsonify({"error": "Índice fuera de rango"}), 404
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/ventas/<int:index>", methods=["DELETE"])
def api_eliminar_venta(index: int):
    try:
        eliminar_venta(index)
        return jsonify({"message": "Venta eliminada"}), 200
    except IndexError:
        return jsonify({"error": "Índice fuera de rango"}), 404

@app.route("/api/ventas/<int:index>/reopen-preticket", methods=["POST"])
def api_reopen_preticket(index: int):
    try:
        data = reabrir_venta_como_preticket(index)
        return jsonify({"success": True, **data}), 200
    except IndexError:
        return jsonify({"success": False, "error": "INDICE_FUERA_DE_RANGO"}), 404
    except ValueError as e:
        return jsonify({"success": False, "error": str(e)}), 400
    except Exception as e:
        return jsonify({"success": False, "error": "UNEXPECTED", "mensaje": str(e)}), 500

@app.route("/api/ventas", methods=["DELETE"])
def api_eliminar_todas_las_ventas():
    """Vacía todas las ventas en memoria (confirmado desde el front)"""
    try:
        limpiar_ventas()
        return jsonify({"message": "Todas las ventas fueron eliminadas"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/historial", methods=["GET"])
@login_required
def api_listar_historial():
    return jsonify(listar_historial())

@app.route("/api/historial/export", methods=["POST"])
@login_required
def api_exportar_historial():
    try:
        result = exportar_ventas_a_historial()
        status = 200 if result.get("success") else 400
        return jsonify(result), status
    except Exception as e:
        return jsonify({"success": False, "error": "UNEXPECTED", "mensaje": str(e)}), 500

@app.route("/api/pretickets/<cliente>/items/<int:index>", methods=["PUT"])
def api_actualizar_item_preticket(cliente: str, index: int):
    data = request.get_json(force=True, silent=True) or {}
    try:
        updated = actualizar_item_preticket(cliente, index, data)
        return jsonify({"success": True, "item": updated}), 200
    except KeyError:
        return jsonify({"success": False, "error": "CLIENTE_NO_ENCONTRADO"}), 404
    except IndexError:
        return jsonify({"success": False, "error": "INDICE_FUERA_DE_RANGO"}), 400
    except ValueError as e:
        return jsonify({"success": False, "error": str(e)}), 400
    except Exception as e:
        return jsonify({"success": False, "error": "UNEXPECTED", "mensaje": str(e)}), 500

# Pre-tickets (carrito por cliente)
@app.route("/api/pretickets", methods=["GET"])
def api_listar_pretickets():
    return jsonify(listar_pretickets())

@app.route("/api/pretickets/<cliente>/items", methods=["POST"])
def api_agregar_item_preticket(cliente: str):
    data = request.get_json(force=True, silent=True) or {}
    try:
        index = agregar_item_preticket(cliente, data)
        return jsonify({"success": True, "index": index}), 201
    except ValueError as e:
        return jsonify({"success": False, "error": str(e)}), 400

@app.route("/api/pretickets/<cliente>/items/<int:index>", methods=["DELETE"])
def api_eliminar_item_preticket(cliente: str, index: int):
    try:
        eliminar_item_preticket(cliente, index)
        return jsonify({"success": True}), 200
    except KeyError:
        return jsonify({"success": False, "error": "CLIENTE_NO_ENCONTRADO"}), 404
    except IndexError:
        return jsonify({"success": False, "error": "INDICE_FUERA_DE_RANGO"}), 400
    except Exception as e:
        return jsonify({"success": False, "error": "UNEXPECTED", "mensaje": str(e)}), 500

@app.route("/api/pretickets/<cliente>", methods=["DELETE"])
def api_limpiar_preticket(cliente: str):
    try:
        limpiar_preticket(cliente)
        return jsonify({"success": True}), 200
    except Exception as e:
        return jsonify({"success": False, "error": "UNEXPECTED", "mensaje": str(e)}), 500

@app.route("/api/pretickets/<cliente>/confirm", methods=["POST"])
def api_confirmar_preticket(cliente: str):
    data = request.get_json(force=True, silent=True) or {}
    try:
        venta = confirmar_preticket_como_venta(cliente, data)
        return jsonify({"success": True, "venta": venta}), 201
    except ValueError as e:
        return jsonify({"success": False, "error": str(e)}), 400
    except Exception as e:
        return jsonify({"success": False, "error": "UNEXPECTED", "mensaje": str(e)}), 500

@app.route("/api/historial/item/<int:item_id>", methods=["DELETE"])
@login_required
def api_eliminar_historial_item_db(item_id: int):
    try:
        eliminar_historial_item_db(item_id)
        return jsonify({"success": True, "message": "Elemento eliminado en DB"}), 200
    except Exception as e:
        return jsonify({"success": False, "error": "UNEXPECTED", "mensaje": str(e)}), 500


@app.route("/api/historial/<fecha>/<int:index>", methods=["DELETE"])
@login_required
def api_eliminar_historial_item(fecha: str, index: int):
    try:
        eliminar_historial_item(fecha, index)
        return jsonify({"success": True, "message": "Elemento eliminado"}), 200
    except KeyError:
        return jsonify({"success": False, "error": "FECHA_NO_ENCONTRADA"}), 404
    except IndexError:
        return jsonify({"success": False, "error": "INDICE_FUERA_DE_RANGO"}), 400
    except Exception as e:
        return jsonify({"success": False, "error": "UNEXPECTED", "mensaje": str(e)}), 500

# Upload de imágenes (Fotografia)
@app.route("/api/upload", methods=["POST"])
@login_required
def api_upload():
    try:
        cloudinary = importlib.import_module('cloudinary')
        uploader = importlib.import_module('cloudinary.uploader')
        file = request.files.get('fotografia') or request.files.get('file')
        if not file or file.filename == '':
            return jsonify({"error": "No se recibió archivo"}), 400
        # Verificar configuración de Cloudinary (usa CLOUDINARY_URL en entorno)
        if not os.environ.get('CLOUDINARY_URL'):
            return jsonify({"error": "CLOUDINARY_URL no configurado en el entorno"}), 500
        # Subir a Cloudinary
        result = uploader.upload(
            file,
            folder="mwaccesorios",
            resource_type="image"
        )
        secure_url = result.get("secure_url")
        if not secure_url:
            return jsonify({"error": "Fallo al subir a Cloudinary"}), 500
        return jsonify({"url": secure_url}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Deshabilitado por seguridad: Exportar a Google Sheets
@app.route("/api/exportar", methods=["POST"])
def api_exportar():
    return jsonify({"success": False, "error": "EXPORT_DISABLED", "mensaje": "Exportación deshabilitada por seguridad"}), 403

@app.route("/api/exportar_prueba", methods=["POST"])
def api_exportar_prueba():
    return jsonify({"success": False, "error": "EXPORT_DISABLED"}), 403

# Redirigir a Google Sheets
@app.route("/download/sheets", methods=["GET"])
def download_sheets():
    abort(404)

@app.route("/api/catalogo", methods=["GET"])
def api_catalogo():
    return jsonify({"success": False, "error": "CATALOG_DISABLED"}), 403

@app.route("/api/rangos", methods=["GET"])
def api_rangos():
    return jsonify({"success": False, "rangos": {}}), 200

# Categorías y tipos desde Google Sheets (hoja 'Categorias')
@app.route("/api/categorias", methods=["GET"])
@login_required
def api_categorias():
    try:
        # ID y gid provistos por el usuario
        sheet_id = "1yGcWVzdZzfSREiv39l4THat_8qsOF1cfQZaxdAQbBRw"
        gid = "917280651"  # Hoja 'Categorias'
        urls = [
            f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}",
            f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?gid={gid}&format=csv",
            f"https://docs.google.com/spreadsheets/d/{sheet_id}/gviz/tq?tqx=out:csv&gid={gid}",
        ]
        r = None
        headers_req = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}
        last_err = None
        for u in urls:
            try:
                r = requests.get(u, headers=headers_req, timeout=15, allow_redirects=True)
                r.raise_for_status()
                # Evitar respuestas HTML de error disfrazadas
                if r.headers.get('Content-Type','').lower().startswith('text/csv') or r.text.count(',') > 0:
                    break
            except Exception as e:
                last_err = e
                r = None
        if r is None:
            raise last_err or RuntimeError("No se pudo descargar CSV de Google Sheets")
        text = r.text.lstrip('\ufeff')  # quitar BOM si existe
        f = io.StringIO(text)
        reader = list(csv.reader(f))

        categorias: dict[str, list[str]] = {}

        if not reader:
            return jsonify({"success": True, "categorias": categorias})

        # Tomar encabezados de columnas D..H (índices 3..7) como categorías
        header = reader[0]
        col_indexes = [3, 4, 5, 6, 7]
        headers = {}
        for idx in col_indexes:
            if idx < len(header):
                h = (header[idx] or '').strip()
                if h:
                    headers[idx] = h
                    categorias.setdefault(h, [])

        # Recorrer filas siguientes y asociar cada celda debajo del header como tipo
        for row in reader[1:]:
            if not row:
                continue
            for idx, cat_name in headers.items():
                if idx < len(row):
                    val = (row[idx] or '').strip()
                    if val and val not in categorias[cat_name]:
                        categorias[cat_name].append(val)

        return jsonify({"success": True, "categorias": categorias})
    except Exception as e:
        msg = str(e)
        # Mensaje más claro si es 401/403 por permisos
        if isinstance(e, requests.HTTPError):
            status = e.response.status_code if e.response is not None else 500
            if status in (401, 403):
                return jsonify({
                    "success": False,
                    "error": msg,
                    "hint": "Verificá que la hoja sea pública (Anyone with the link - Viewer) o publica el CSV (File > Publish to the web)."
                }), 500
        return jsonify({"success": False, "error": msg}), 500

@app.route("/api/sheets/status", methods=["GET"])
def api_sheets_status():
    return jsonify({"success": False, "error": "SHEETS_DISABLED"}), 403

# Endpoint de verificación rápida
@app.route("/test_sheets", methods=["GET"])
def test_sheets():
    return jsonify({"status": "disabled"}), 403

# Endpoint de verificación de Apps Script
@app.route("/test_gas", methods=["GET"])
def test_gas():
    return jsonify({"status": "disabled"}), 403

if __name__ == "__main__":
    app.run(debug=True)
