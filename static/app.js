    function formatearFechaDisplay(iso) {
        if (!iso) return '';
        const [y, m, d] = iso.split('-');
        if (!y || !m || !d) return iso;
        return `${d}/${m}/${y}`;
    }
document.addEventListener('DOMContentLoaded', () => {
    const today = new Date().toISOString().split('T')[0];
    console.log('Setting today date:', today);
    
    // Variables globales
    // Catálogo eliminado en esta versión
    let productosPorID = {}; 
    let editIndex = null;
    let ventasCache = [];
    let lastAddedIndex = -1; // Para trackear el último elemento agregado
    let rangosPrecios = {}; // No se usa

    // ======== ELEMENTOS DOM =========
    const form = document.getElementById('ventaForm');
    const inputCategoria = document.getElementById('categoria');
    const categoriaSelect = document.getElementById('categoria');
    const tipoPP = document.getElementById('tipoPP');
    const tipoIND = document.getElementById('tipoIND');
    const inputFoto = document.getElementById('fotografia');
    const inputPrecio = document.getElementById('precio');
    const inputUnidades = document.getElementById('unidades');
    const inputPrecioFinal = document.getElementById('precioFinal');
    const inputPago = document.querySelector('input[name="pago"]:checked');
    const inputNotas = document.getElementById('notas');
    const fechaField = document.getElementById('fecha');
    const addBtn = document.getElementById('addBtn');
    const resetBtn = document.getElementById('resetBtn');
    const exportBtn = document.getElementById('exportBtn');
    const exportHistoryBtn = document.getElementById('exportHistoryBtn');
    const downloadLink = document.getElementById('downloadLink');
    const ventasTable = document.getElementById('ventasTable');
    const ventasBody = document.getElementById('ventasBody');
    const totalVentas = document.getElementById('totalVentas');
    const inputDescuento = document.getElementById('descuento');
    const descuentoGroup = document.getElementById('descuentoGroup');
    const precioGroup = document.getElementById('precioGroup');
    const unidadesGroup = document.getElementById('unidadesGroup');
    const precioFinalGroup = document.getElementById('precioFinalGroup');
    const sidebarClock = document.getElementById('sidebarClock');
    const sidebarClockDate = document.getElementById('sidebarClockDate');
    const sidebarClockTime = document.getElementById('sidebarClockTime');
    // Tabs y tarjeta
    const tabVenta = document.getElementById('tabVenta');
    const tabCambio = document.getElementById('tabCambio');
    const ventaFormCard = document.getElementById('ventaFormCard');
    const formTitle = document.getElementById('formTitle');
    const sidebarPanel = document.getElementById('sidebarPanel');
    const openSidebarBtn = document.getElementById('openSidebarBtn');
    const closeSidebarBtn = document.getElementById('closeSidebarBtn');
    const sidebarOverlay = document.getElementById('sidebarOverlay');

    // Estado de pestaña actual
    let isCambio = false;
    let precioFinalTouched = false; // si el usuario editó manualmente precioFinal

    const NOTAS_PLACEHOLDER_VENTA = 'Detalles adicionales sobre la venta...';
    const NOTAS_PLACEHOLDER_CAMBIO = 'CAMBIO - ';

    function aplicarModo() {
        if (!ventaFormCard) return;
        // Estilos de pestañas
        if (isCambio) {
            tabVenta?.classList.remove('bg-gray-100');
            tabCambio?.classList.add('bg-red-100');
            tabCambio?.classList.add('text-red-700');
            tabCambio?.classList.remove('hover:bg-red-50');
            // Marco rojo/bordo
            ventaFormCard.classList.add('border-2', 'border-red-700', 'ring-2', 'ring-red-100');
            // Placeholder de notas
            if (inputNotas) inputNotas.placeholder = NOTAS_PLACEHOLDER_CAMBIO;
            // Escribir valor por defecto en notas si no existe o no empieza con el prefijo
            if (inputNotas && (!inputNotas.value || !inputNotas.value.startsWith(NOTAS_PLACEHOLDER_CAMBIO))) {
                inputNotas.value = NOTAS_PLACEHOLDER_CAMBIO;
            }
            // Ocultar descuento y precio final en Cambios y limpiar su valor
            if (descuentoGroup) descuentoGroup.classList.add('hidden');
            if (inputDescuento) inputDescuento.value = '';
            if (precioFinalGroup) precioFinalGroup.classList.add('hidden');
            // En Cambios: precioFinal = precio (si no fue tocado manualmente)
            if (!precioFinalTouched) {
                if (inputPrecio && inputPrecio.value !== '') {
                    inputPrecioFinal.value = inputPrecio.value;
                } else {
                    inputPrecioFinal.value = '';
                }
            }
            // Título del formulario
            if (formTitle) formTitle.textContent = 'Cambio de Venta';
        } else {
            tabCambio?.classList.remove('bg-red-100');
            tabCambio?.classList.add('hover:bg-red-50');
            tabVenta?.classList.add('bg-gray-100');
            // Quitar marco rojo/bordo
            ventaFormCard.classList.remove('border-2', 'border-red-700', 'ring-2', 'ring-red-100');
            // Placeholder de notas
            if (inputNotas) inputNotas.placeholder = NOTAS_PLACEHOLDER_VENTA;
            // Si el valor era exactamente el prefijo automático, limpiar al volver a Venta
            if (inputNotas && inputNotas.value === NOTAS_PLACEHOLDER_CAMBIO) {
                inputNotas.value = '';
            }
            // Mostrar descuento y precio final en Ventas
            if (descuentoGroup) descuentoGroup.classList.remove('hidden');
            if (precioFinalGroup) precioFinalGroup.classList.remove('hidden');
            // Recalcular precio final a partir de descuento si no fue tocado manual
            recalcularPrecioFinalSiAuto();
            // Título del formulario
            if (formTitle) formTitle.textContent = 'Registro de Venta';
        }
    }

    // Eventos de pestañas
    tabVenta?.addEventListener('click', () => { isCambio = false; aplicarModo(); });
    tabCambio?.addEventListener('click', () => { isCambio = true; aplicarModo(); });
    
    // Configurar fecha inicial
    if (fechaField) {
        fechaField.value = today;
        console.log('Date field set to:', fechaField.value);
    }
    // Aplicar estado inicial de pestañas/placeholder/borde
    aplicarModo();

    function openSidebar() {
        if (!sidebarPanel) return;
        sidebarPanel.classList.remove('hidden');
        sidebarPanel.classList.remove('-translate-x-full');
        if (sidebarOverlay) sidebarOverlay.classList.remove('hidden');
    }
    function closeSidebar() {
        if (!sidebarPanel) return;
        sidebarPanel.classList.add('-translate-x-full');
        if (sidebarOverlay) sidebarOverlay.classList.add('hidden');
    }
    if (openSidebarBtn) openSidebarBtn.addEventListener('click', openSidebar);
    if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeSidebar);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSidebar(); });

    // ======== RELOJ LATERAL ========
    function updateSidebarClock() {
        if (!sidebarClock) return;
        const now = new Date();
        const weekday = now.toLocaleDateString('es-AR', { weekday: 'long' });
        const day = now.toLocaleDateString('es-AR', { day: '2-digit' });
        const month = now.toLocaleDateString('es-AR', { month: 'long' });
        const diaCap = weekday.charAt(0).toUpperCase() + weekday.slice(1);
        const mesCap = month.charAt(0).toUpperCase() + month.slice(1);
        const fecha = `${diaCap}, ${day} de ${mesCap}`;
        const hora = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        if (sidebarClockDate) sidebarClockDate.textContent = fecha;
        if (sidebarClockTime) sidebarClockTime.textContent = hora;
    }
    updateSidebarClock();
    setInterval(updateSidebarClock, 1000);

    // ======== EVENTOS =========
    form.addEventListener('submit', handleSubmit);
    addBtn.addEventListener('click', handleSubmit);
    resetBtn.addEventListener('click', resetForm);
    if (exportBtn) exportBtn.addEventListener('click', exportarExcel);
    if (exportHistoryBtn) {
        exportHistoryBtn.addEventListener('click', async () => {
            try {
                const confirmado = await confirmarAccionJSON({
                    titulo: 'Exportar ventas del día',
                    mensaje: 'Esta acción moverá todas las ventas actuales al historial. ¿Deseas continuar?',
                    confirmarTexto: 'Exportar',
                    cancelarTexto: 'Cancelar'
                });
                if (!confirmado) return;
                exportHistoryBtn.disabled = true;
                const oldHtml = exportHistoryBtn.innerHTML;
                exportHistoryBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Exportando...';

                const res = await fetch('/api/historial/export', { method: 'POST' });
                const data = await res.json();
                if (!res.ok || !data.success) {
                    throw new Error(data.mensaje || data.error || 'Error al exportar');
                }
                
                // Mostrar notificación simple (sin mencionar Google Sheets)
                mostrarNotificacion(data.mensaje, 'success');
                window.location.href = '/historial';
            } catch (e) {
                mostrarNotificacion('❌ ' + e.message, 'error');
            } finally {
                exportHistoryBtn.disabled = false;
                exportHistoryBtn.innerHTML = '<i class="fas fa-file-export mr-2"></i> Exportar Ventas';
            }
        });
    }
    const fotoFileName = document.getElementById('fotoFileName');
    if (inputFoto) {
        inputFoto.addEventListener('change', () => {
            const file = inputFoto.files && inputFoto.files[0];
            if (fotoFileName) {
                fotoFileName.textContent = file ? file.name : 'Ningún archivo seleccionado';
                const cls = ['underline', 'text-green-700', 'decoration-green-500', 'decoration-2', 'underline-offset-2'];
                if (file) {
                    fotoFileName.classList.add(...cls);
                    if (typeof mostrarNotificacion === 'function') {
                        mostrarNotificacion('Imagen Subida', 'success');
                    }
                } else {
                    fotoFileName.classList.remove(...cls);
                }
            }
        });
    }

    // Recalcular Precio Final en tiempo real si no fue editado manualmente
    if (inputPrecio) inputPrecio.addEventListener('input', () => { precioFinalTouched = false; recalcularPrecioFinalSiAuto(); });
    if (inputDescuento) inputDescuento.addEventListener('input', () => {
        // Limitar en tiempo real entre 0 y 100
        const raw = inputDescuento.value;
        if (raw !== '') {
            let n = parseFloat(raw);
            if (isNaN(n)) {
                inputDescuento.value = '';
            } else {
                n = Math.max(0, Math.min(100, Math.round(n)));
                inputDescuento.value = String(n);
            }
        }
        if (!isCambio) {
            if (precioFinalTouched) {
                // Si el usuario fijó manualmente el Precio Final, ajustamos el Precio base
                recalcularPrecioBaseDesdeFinal();
            } else {
                // Si el PF no fue tocado, recalculamos PF automáticamente desde el Precio base
                recalcularPrecioFinalSiAuto();
            }
        }
    });
    if (inputPrecioFinal) inputPrecioFinal.addEventListener('input', () => {
        precioFinalTouched = true;
        // Al editar Precio Final, recalcular Precio base desde el descuento vigente
        recalcularPrecioBaseDesdeFinal();
    });

    // Catálogo eliminado: no hay dropdown de IDs

    // ======== CARGA INICIAL =========
    console.log('Iniciando carga inicial...');
    cargarVentas().catch(error => {
        console.error('Error en carga inicial:', error);
        mostrarNotificacion(`Error en carga inicial: ${error.message}`, 'error');
    });

    async function cargarRangos() { rangosPrecios = {}; }

    // calcularPlaceholderRango eliminado

    function setHelper(msg, ok) { /* sin uso */ }

    function resetForm() {
        form.reset();
        if (fechaField) {
            fechaField.value = today;
        }
        // Limpiar nuevos campos
        if (inputCategoria) inputCategoria.value = '';
        if (inputTipo) inputTipo.value = '';
        if (inputFoto) inputFoto.value = '';
        if (inputDescuento) inputDescuento.value = '';
        if (inputPrecioFinal) inputPrecioFinal.value = '';
        precioFinalTouched = false;
        editIndex = null;
        setHelper('Formulario limpiado.', true);
        if (inputCategoria) inputCategoria.focus();
        if (fotoFileName) fotoFileName.textContent = 'Ningún archivo seleccionado';
        // Ajustar notas según modo actual
        if (inputNotas) {
            if (isCambio) {
                inputNotas.value = NOTAS_PLACEHOLDER_CAMBIO;
                inputNotas.placeholder = NOTAS_PLACEHOLDER_CAMBIO;
            } else {
                inputNotas.value = '';
                inputNotas.placeholder = NOTAS_PLACEHOLDER_VENTA;
            }
        }
        if (fotoFileName) {
            fotoFileName.classList.remove('underline', 'text-green-700', 'decoration-green-500', 'decoration-2', 'underline-offset-2');
        }
    }

    async function exportarExcel() {
        try {
            exportBtn.disabled = true;
            exportBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Exportando...';
            
            await fetch('/api/exportar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
        } catch (error) {
            alert('ERROR AL EXPORTAR');
        } finally {
            exportBtn.disabled = false;
            exportBtn.innerHTML = '<i class="fas fa-file-excel mr-2"></i> Exportar a Google Sheets';
        }
    }

    // ======== API (ventas) =========
    async function cargarVentas() {
        const res = await fetch('/api/ventas');
        ventasCache = await res.json();
        actualizarTabla();
        actualizarEstadisticas();
        actualizarContador();
    }

    async function handleSubmit(event) {
        event.preventDefault(); // Evitar que el formulario se envíe de forma tradicional
        console.log('Intentando agregar/actualizar venta...');
        
        // Validar formulario
        if (!form.checkValidity()) {
            console.log('Formulario no válido');
            form.reportValidity();
            return;
        }

        // Obtener valores del formulario
        const fecha = document.getElementById('fecha').value;
        const categoria = categoriaSelect ? categoriaSelect.value : document.getElementById('categoria')?.value?.trim();
        const tipo = (() => {
            if (!categoriaSelect) return '';
            if (categoriaSelect.value === 'Indumentaria') {
                return (tipoIND?.value || '').trim();
            }
            return (tipoPP?.value || '').trim();
        })();
        const precioValue = document.getElementById('precio').value;
        const unidadesValue = document.getElementById('unidades').value;
        const pagoElement = document.querySelector('input[name="pago"]:checked');
        const notas = document.getElementById('notas').value;

        console.log('Valores del formulario:', { fecha, categoria, tipo, precioValue, unidadesValue, pagoElement, notas });

        // Validaciones
        if (!fecha) {
            mostrarNotificacion('❌ La fecha es requerida', 'error');
            return;
        }

        if (!categoria) { mostrarNotificacion('❌ La categoría es requerida', 'error'); inputCategoria?.focus(); return; }
        if (!tipo) {
            mostrarNotificacion('❌ El tipo de producto es requerido', 'error');
            if (categoriaSelect && categoriaSelect.value === 'Indumentaria') { tipoIND?.focus(); } else { tipoPP?.focus(); }
            return;
        }

        if (!precioValue || isNaN(parseFloat(precioValue))) {
            mostrarNotificacion('❌ El precio es requerido y debe ser un número válido', 'error');
            document.getElementById('precio').focus();
            return;
        }

        if (!unidadesValue || isNaN(parseInt(unidadesValue))) {
            mostrarNotificacion('❌ Las unidades son requeridas y deben ser un número válido', 'error');
            document.getElementById('unidades').focus();
            return;
        }

        if (!pagoElement) {
            mostrarNotificacion('❌ Selecciona una forma de pago', 'error');
            return;
        }

        let precio = parseFloat(precioValue);
        let unidades = parseInt(unidadesValue);
        // Determinar precio unitario final a enviar: usar Precio Final si está, si no calcular a partir de descuento
        let precioFinalUnit = null;
        const descuentoPct = (() => {
            if (isCambio) return 0;
            if (inputDescuento && inputDescuento.value !== '') {
                const d = parseFloat(inputDescuento.value);
                if (!isNaN(d) && isFinite(d)) return Math.min(100, Math.max(0, d));
            }
            return 0;
        })();

        if (inputPrecioFinal && inputPrecioFinal.value !== '') {
            const pf = parseFloat(inputPrecioFinal.value);
            if (!isNaN(pf) && isFinite(pf)) {
                precioFinalUnit = pf;
            }
        }
        if (precioFinalUnit === null) {
            if (!isNaN(precio) && isFinite(precio)) {
                precioFinalUnit = +(precio * (1 - (descuentoPct / 100))).toFixed(2);
            } else {
                mostrarNotificacion('❌ El precio es inválido', 'error');
                document.getElementById('precio').focus();
                return;
            }
        }
        // Conservar precio base (descuentoPct ya fue calculado arriba)
        const precioBase = isNaN(parseFloat(precioValue)) ? '' : parseFloat(precioValue);
        // Usar precio final como precio unitario enviado al backend
        precio = precioFinalUnit;
        if (isCambio) {
            unidades = -Math.abs(unidades);
        }
        const pago = pagoElement.value;

        // Subir fotografía si corresponde; si estamos editando y no hay nueva, mantener la existente
        let fotoUrl = '';
        try {
            if (inputFoto && inputFoto.files && inputFoto.files[0]) {
                // Validaciones básicas de archivo (cliente)
                const file = inputFoto.files[0];
                const isImage = file.type && file.type.startsWith('image/');
                const maxBytes = 5 * 1024 * 1024; // 5MB
                if (!isImage) {
                    mostrarNotificacion('El archivo debe ser una imagen', 'error');
                    return;
                }
                if (file.size > maxBytes) {
                    mostrarNotificacion('La imagen supera 5MB', 'error');
                    return;
                }
                const fd = new FormData();
                fd.append('fotografia', inputFoto.files[0]);
                const upRes = await fetch('/api/upload', { method: 'POST', body: fd });
                const upData = await upRes.json();
                if (upRes.ok && upData.url) {
                    fotoUrl = upData.url;
                } else {
                    mostrarNotificacion('⚠️ No se pudo subir la fotografía, se guardará sin imagen', 'warning');
                }
            }
            // Si no hay nueva foto y estamos editando, conservar la existente
            if (!fotoUrl && editIndex !== null && ventasCache[editIndex] && ventasCache[editIndex].fotografia) {
                fotoUrl = ventasCache[editIndex].fotografia;
            }
        } catch (e) {
            console.warn('Error subiendo fotografía', e);
        }

        const venta = {
            fecha,
            categoria,
            tipo,
            fotografia: fotoUrl,
            // precio enviado al backend sigue siendo el unitario final
            precio,
            unidades,
            pago,
            notas,
            // Campos adicionales para exportación a Sheets
            precio_base: precioBase,
            descuento: descuentoPct,
            precio_final: precioFinalUnit
        };
        console.log('Venta a enviar:', venta);

        try {
            if (editIndex === null) {
                console.log('Agregando nueva venta...');
                const res = await fetch('/api/ventas', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(venta)
                });
                
                const data = await res.json();
                console.log('Respuesta del servidor:', data);
                
                if (!res.ok) {
                    throw new Error(data.error || `Error HTTP ${res.status}`);
                }
                
                // Marcar el índice del último elemento agregado
                lastAddedIndex = ventasCache.length;
                
                mostrarNotificacion('✅ ' + data.message, 'success');
            } else {
                console.log('Actualizando venta existente...');
                const res = await fetch(`/api/ventas/${editIndex}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(venta)
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Error al actualizar');
                mostrarNotificacion('✅ ' + data.message, 'success');
                salirDeEdicion();
            }

            // Recargar datos y resetear formulario
            await cargarVentas();
            form.reset();
            
            // Restablecer fecha a hoy
            const fechaField = document.getElementById('fecha');
            if (fechaField) {
                fechaField.value = today;
            }
            
            if (inputCategoria) inputCategoria.value = '';
            if (tipoPP) tipoPP.selectedIndex = 0;
            if (tipoIND) tipoIND.value = '';
            setHelper('✅ Venta agregada correctamente.', true);
            
            // Auto-scroll al último elemento agregado
            if (editIndex === null) {
                setTimeout(() => scrollToLastAdded(), 300);
            }
            
            // Focus en categoría para siguiente venta
            if (inputCategoria) inputCategoria.focus();
            
        } catch (err) {
            console.error('Error al procesar venta:', err);
            mostrarNotificacion(`❌ Error: ${err.message}`, 'error');
        }
    }

    // ======== AUTO-SCROLL AL ÚLTIMO ELEMENTO =========
    function scrollToLastAdded() {
        if (lastAddedIndex >= 0 && lastAddedIndex < ventasCache.length) {
            const tableContainer = document.querySelector('.overflow-x-auto');
            const lastRow = tableContainer.querySelector(`tbody tr:nth-child(${lastAddedIndex + 1})`);
            
            if (lastRow) {
                // Resaltar temporalmente la fila
                lastRow.classList.add('bg-yellow-100', 'border-2', 'border-yellow-400');
                
                // Scroll suave a la fila
                lastRow.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'center' 
                });
                
                // Remover el resaltado después de 3 segundos
                setTimeout(() => {
                    lastRow.classList.remove('bg-yellow-100', 'border-2', 'border-yellow-400');
                }, 3000);
            }
        }
    }

    function entrarEnEdicion(index) {
        editIndex = index;
        const v = ventasCache[index];
        document.getElementById('fecha').value = v.fecha;
        if (categoriaSelect) categoriaSelect.value = v.categoria || 'Produccion Propia';
        actualizarUIporCategoria();
        if (categoriaSelect && categoriaSelect.value === 'Indumentaria') {
            if (tipoIND) tipoIND.value = v.tipo || '';
        } else {
            // Intentar seleccionar opción coincidente; si no, dejar en 'Otro'
            if (tipoPP) {
                const opts = Array.from(tipoPP.options).map(o => o.value);
                tipoPP.value = opts.includes(v.tipo) ? v.tipo : 'Otro';
            }
        }
        document.getElementById('precio').value = v.precio;
        if (inputPrecioFinal) {
            inputPrecioFinal.value = v.precio; // el precio almacenado es el unitario final
            precioFinalTouched = true;
        }
        document.getElementById('unidades').value = v.unidades;
        document.querySelector(`input[name="pago"][value="${v.pago}"]`).checked = true;
        document.getElementById('notas').value = v.notas;
        addBtn.innerHTML = '<i class="fas fa-save mr-2"></i> Guardar Cambios';
        document.getElementById('ventaForm').scrollIntoView({ behavior: 'smooth' });
    }

    function salirDeEdicion() {
        editIndex = null;
        addBtn.innerHTML = '<i class="fas fa-plus-circle mr-2"></i> Agregar';
    }

    // ======== PRECIO FINAL: Cálculo automático ========
    function calcularPrecioFinalUnit() {
        const precioVal = parseFloat(inputPrecio?.value || '');
        if (isNaN(precioVal) || !isFinite(precioVal)) return '';
        if (isCambio) return precioVal.toFixed(2);
        const dStr = inputDescuento?.value || '';
        const d = parseFloat(dStr);
        const descuentoPct = (!isNaN(d) && isFinite(d)) ? Math.min(100, Math.max(0, d)) : 0;
        const pf = +(precioVal * (1 - (descuentoPct / 100))).toFixed(2);
        return pf.toFixed(2);
    }

    function recalcularPrecioFinalSiAuto() {
        if (!inputPrecioFinal) return;
        if (precioFinalTouched) return; // respetar edición manual
        const val = calcularPrecioFinalUnit();
        inputPrecioFinal.value = val;
    }

    // Recalcular Precio base a partir de Precio Final y Descuento actual
    function recalcularPrecioBaseDesdeFinal() {
        if (!inputPrecioFinal || !inputPrecio) return;
        const pfStr = inputPrecioFinal.value;
        const pf = parseFloat(pfStr);
        if (isNaN(pf) || !isFinite(pf)) return;
        // En Cambios, el descuento es 0 por definición
        const dStr = inputDescuento?.value || '';
        const dParsed = parseFloat(dStr);
        const d = (isCambio ? 0 : (!isNaN(dParsed) && isFinite(dParsed) ? Math.min(100, Math.max(0, dParsed)) : 0));
        const factor = 1 - (d / 100);
        const base = factor === 0 ? pf : +(pf / factor).toFixed(2);
        inputPrecio.value = isFinite(base) ? base : '';
    }

    // ======== UI por Categoria (Produccion Propia vs Indumentaria) ========
    function actualizarUIporCategoria() {
        if (!categoriaSelect) return;
        const isInd = categoriaSelect.value === 'Indumentaria';
        if (tipoPP) tipoPP.classList.toggle('hidden', isInd);
        if (tipoIND) tipoIND.classList.toggle('hidden', !isInd);
    }
    if (categoriaSelect) {
        actualizarUIporCategoria();
        categoriaSelect.addEventListener('change', () => {
            actualizarUIporCategoria();
        });
    }

    // Variables para el modal de confirmación
    let currentDeleteIndex = null;
    const confirmModal = document.getElementById('confirmModal');
    const confirmDeleteBtn = document.getElementById('confirmDelete');
    const confirmCancelBtn = document.getElementById('confirmCancel');
    const clearAllBtn = document.getElementById('clearAllBtn');

    // Configurar eventos del modal
    if (confirmDeleteBtn && confirmCancelBtn) {
        confirmDeleteBtn.addEventListener('click', async () => {
            if (currentDeleteIndex === null) return;
            
            // Mostrar carga
            confirmDeleteBtn.disabled = true;
            confirmDeleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Eliminando...';
            
            const index = currentDeleteIndex;
            const res = await fetch(`/api/ventas/${index}`, { method: 'DELETE' });
            const data = await res.json();
            
            // Restaurar botón
            confirmDeleteBtn.disabled = false;
            confirmDeleteBtn.innerHTML = 'Eliminar';
            confirmModal.classList.add('hidden');
            
            if (!res.ok) {
                mostrarNotificacion(data.error || 'Error al eliminar', 'error');
                return;
            }
            
            mostrarNotificacion('Venta eliminada correctamente', 'success');
            
            if (editIndex === index) {
                salirDeEdicion();
                form.reset();
                document.getElementById('fecha').value = today;
                inputNombre.value = '';
            }
            
            await cargarVentas();
        });
        
        confirmCancelBtn.addEventListener('click', () => {
            confirmModal.classList.add('hidden');
        });
    }

    // Vaciar todas las ventas con confirmación
    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', async () => {
            try {
                const confirmado = await confirmarAccionJSON({
                    titulo: '¿Vaciar todas las ventas?',
                    mensaje: 'Esta acción eliminará todas las ventas en memoria. No se puede deshacer.',
                    confirmarTexto: 'Sí, vaciar',
                    cancelarTexto: 'Cancelar'
                });
                if (!confirmado) return;

                clearAllBtn.disabled = true;
                clearAllBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Vaciando...';

                const res = await fetch('/api/ventas', { method: 'DELETE' });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Error al vaciar ventas');

                mostrarNotificacion('✅ ' + (data.message || 'Ventas vaciadas'), 'success');
                await cargarVentas();
            } catch (e) {
                mostrarNotificacion(`❌ ${e.message}`, 'error');
            } finally {
                clearAllBtn.disabled = false;
                clearAllBtn.innerHTML = '<i class="fas fa-trash mr-2"></i> Vaciar ventas';
            }
        });
    }

    // Pequeño helper de confirmación tipo JSON
    async function confirmarAccionJSON({ titulo, mensaje, confirmarTexto = 'Confirmar', cancelarTexto = 'Cancelar' }) {
        return new Promise((resolve) => {
            // Reutilizamos el modal existente con textos dinámicos
            const modal = document.getElementById('confirmModal');
            if (!modal) { resolve(confirm(mensaje)); return; }

            const titleEl = modal.querySelector('h3');
            const msgEl = modal.querySelector('p');
            const btnConfirm = document.getElementById('confirmDelete');
            const btnCancel = document.getElementById('confirmCancel');

            const oldTitle = titleEl.textContent;
            const oldMsg = msgEl.textContent;
            const oldConfirmText = btnConfirm.textContent;
            const oldCancelText = btnCancel.textContent;

            titleEl.textContent = titulo;
            msgEl.textContent = mensaje;
            btnConfirm.textContent = confirmarTexto;
            btnCancel.textContent = cancelarTexto;

            modal.classList.remove('hidden');

            const onConfirm = () => {
                cleanup();
                resolve(true);
            };
            const onCancel = () => {
                cleanup();
                resolve(false);
            };

            function cleanup() {
                modal.classList.add('hidden');
                btnConfirm.removeEventListener('click', onConfirm);
                btnCancel.removeEventListener('click', onCancel);
                // Restaurar textos originales
                titleEl.textContent = oldTitle;
                msgEl.textContent = oldMsg;
                btnConfirm.textContent = oldConfirmText;
                btnCancel.textContent = oldCancelText;
            }

            btnConfirm.addEventListener('click', onConfirm, { once: true });
            btnCancel.addEventListener('click', onCancel, { once: true });
        });
    }

    async function eliminarVenta(index) {
        currentDeleteIndex = index;
        confirmModal.classList.remove('hidden');
    }

    // ======== TABLA / ESTADISTICAS =========
    function actualizarTabla() {
        const tbody = document.getElementById('ventasBody');
        tbody.innerHTML = '';
        let totalGeneral = 0;

        ventasCache.forEach((venta, index) => {
            totalGeneral += venta.total;
            const row = document.createElement('tr');
            row.className = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';
            row.innerHTML = `
                <td class="px-3 md:px-6 py-3 whitespace-nowrap text-xs md:text-sm text-gray-700">${formatearFechaDisplay(venta.fecha)}</td>
                <td class="px-3 md:px-6 py-3 whitespace-nowrap text-xs md:text-sm font-medium text-gray-900">${venta.categoria || '-'}</td>
                <td class="px-3 md:px-6 py-3 whitespace-nowrap text-xs md:text-sm text-gray-700" title="${venta.tipo}">${venta.tipo || '-'}</td>
                <td class="px-3 md:px-6 py-3 whitespace-nowrap text-xs md:text-sm text-gray-700">${venta.fotografia ? `<img src="${venta.fotografia}" alt="foto" class="h-8 w-8 md:h-10 md:w-10 object-cover rounded">` : '-'}</td>
                <td class="px-3 md:px-6 py-3 whitespace-nowrap text-xs md:text-sm text-gray-700">$${Number(venta.precio).toFixed(2)}</td>
                <td class="px-3 md:px-6 py-3 whitespace-nowrap text-xs md:text-sm text-gray-700">${venta.unidades}</td>
                <td class="px-3 md:px-6 py-3 whitespace-nowrap text-xs md:text-sm font-medium text-green-600">$${Number(venta.total).toFixed(2)}</td>
                <td class="px-3 md:px-6 py-3 whitespace-nowrap text-xs md:text-sm text-gray-700">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full
                        ${venta.pago === 'Efectivo' ? 'bg-green-100 text-green-800' :
                          venta.pago === 'Debito' ? 'bg-blue-100 text-blue-800' :
                          venta.pago === 'Credito' ? 'bg-purple-100 text-purple-800' :
                          venta.pago === 'Transferencia' ? 'bg-gray-100 text-gray-800' :
                          'bg-yellow-100 text-yellow-800'}">
                        ${venta.pago}
                    </span>
                </td>
                <td class="px-3 md:px-6 py-3 text-xs md:text-sm text-gray-700 max-w-[8rem] md:max-w-xs truncate" title="${venta.notas}">${venta.notas || '-'}</td>
                <td class="px-3 md:px-6 py-3 whitespace-nowrap text-right text-xs md:text-sm font-medium space-x-2">
                    <button data-action="editar" data-index="${index}" class="text-blue-600 hover:text-blue-900">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button data-action="eliminar" data-index="${index}" class="text-red-600 hover:text-red-900">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });

        document.getElementById('totalGeneral').textContent = `$${totalGeneral.toFixed(2)}`;

        tbody.querySelectorAll('button[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.currentTarget.getAttribute('data-action');
                const idx = parseInt(e.currentTarget.getAttribute('data-index'));
                if (action === 'editar') entrarEnEdicion(idx);
                if (action === 'eliminar') eliminarVenta(idx);
            });
        });
    }

    function actualizarEstadisticas() {
        const hoy = new Date().toISOString().split('T')[0];
        const ventasHoy = ventasCache.filter(v => v.fecha === hoy);
        const cant = ventasHoy.length;
        const ingresos = ventasHoy.reduce((sum, v) => sum + Number(v.total || 0), 0);
        const prom = cant > 0 ? ingresos / cant : 0;

        document.getElementById('ventasHoy').textContent = cant;
        document.getElementById('ingresosTotales').textContent = `$${ingresos.toFixed(2)}`;
        document.getElementById('promedioVenta').textContent = `$${prom.toFixed(2)}`;
    }

    function actualizarContador() {
        const totalVentas = ventasCache.length;
        document.getElementById('totalVentas').textContent = totalVentas;
    }

    // ======== EXPORTAR =========
    async function exportarExcel() { mostrarNotificacion('Exportación deshabilitada', 'warning'); }
    const watermark = document.getElementById('watermark');
    function updateWatermarkVisibility() {
        if (!watermark) return;
        const doc = document.documentElement;
        const scrolledBottom = window.innerHeight + window.scrollY;
        const thresholdPx = 120;
        const nearBottom = Math.ceil(scrolledBottom) >= (doc.scrollHeight - thresholdPx);
        watermark.style.opacity = nearBottom ? '0.3' : '0';
    }
    window.addEventListener('scroll', updateWatermarkVisibility, { passive: true });
    window.addEventListener('resize', updateWatermarkVisibility);
    updateWatermarkVisibility();
});
