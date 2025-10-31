/**
 * Web App de Google Apps Script para recibir ventas y escribirlas en una hoja.
 * Publicar como Web App: Implementar → Implementar implementación → Tipo: Aplicación web
 *   - Ejecutar como: Tu cuenta
 *   - Quién tiene acceso: Cualquiera con el enlace (o usuarios específicos)
 *
 * Seguridad (opcional): define la propiedad de script 'API_KEY' y envía 'X-API-Key' en el header.
 */

function doPost(e) {
  try {
    var body = e.postData && e.postData.contents ? e.postData.contents : null;
    if (!body) return _json({ success: false, error: 'EMPTY_BODY' }, 400);

    var data = JSON.parse(body);
    var action = data.action || '';

    // Validar API_KEY si está configurada
    var props = PropertiesService.getScriptProperties();
    var requiredKey = props.getProperty('API_KEY');
    if (requiredKey) {
      var headers = e.headers || {};
      var sentKey = headers['X-API-Key'] || headers['x-api-key'] || '';
      if (sentKey !== requiredKey) {
        return _json({ success: false, error: 'UNAUTHORIZED' }, 401);
      }
    }

    if (action === 'status') {
      var ss = _openSpreadsheet_();
      var ws = _getWorksheet_(ss);
      return _json({ success: true, title: ss.getName(), sheet: ws.getName(), lastRow: ws.getLastRow() });
    }

    if (action === 'appendRows') {
      var rows = data.rows || [];
      if (!rows.length) return _json({ success: false, error: 'NO_ROWS' }, 400);

      console.log('Recibidas ' + rows.length + ' filas para agregar');
      console.log('Primera fila: ' + JSON.stringify(rows[0]));

      var ss = _openSpreadsheet_();
      var ws = _getWorksheet_(ss);

      console.log('Hoja de trabajo: ' + ws.getName());
      console.log('Última fila antes: ' + ws.getLastRow());

      // Calcular siguiente fila después de la última con datos (simple y efectivo)
      var startRow = _getFirstEmptyRow_(ws); // deja fila 1 para headers
      var numRows = rows.length;
      var numCols = rows[0].length;
      
      console.log('Escribiendo en fila: ' + startRow + ', filas: ' + numRows + ', columnas: ' + numCols);
      
      var range = ws.getRange(startRow, 1, numRows, numCols);
      range.setValues(rows);

      console.log('Última fila después: ' + ws.getLastRow());
      return _json({ success: true, appended: numRows, startRow: startRow });
    }

    // Nueva acción: recibir una sola venta y escribirla como una fila (A-J)
    if (action === 'submit') {
      var venta = data.venta || data || {};
      // Campos esperados
      var fecha = venta.fecha || '';
      var notas = venta.notas || '';
      var categoria = venta.categoria || '';
      var tipo = venta.tipo || venta.tipoProducto || '';
      var foto = venta.fotografia || venta.foto || venta.linkFotografia || '';
      var precio = Number(venta.precio || venta.precioUnitario || 0);
      var descuento = (venta.descuento !== undefined && venta.descuento !== null && String(venta.descuento) !== '') ? Number(venta.descuento) : '';
      var precioFinal = (venta.precioFinal !== undefined && venta.precioFinal !== null && String(venta.precioFinal) !== '') ? Number(venta.precioFinal) : '';
      var unidades = Number(venta.unidades || 0);
      var pago = venta.pago || '';

      // Si no vino precioFinal pero sí precio/desc, calcularlo
      if (precioFinal === '' && !isNaN(precio)) {
        var d = (!isNaN(Number(descuento)) ? Math.max(0, Math.min(100, Number(descuento))) : 0);
        precioFinal = +(precio * (1 - d / 100)).toFixed(2);
      }

      var ss = _openSpreadsheet_();
      var ws = _getWorksheet_(ss);

      // Orden A-J
      var row = [
        fecha,        // A Fecha
        notas,        // B Notas
        categoria,    // C Categoria
        tipo,         // D Tipo de Producto
        foto,         // E Link de Fotografia
        precio,       // F Precio (unitario base)
        descuento,    // G Descuento (%)
        precioFinal,  // H Precio Final (unitario)
        unidades,     // I Unidades
        pago          // J Forma de pago
      ];

      var startRow = _getFirstEmptyRow_(ws);
      ws.getRange(startRow, 1, 1, row.length).setValues([row]);
      return _json({ success: true, appended: 1, startRow: startRow });
    }

    return _json({ success: false, error: 'UNKNOWN_ACTION' }, 400);
  } catch (err) {
    return _json({ success: false, error: String(err) }, 500);
  }
}

function _openSpreadsheet_() {
  // Configurar por ID o URL en Propiedades del Script: SHEET_ID y SHEET_NAME
  var props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty('SHEET_ID');
  if (!sheetId) throw new Error('SHEET_ID no configurado en propiedades del script');
  return SpreadsheetApp.openById(sheetId);
}

function _getWorksheet_(ss) {
  var props = PropertiesService.getScriptProperties();
  var sheetName = props.getProperty('SHEET_NAME') || 'Registro Diario';
  var ws = ss.getSheetByName(sheetName);
  if (!ws) {
    console.log('Hoja "' + sheetName + '" no encontrada, creando...');
    ws = ss.insertSheet(sheetName);
  }
  
  // Asegurar que los headers estén configurados
  _setupHeaders_(ws);
  return ws;
}

function _json(obj, code) {
  var output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  if (code) output.setContent(JSON.stringify(Object.assign({ code: code }, obj)));
  return output;
}

// Retorna la siguiente fila después de la última con contenido
function _getFirstEmptyRow_(ws) {
  var lastRow = ws.getLastRow();
  return lastRow < 2 ? 2 : lastRow + 1;
}

// Encuentra la siguiente fila realmente vacía (ignora filas con solo formato/espacios)
function getNextSmartRow_(ws) {
  var lastRow = ws.getLastRow();
  if (lastRow < 2) return 2; // reserva fila 1 para headers

  // Lee un bloque razonable hacia arriba para detectar la última fila con datos significativos
  var start = Math.max(2, lastRow - 999); // hasta 1000 filas hacia arriba
  var numRows = lastRow - start + 1;
  var values = ws.getRange(start, 1, numRows, ws.getLastColumn()).getValues();

  for (var i = values.length - 1; i >= 0; i--) {
    var row = values[i];
    if (_rowHasMeaningfulData_(row)) {
      return start + i + 1; // siguiente fila después de la última con datos reales
    }
  }
  return 2;
}

function _rowHasMeaningfulData_(row) {
  for (var j = 0; j < row.length; j++) {
    var cell = row[j];
    if (cell === null || cell === undefined) continue;
    var s = String(cell).trim();
    if (s && ['-', 'N/A', 'n/a', 'NULL', 'null', 'None', 'none', '$0,00', '$0.00', '0', '0.00', '0,00'].indexOf(s) === -1) {
      return true;
    }
  }
  return false;
}

// Configurar headers con los campos requeridos
function _setupHeaders_(ws) {
  // Verificar si ya tiene headers
  var firstRow = ws.getRange(1, 1, 1, 10).getValues()[0];
  var hasHeaders = firstRow.some(function(cell) { 
    return cell && String(cell).trim() !== ''; 
  });
  
  if (!hasHeaders) {
    // Configurar headers según los campos requeridos
    var headers = [
      'Fecha',           // A
      'Notas',           // B  
      'Categoria',      // C
      'Tipo de Producto', // D
      'Link de Fotografia', // E
      'Precio',          // F
      'Descuento',       // G
      'Precio Final',    // H
      'Unidades',        // I
      'Forma de pago'    // J
    ];
    
    ws.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    // Formatear headers
    var headerRange = ws.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#4285f4');
    headerRange.setFontColor('white');
  }
}

// Soporte GET para ver estado desde el navegador (opcional)
function doGet(e) {
  try {
    // Validar API_KEY en GET si existe (por query param apiKey)
    var props = PropertiesService.getScriptProperties();
    var cfgKey = (typeof CONFIG !== 'undefined' && CONFIG.API_KEY) ? CONFIG.API_KEY : '';
    var requiredKey = props.getProperty('API_KEY') || cfgKey || '';
    if (requiredKey) {
      var params = (e && e.parameter) ? e.parameter : {};
      var sentKey = params['apiKey'] || params['apikey'] || '';
      if (sentKey !== requiredKey) {
        return _json({ success: false, error: 'UNAUTHORIZED' }, 401);
      }
    }

    var action = (e && e.parameter && e.parameter.action) ? String(e.parameter.action) : '';
    if (action === 'categories') {
      var cats = _readCategories_();
      return _json({ success: true, categories: cats });
    }

    var ss = _openSpreadsheet_();
    var ws = _getWorksheet_(ss);
    return _json({
      success: true,
      method: 'GET',
      hint: 'Usa POST con action=submit o action=appendRows para escribir filas',
      title: ss.getName(),
      sheet: ws.getName(),
      lastRow: ws.getLastRow()
    });
  } catch (err) {
    return _json({ success: false, error: String(err) }, 500);
  }
}

// Lee la hoja "Categorias" columnas A (Categoria) y B (Tipo de Producto)
function _readCategories_() {
  var props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty('SHEET_ID');
  if (!sheetId) throw new Error('SHEET_ID no configurado en propiedades del script');
  var ss = SpreadsheetApp.openById(sheetId);
  var ws = ss.getSheetByName('Categorias');
  if (!ws) return [];
  var lastRow = ws.getLastRow();
  if (lastRow < 2) return [];
  var values = ws.getRange(2, 1, lastRow - 1, 2).getValues(); // desde fila 2, columnas A-B
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var cat = String(values[i][0] || '').trim();
    var tipo = String(values[i][1] || '').trim();
    if (cat || tipo) out.push({ categoria: cat, tipo: tipo });
  }
  return out;
}


