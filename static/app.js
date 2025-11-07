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
    const esRegaloChk = document.getElementById('esRegalo');
    const codigoRegaloInput = document.getElementById('codigoRegalo');
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
    const preticketsDraftBtn = document.getElementById('preticketsDraftBtn');
    const clienteNombre = document.getElementById('clienteNombre');
    const preticketAddBtn = document.getElementById('preticketAddBtn');
    const preticketConfirmBtn = document.getElementById('preticketConfirmBtn');
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
    const preticketCard = document.getElementById('preticketCard');
    const preticketCliente = document.getElementById('preticketCliente');
    const preticketBody = document.getElementById('preticketBody');
    const preticketTotal = document.getElementById('preticketTotal');
    const preticketClearBtn = document.getElementById('preticketClearBtn');
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

    // ======== CATEGORIAS / TIPOS desde Google Sheets =========
    let categoriasMap = {};
    async function loadCategorias() {
        try {
            const res = await fetch('/api/categorias');
            const data = await res.json();
            if (res.ok && data?.success) {
                categoriasMap = data.categorias || {};
                renderCategoriaOptions();
                renderTipoOptions(categoriaSelect?.value);
            }
        } catch (_) {}
    }
    function clearOptions(sel) { while (sel && sel.firstChild) sel.removeChild(sel.firstChild); }
    function renderCategoriaOptions() {
        if (!categoriaSelect) return;
        const current = categoriaSelect.value;
        clearOptions(categoriaSelect);
        const cats = Object.keys(categoriasMap);
        // Placeholder
        const ph = document.createElement('option');
        ph.value = '';
        ph.textContent = 'Seleccione categoría';
        ph.disabled = true;
        ph.selected = true;
        categoriaSelect.appendChild(ph);
        if (cats.length === 0) return;
        cats.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat; opt.textContent = cat;
            categoriaSelect.appendChild(opt);
        });
        if (current && cats.includes(current)) {
            categoriaSelect.value = current;
        } else {
            categoriaSelect.value = '';
        }
        // asegurar tipos visibles para la categoría actual
        if (typeof renderTipoOptions === 'function') renderTipoOptions(categoriaSelect.value);
    }
    function renderTipoOptions(cat) {
        const isIndumentaria = (cat || '').toLowerCase() === 'indumentaria';
        if (isIndumentaria) {
            // Mostrar input de código y ocultar select de tipos
            if (tipoIND) tipoIND.classList.remove('hidden');
            if (tipoPP) {
                tipoPP.classList.add('hidden');
                clearOptions(tipoPP);
            }
            return;
        }
        const tipos = (categoriasMap[cat] || []);
        if (tipoIND) tipoIND.classList.add('hidden');
        if (!tipoPP) return;
        const cur = tipoPP.value;
        clearOptions(tipoPP);
        // Placeholder para tipo
        const ph = document.createElement('option');
        ph.value = '';
        ph.textContent = 'Seleccione Tipo de Producto';
        ph.disabled = true;
        ph.selected = true;
        tipoPP.appendChild(ph);
        tipos.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t; opt.textContent = t;
            tipoPP.appendChild(opt);
        });
        if (cur && tipos.includes(cur)) tipoPP.value = cur;
        tipoPP.classList.remove('hidden');
    }

    if (categoriaSelect) {
        categoriaSelect.addEventListener('change', () => renderTipoOptions(categoriaSelect.value));
    }

    // ======== REGALO (código global) =========
    const GIFT_SIGLAS_BY_CATEGORIA = {
        'Accesorio personal': 'AP',
        'Articulos varios': 'AV',
        'Complemento de modo': 'CM',
        'Linea mate': 'LM',
        'Indumentaria': 'I'
    };
    function getSiglaRegalo() {
        const cat = (categoriaSelect?.value || '').trim();
        if (cat in GIFT_SIGLAS_BY_CATEGORIA) return GIFT_SIGLAS_BY_CATEGORIA[cat];
        // Heurístico por si el nombre difiere levemente
        const lc = cat.toLowerCase();
        if (lc.includes('indument')) return 'I';
        if (lc.includes('accesorio') || lc.includes('personal')) return 'AP';
        if (lc.includes('varios') || lc.includes('vario')) return 'AV';
        if (lc.includes('complement')) return 'CM';
        if (lc.includes('mate')) return 'LM';
        return 'AV';
    }
    function nextGiftCounter(siglaIn) {
        try {
            const sigla = (siglaIn || getSiglaRegalo() || 'AV').toUpperCase();
            const key = `giftCounterGlobal:${sigla}`;
            const cur = parseInt(localStorage.getItem(key) || '0');
            const nxt = isNaN(cur) ? 1 : (cur + 1);
            localStorage.setItem(key, String(nxt));
            return nxt;
        } catch (_) {
            const k = `__giftCounter_${(siglaIn||'AV').toUpperCase()}`;
            window[k] = (window[k] || 0) + 1;
            return window[k];
        }
    }
    function peekGiftCounter(siglaIn) {
        try {
            const sigla = (siglaIn || getSiglaRegalo() || 'AV').toUpperCase();
            const key = `giftCounterGlobal:${sigla}`;
            const cur = parseInt(localStorage.getItem(key) || '0');
            return isNaN(cur) ? 0 : cur;
        } catch (_) {
            const k = `__giftCounter_${(siglaIn||'AV').toUpperCase()}`;
            return window[k] || 0;
        }
    }
    function computeGiftCodePreview() {
        if (!esRegaloChk || !codigoRegaloInput) return;
        // Si no está marcado, limpiar
        if (!esRegaloChk.checked) { codigoRegaloInput.value = ''; return; }
        // Si estamos editando un ítem del pre-ticket y ya hay un código cargado, no sobreescribir
        if (preticketEditIndex !== null && (codigoRegaloInput.value || '').trim() !== '') return;
        const sigla = getSiglaRegalo();
        const candidate = (peekGiftCounter(sigla) + 1);
        codigoRegaloInput.value = `R${sigla}${candidate}`;
    }
    esRegaloChk?.addEventListener('change', computeGiftCodePreview);
    categoriaSelect?.addEventListener('change', computeGiftCodePreview);
    tipoPP?.addEventListener('change', computeGiftCodePreview);

    // ======== EXPORTAR VENTAS AL HISTORIAL =========
    if (exportHistoryBtn) {
        exportHistoryBtn.addEventListener('click', async () => {
            try {
                exportHistoryBtn.disabled = true;
                const oldHtml = exportHistoryBtn.innerHTML;
                exportHistoryBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Exportando...';
                const res = await fetch('/api/historial/export', { method: 'POST' });
                const data = await res.json().catch(() => ({}));
                if (!res.ok || data.success !== true) {
                    throw new Error(data.mensaje || data.error || `Error HTTP ${res.status}`);
                }
                if (typeof mostrarNotificacion === 'function') mostrarNotificacion(data.mensaje || '✅ Ventas exportadas', 'success');
                // Recargar tabla de ventas (debería quedar vacía) y actualizar estado de arqueo
                await cargarVentas();
            } catch (e) {
                if (typeof mostrarNotificacion === 'function') mostrarNotificacion(`❌ ${e.message || 'No se pudo exportar'}`, 'error');
            } finally {
                exportHistoryBtn.disabled = false;
                exportHistoryBtn.innerHTML = '<i class="fas fa-file-export mr-2"></i> Exportar Ventas';
            }
        });
    }

    // ======== BORRADOR CLIENTES (Pre-tickets) =========
    if (preticketsDraftBtn) {
        preticketsDraftBtn.addEventListener('click', async () => {
            try {
                const data = await fetchPretickets();
                const clientes = Object.keys(data || {});
                if (!clientes.length) {
                    if (typeof mostrarNotificacion === 'function') mostrarNotificacion('No hay pre-tickets pendientes', 'info');
                    else alert('No hay pre-tickets pendientes');
                    return;
                }
                const lineas = clientes.map(c => `• ${c} (${(data[c]||[]).length} ítem/s)`);
                if (typeof confirmarAccionJSON === 'function') {
                    await confirmarAccionJSON({
                        titulo: 'Borrador de Clientes',
                        mensaje: lineas.join('\n'),
                        confirmarTexto: 'Ok',
                        cancelarTexto: 'Cerrar'
                    });
                } else {
                    alert(`Borrador de Clientes (pre-tickets):\n\n${lineas.join('\n')}`);
                }
            } catch (e) {
                if (typeof mostrarNotificacion === 'function') mostrarNotificacion('❌ No se pudieron cargar los borradores de clientes', 'error');
                else alert('No se pudieron cargar los borradores de clientes');
            }
        });
    }

    // ======== PRE-TICKET UI / API =========
    let preticketsCache = {};
    async function fetchPretickets() {
        try {
            const res = await fetch('/api/pretickets');
            if (!res.ok) { preticketsCache = {}; return {}; }
            const data = await res.json();
            preticketsCache = data || {};
            return preticketsCache;
        } catch (_) { preticketsCache = {}; return {}; }
    }

    // Resolver nombre de cliente existente ignorando mayúsculas/minúsculas
    function resolveClienteKeyInsensitive(name, data) {
        const n = String(name || '').trim();
        if (!n) return '';
        const keys = Object.keys(data || {});
        const found = keys.find(k => k.toLowerCase() === n.toLowerCase());
        return found || n;
    }

    function formatoMoneda(n) { return `$${(Number(n)||0).toFixed(2)}`; }
    function calcularSubtotal(item) {
        const pu = parseFloat(item?.precio ?? 0);
        const u = parseInt(item?.unidades ?? 0);
        return +(pu * u).toFixed(2);
    }

    // Generar nombre de cliente automático (Cliente X) con reinicio diario, sin rellenar el input
    function generarClienteAuto() {
        try {
            const today = new Date().toISOString().slice(0,10);
            const key = `clienteCounter:${today}`;
            const current = parseInt(localStorage.getItem(key) || '0');
            const next = isNaN(current) ? 1 : current + 1;
            localStorage.setItem(key, String(next));
            return `Cliente ${next}`;
        } catch (_) {
            window.__clienteAuto = (window.__clienteAuto || 0) + 1;
            return `Cliente ${window.__clienteAuto}`;
        }
    }
    let clienteFallback = '';
    function getClienteActivoForWrite() {
        let c = (clienteNombre?.value || '').trim();
        if (!c) {
            if (!clienteFallback) clienteFallback = generarClienteAuto();
            c = clienteFallback;
        }
        return c;
    }
    function getClienteActivoForRead() {
        const c = (clienteNombre?.value || '').trim();
        return c || clienteFallback || '';
    }

    let preticketEditIndex = null;
    let preticketEditCurrentPhotoUrl = '';
    let preticketEditCliente = '';
    // Si se reabrió desde el registro, mantener el índice de la venta a actualizar
    let preticketUpdateIndex = null;

    async function refrescarPreticketUI() {
        if (!preticketCard || !preticketBody) return;
        const clienteInput = getClienteActivoForRead();
        if (!clienteInput) { preticketCard.classList.add('hidden'); return; }
        const data = await fetchPretickets();
        const resolvedCliente = resolveClienteKeyInsensitive(clienteInput, data);
        const items = data[resolvedCliente] || [];
        if (preticketCliente) preticketCliente.textContent = resolvedCliente;
        preticketBody.innerHTML = '';
        let total = 0;
        items.forEach((it, idx) => {
            const subtotal = calcularSubtotal(it);
            total += subtotal;
            const tr = document.createElement('tr');
            const giftTag = (it.codigo_regalo || '').trim() ? `<span class="ml-2 px-2 py-0.5 text-xs rounded bg-pink-100 text-pink-700">Regalo: ${it.codigo_regalo}</span>` : '';
            tr.innerHTML = `
                <td class="px-6 py-3 text-sm text-gray-700">${formatearFechaDisplay(it.fecha || '')}</td>
                <td class="px-6 py-3 text-sm text-gray-700">${it.categoria || ''}</td>
                <td class="px-6 py-3 text-sm text-gray-700">${(it.tipo || it.nombre || '')} ${giftTag}</td>
                <td class="px-6 py-3 text-sm text-gray-700">${formatoMoneda(it.precio)}</td>
                <td class="px-6 py-3 text-sm text-gray-700">${it.unidades}</td>
                <td class="px-6 py-3 text-sm text-gray-700 font-medium">${formatoMoneda(subtotal)}</td>
                <td class="px-6 py-3 text-sm">
                    <button type="button" data-idx="${idx}" class="preticket-edit px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 mr-2">Editar</button>
                    <button type="button" data-idx="${idx}" class="preticket-remove px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200">Eliminar</button>
                </td>`;
            preticketBody.appendChild(tr);
        });
        if (preticketTotal) preticketTotal.textContent = formatoMoneda(total);
        // Mantener visible el panel si hay cliente seleccionado, aunque no haya ítems aún
        preticketCard.classList.toggle('hidden', false);
        preticketBody.querySelectorAll('.preticket-edit').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const tgt = e.currentTarget || e.target;
                if (!tgt) return;
                const idxAttr = tgt.getAttribute('data-idx');
                const idx = parseInt(idxAttr);
                // Cargar item en el formulario para editar
                const data = await fetchPretickets();
                const clienteInput = getClienteActivoForRead();
                const cliente = resolveClienteKeyInsensitive(clienteInput, data);
                const item = (data[cliente] || [])[idx];
                if (!item) return;
                try {
                    // Fijar el cliente del ítem que se está editando para usarlo en el PUT
                    preticketEditCliente = cliente;
                    document.getElementById('fecha').value = item.fecha || today;
                    if (categoriaSelect) categoriaSelect.value = item.categoria || '';
                    actualizarUIporCategoria();
                    if (categoriaSelect && categoriaSelect.value === 'Indumentaria') {
                        if (tipoIND) tipoIND.value = item.tipo || '';
                    } else {
                        if (tipoPP) {
                            const opts = Array.from(tipoPP.options).map(o => o.value);
                            tipoPP.value = opts.includes(item.tipo) ? item.tipo : 'Otro';
                        }
                    }
                    if (inputPrecioFinal) { inputPrecioFinal.value = Number(item.precio).toFixed(2); precioFinalTouched = true; }
                    if (inputPrecio) inputPrecio.value = item.precio_base ?? item.precio;
                    if (inputUnidades) inputUnidades.value = item.unidades;
                    const pagoRadio = document.querySelector(`input[name="pago"][value="${item.pago}"]`);
                    if (pagoRadio) pagoRadio.checked = true;
                    if (inputNotas) inputNotas.value = item.notas || '';
                // Regalo: reflejar en formulario (derivar de codigo_regalo o de notas si es necesario)
                const derivadoEsRegalo = !!item.es_regalo || ((item.codigo_regalo || '').trim() !== '') || /Regalo\s*:/.test(item.notas || '');
                if (esRegaloChk) esRegaloChk.checked = derivadoEsRegalo;
                if (codigoRegaloInput) {
                    const cod = (item.codigo_regalo || '').trim();
                    if (cod) codigoRegaloInput.value = cod;
                    else if (derivadoEsRegalo && (codigoRegaloInput.value || '').trim() === '') computeGiftCodePreview();
                }
                    // Mostrar info de foto existente (no podemos pre-cargar el input file por seguridad del navegador)
                    const fotoFileName = document.getElementById('fotoFileName');
                    preticketEditCurrentPhotoUrl = item.fotografia || '';
                    if (fotoFileName) {
                        fotoFileName.textContent = preticketEditCurrentPhotoUrl ? 'Imagen existente seleccionada' : 'Ningún archivo seleccionado';
                        if (preticketEditCurrentPhotoUrl) {
                            fotoFileName.classList.add('underline','text-green-700','decoration-green-500','decoration-2','underline-offset-2');
                        } else {
                            fotoFileName.classList.remove('underline','text-green-700','decoration-green-500','decoration-2','underline-offset-2');
                        }
                    }
                    preticketEditIndex = idx;
                    if (preticketAddBtn) preticketAddBtn.innerHTML = '<i class="fas fa-save mr-2"></i> Guardar Cambios';
                    mostrarNotificacion('Editando ítem del pre-ticket', 'info');
                    // Scroll al principio y al formulario para que se vea que se va a editar
                    try {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                        const formEl = document.getElementById('ventaForm') || ventaFormCard;
                        if (formEl && typeof formEl.scrollIntoView === 'function') {
                            formEl.scrollIntoView({ behavior: 'smooth' });
                        }
                    } catch (_) {}
                } catch (_) {}
            });
        });

        preticketBody.querySelectorAll('.preticket-remove').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const data = await fetchPretickets();
                const clienteInput = getClienteActivoForRead();
                const cliente = resolveClienteKeyInsensitive(clienteInput, data);
                const tgt = e.currentTarget || e.target;
                if (!tgt) return;
                const idxAttr = tgt.getAttribute('data-idx');
                const idx = parseInt(idxAttr);
                const confirmado = await confirmarAccionJSON({
                    titulo: 'Eliminar ítem',
                    mensaje: '¿Eliminar este ítem del pre-ticket?',
                    confirmarTexto: 'Eliminar',
                    cancelarTexto: 'Cancelar'
                });
                if (!confirmado) return;
                const res = await fetch(`/api/pretickets/${encodeURIComponent(cliente)}/items/${idx}`, { method: 'DELETE' });
                const rj = await res.json().catch(() => ({}));
                if (!res.ok || rj.success !== true) { mostrarNotificacion(rj.error || 'Error al eliminar', 'error'); return; }
                mostrarNotificacion('Ítem eliminado', 'success');
                await refrescarPreticketUI();
            });
        });
    }

    if (clienteNombre) clienteNombre.addEventListener('input', () => {
        // Cambiar de cliente implica no estar editando una venta existente
        preticketUpdateIndex = null;
        refrescarPreticketUI();
    });
    // Cargar categorías al inicio
    loadCategorias();
    if (preticketAddBtn) preticketAddBtn.addEventListener('click', async () => {
        try {
            // Si estamos editando, usar el cliente fijado al entrar en edición
            let cliente = (preticketEditIndex !== null && preticketEditCliente)
                ? preticketEditCliente
                : getClienteActivoForWrite();
            // Unificar por case-insensitive si ya existe un cliente con distinto case
            try {
                const dataPT = await fetchPretickets();
                cliente = resolveClienteKeyInsensitive(cliente, dataPT);
            } catch (_) {}
            const venta = await construirVentaDesdeFormulario();
            preticketAddBtn.disabled = true;
            const url = preticketEditIndex !== null
                ? `/api/pretickets/${encodeURIComponent(cliente)}/items/${preticketEditIndex}`
                : `/api/pretickets/${encodeURIComponent(cliente)}/items`;
            const method = preticketEditIndex !== null ? 'PUT' : 'POST';
            // Si estamos editando y no se eligió una nueva foto, conservar la existente
            if (preticketEditIndex !== null && (!venta.fotografia || venta.fotografia === '')) {
                if (preticketEditCurrentPhotoUrl) venta.fotografia = preticketEditCurrentPhotoUrl;
            }
            // Forzar sólo campos de regalo (sin modificar notas del ítem para evitar duplicados)
            try {
                const giftChecked = !!esRegaloChk?.checked;
                const giftCodeDom = (codigoRegaloInput?.value || '').trim();
                if (giftChecked) venta.es_regalo = true;
                if (giftCodeDom) venta.codigo_regalo = giftCodeDom;
            } catch (_) {}
            console.log('[Preticket] Payload a enviar:', venta);
            const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(venta) });
            const rj = await res.json().catch(() => ({}));
            if (!res.ok || rj.success !== true) throw new Error(rj.error || 'Error al agregar al pre-ticket');
            mostrarNotificacion(preticketEditIndex !== null ? '✅ Ítem actualizado' : '✅ Ítem agregado al pre-ticket', 'success');
            // Si el ítem es regalo, consumir el código (incrementar contador global) y actualizar previsualización
            try {
                if (venta.es_regalo && (venta.codigo_regalo || '').trim() !== '') {
                    nextGiftCounter();
                    computeGiftCodePreview();
                }
            } catch (_) {}
            preticketEditIndex = null;
            preticketEditCurrentPhotoUrl = '';
            preticketEditCliente = '';
            if (preticketAddBtn) preticketAddBtn.innerHTML = '<i class="fas fa-cart-plus mr-2"></i> Agregar al Pre-ticket';
            await refrescarPreticketUI();
            clearInputsAfterPreticketAdd();
        } catch (e) {
            mostrarNotificacion('❌ ' + (e?.message || 'Error'), 'error');
        } finally {
            preticketAddBtn.disabled = false;
            if (preticketAddBtn) preticketAddBtn.innerHTML = '<i class="fas fa-cart-plus mr-2"></i> Agregar al Pre-ticket';
        }
    });
    if (preticketConfirmBtn) preticketConfirmBtn.addEventListener('click', async () => {
        try {
            const cliente = getClienteActivoForWrite();
            // Validar que el pre-ticket tenga items antes de confirmar
            const dataPT = await fetchPretickets();
            const resolvedCli = resolveClienteKeyInsensitive(cliente, dataPT);
            const itemsPT = dataPT[resolvedCli] || [];
            if (!itemsPT || itemsPT.length === 0) {
                mostrarNotificacion('El pre-ticket está vacío. Agrega ítems antes de confirmar.', 'warning');
                return;
            }
            // Detectar si el pre-ticket tiene al menos un regalo para incrementar contador tras confirmar
            const hasGift = Array.isArray(itemsPT) && itemsPT.some(it => !!it?.es_regalo || (it?.codigo_regalo || '').trim() !== '');

            const confirmado = await confirmarAccionJSON({
                titulo: 'Confirmar Ticket',
                mensaje: 'Se generará una venta agrupada con todos los ítems del pre-ticket de este cliente. ¿Continuar?',
                confirmarTexto: 'Confirmar', cancelarTexto: 'Cancelar'
            });
            if (!confirmado) return;
            const fecha = document.getElementById('fecha').value;
            const pagoEl = document.querySelector('input[name="pago"]:checked');
            const notas = document.getElementById('notas').value;
            preticketConfirmBtn.disabled = true;
            const oldHtml = preticketConfirmBtn.innerHTML;
            preticketConfirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Confirmando...';
            const payload = { fecha, pago: pagoEl ? pagoEl.value : '', notas };
            if (preticketUpdateIndex !== null) payload.update_index = preticketUpdateIndex;
            const res = await fetch(`/api/pretickets/${encodeURIComponent(cliente)}/confirm`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            });
            const rj = await res.json().catch(() => ({}));
            if (!res.ok || rj.success !== true) {
                console.error('[Confirm Preticket] Error respuesta', rj);
                throw new Error(rj.mensaje || rj.error || 'Error al confirmar ticket');
            }
            mostrarNotificacion('✅ Ticket confirmado como venta', 'success');
            await cargarVentas();
            // Limpiar el nombre del cliente y reiniciar el fallback tras confirmar
            clienteFallback = '';
            if (clienteNombre) clienteNombre.value = '';
            preticketUpdateIndex = null;
            await refrescarPreticketUI();
            // Recalcular previsualización de código de regalo para próxima venta
            try { computeGiftCodePreview(); } catch (_) {}
        } catch (e) {
            mostrarNotificacion('❌ ' + (e?.message || 'Error'), 'error');
        } finally {
            preticketConfirmBtn.disabled = false;
            preticketConfirmBtn.innerHTML = '<i class="fas fa-receipt mr-2"></i> Confirmar Ticket';
        }
    });
    if (preticketClearBtn) preticketClearBtn.addEventListener('click', async () => {
        const cliente = getClienteActivoForRead();
        if (!cliente) return;
        const confirmado = await confirmarAccionJSON({
            titulo: 'Limpiar Pre-ticket',
            mensaje: '¿Eliminar todos los ítems del pre-ticket actual?',
            confirmarTexto: 'Limpiar',
            cancelarTexto: 'Cancelar'
        });
        if (!confirmado) return;
        try {
            const res = await fetch(`/api/pretickets/${encodeURIComponent(cliente)}`, { method: 'DELETE' });
            const rj = await res.json().catch(() => ({}));
            if (!res.ok || rj.success !== true) throw new Error(rj.error || 'No se pudo limpiar');
            mostrarNotificacion('Pre-ticket limpiado', 'success');
            // Salimos de modo edición de venta previa
            preticketUpdateIndex = null;
            await refrescarPreticketUI();
        } catch (e) {
            mostrarNotificacion('❌ ' + (e?.message || 'Error al limpiar pre-ticket'), 'error');
        }
    });
    // refrescar al cargar por si hay datos previos
    refrescarPreticketUI();

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

    function clearInputsAfterPreticketAdd() {
        try {
            // Mantener fecha y cliente; limpiar campos del producto
            if (categoriaSelect) categoriaSelect.value = '';
            actualizarUIporCategoria();
            if (tipoPP) tipoPP.selectedIndex = 0;
            if (tipoIND) tipoIND.value = '';
            if (inputPrecio) inputPrecio.value = '';
            if (inputUnidades) inputUnidades.value = '';
            if (inputDescuento) inputDescuento.value = '';
            if (inputPrecioFinal) inputPrecioFinal.value = '';
            precioFinalTouched = false;
            if (inputFoto) inputFoto.value = '';
            const fotoFileName = document.getElementById('fotoFileName');
            if (fotoFileName) {
                fotoFileName.textContent = 'Ningún archivo seleccionado';
                fotoFileName.classList.remove('underline', 'text-green-700', 'decoration-green-500', 'decoration-2', 'underline-offset-2');
            }
            if (inputNotas) inputNotas.value = '';
            // Regalo: mantener el check si estaba activado y preparar el siguiente código
            if (esRegaloChk && esRegaloChk.checked) {
                computeGiftCodePreview();
            } else if (codigoRegaloInput) {
                codigoRegaloInput.value = '';
            }
            if (categoriaSelect) categoriaSelect.focus();
        } catch (_) {}
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
        updateArqueoCierreState();
    }

    async function construirVentaDesdeFormulario() {
        if (!form.checkValidity()) {
            form.reportValidity();
            throw new Error('Formulario inválido');
        }
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

        if (!fecha) throw new Error('La fecha es requerida');
        if (!categoria) throw new Error('La categoría es requerida');
        if (!tipo) throw new Error('El tipo de producto es requerido');
        if (!precioValue || isNaN(parseFloat(precioValue))) throw new Error('El precio es inválido');
        if (!unidadesValue || isNaN(parseInt(unidadesValue))) throw new Error('Las unidades son inválidas');
        if (!pagoElement) throw new Error('Selecciona una forma de pago');

        let precio = parseFloat(precioValue);
        let unidades = parseInt(unidadesValue);
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
                throw new Error('El precio es inválido');
            }
        }
        const precioBase = isNaN(parseFloat(precioValue)) ? '' : parseFloat(precioValue);
        precio = precioFinalUnit;
        if (isCambio) unidades = -Math.abs(unidades);
        const pago = pagoElement.value;

        let fotoUrl = '';
        try {
            if (inputFoto && inputFoto.files && inputFoto.files[0]) {
                const file = inputFoto.files[0];
                const isImage = file.type && file.type.startsWith('image/');
                const maxBytes = 5 * 1024 * 1024;
                if (!isImage) throw new Error('El archivo debe ser una imagen');
                if (file.size > maxBytes) throw new Error('La imagen supera 5MB');
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
        } catch (e) {
            console.warn('Error subiendo fotografía', e);
        }

        return {
            fecha,
            categoria,
            tipo,
            fotografia: fotoUrl,
            precio,
            unidades,
            pago,
            notas,
            precio_base: precioBase,
            descuento: descuentoPct,
            precio_final: precioFinalUnit
        };
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
                const file = inputFoto.files[0];
                const isImage = file.type && file.type.startsWith('image/');
                const maxBytes = 5 * 1024 * 1024;
                if (!isImage) throw new Error('El archivo debe ser una imagen');
                if (file.size > maxBytes) throw new Error('La imagen supera 5MB');
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
        } catch (e) {
            console.warn('Error subiendo fotografía', e);
        }

        // Regalo
        const esRegalo = !!esRegaloChk?.checked;
        let codigoRegalo = (codigoRegaloInput?.value || '').trim();
        if (esRegalo && !codigoRegalo) {
            const sigla = getSiglaRegalo();
            codigoRegalo = `R${sigla}${peekGiftCounter() + 1}`; // previsualización
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
            // anexar código de regalo a notas en venta directa
            notas: esRegalo && codigoRegalo ? `${notas ? notas + '\n' : ''}Regalo: ${codigoRegalo}` : notas,
            // Campos adicionales para exportación a Sheets
            precio_base: precioBase,
            descuento: descuentoPct,
            precio_final: precioFinalUnit,
            // Campos auxiliares para edición: conservar selección exacta del usuario
            categoria_edit: categoria,
            tipo_edit: tipo,
            // Regalo
            es_regalo: esRegalo,
            codigo_regalo: codigoRegalo
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
                // Tras guardar venta directa, recalcular previsualización del código de regalo
                try { computeGiftCodePreview(); } catch (_) {}
                // confirmar código de regalo usado: incrementar contador global
                if (esRegalo && codigoRegalo) nextGiftCounter();
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
        // Nuevo flujo: reabrir la venta como pre-ticket para editar ítems individuales
        (async () => {
            try {
                // Limpiar estado de edición de venta clásica
                editIndex = null;
                if (typeof addBtn !== 'undefined' && addBtn) {
                    addBtn.innerHTML = '<i class="fas fa-plus-circle mr-2"></i> Agregar';
                }
                const res = await fetch(`/api/ventas/${index}/reopen-preticket`, { method: 'POST' });
                const rj = await res.json().catch(() => ({}));
                if (!res.ok || rj.success !== true) throw new Error(rj.error || 'No se pudo reabrir el pre-ticket');
                // Establecer el cliente en el input y refrescar UI
                clienteFallback = '';
                if (clienteNombre) clienteNombre.value = rj.cliente || '';
                // Guardar índice para actualizar la venta al confirmar
                preticketUpdateIndex = index;
                await refrescarPreticketUI();
                mostrarNotificacion('🔁 Pre-ticket reabierto para edición individual', 'info');
                // Scroll a la tarjeta de pre-ticket
                try {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                } catch (_) {}
                if (preticketCard && typeof preticketCard.scrollIntoView === 'function') {
                    preticketCard.scrollIntoView({ behavior: 'smooth' });
                }
            } catch (e) {
                mostrarNotificacion('❌ ' + (e?.message || 'Error al reabrir pre-ticket'), 'error');
            }
        })();
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

    // ======== UI por Categoria (Indumentaria muestra código, resto usa tipos del Sheets) ========
    function actualizarUIporCategoria() {
        if (!categoriaSelect) return;
        const cat = categoriaSelect.value;
        renderTipoOptions(cat);
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

    // Configuración del modal: los clicks se manejan desde confirmarAccionJSON

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
            const modal = document.getElementById('confirmModal');
            if (!modal) { resolve(confirm(mensaje)); return; }

            const titleEl = modal.querySelector('h3');
            const msgEl = modal.querySelector('p');
            const btnConfirm = document.getElementById('confirmDelete');
            const btnCancel = document.getElementById('confirmCancel');

            const oldTitle = titleEl.textContent;
            const oldMsgHTML = msgEl.innerHTML;
            const oldConfirmText = btnConfirm.textContent;
            const oldCancelText = btnCancel.textContent;

            titleEl.textContent = titulo;
            msgEl.innerHTML = String(mensaje || '').replace(/\n/g, '<br>');
            btnConfirm.textContent = confirmarTexto;
            btnCancel.textContent = cancelarTexto;

            modal.classList.remove('hidden');

            const onConfirm = () => { cleanup(); resolve(true); };
            const onCancel = () => { cleanup(); resolve(false); };

            function cleanup() {
                modal.classList.add('hidden');
                btnConfirm.removeEventListener('click', onConfirm);
                btnCancel.removeEventListener('click', onCancel);
                titleEl.textContent = oldTitle;
                msgEl.innerHTML = oldMsgHTML;
                btnConfirm.textContent = oldConfirmText;
                btnCancel.textContent = oldCancelText;
            }

            btnConfirm.addEventListener('click', onConfirm, { once: true });
            btnCancel.addEventListener('click', onCancel, { once: true });
        });
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
            const fotos = Array.isArray(venta.fotos) ? venta.fotos.filter(Boolean) : (venta.fotografia ? [venta.fotografia] : []);
            const photoBtn = fotos.length ? `
                <button type="button" data-photos='${JSON.stringify(fotos).replace(/'/g, "&#39;")}' class="relative inline-block rounded focus:outline-none">
                    <img src="${fotos[0]}" alt="foto" class="h-8 w-8 md:h-10 md:w-10 object-cover rounded hover:opacity-90 transition">
                    ${fotos.length > 1 ? `<span class=\"absolute -bottom-1 -right-1 text-[10px] bg-gray-900 text-white rounded-full px-1\">${fotos.length}</span>` : ''}
                </button>` : '-';
            row.innerHTML = `
                <td class="px-3 md:px-6 py-3 whitespace-nowrap text-xs md:text-sm text-gray-700">${formatearFechaDisplay(venta.fecha)}</td>
                <td class="px-3 md:px-6 py-3 whitespace-nowrap text-xs md:text-sm font-medium text-gray-900">${venta.categoria || '-'}</td>
                <td class="px-3 md:px-6 py-3 whitespace-nowrap text-xs md:text-sm text-gray-700" title="${venta.tipo}">${venta.tipo || '-'}</td>
                <td class="px-3 md:px-6 py-3 whitespace-nowrap text-xs md:text-sm text-gray-700">${photoBtn}</td>
                <td class="px-3 md:px-6 py-3 whitespace-nowrap text-xs md:text-sm text-gray-700">$${Number(venta.precio).toFixed(2)}</td>
                <td class="px-3 md:px-6 py-3 whitespace-nowrap text-xs md:text-sm text-gray-700">${venta.unidades}</td>
                <td class="px-3 md:px-6 py-3 whitespace-nowrap text-xs md:text-sm text-gray-700">${venta.items_count ? venta.items_count : 1}</td>
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
                <td class="px-3 md:px-6 py-3 text-xs md:text-sm text-gray-700 whitespace-normal break-words" title="${venta.notas}">${venta.notas || '-'}</td>
                <td class="px-3 md:px-6 py-3 whitespace-nowrap text-right text-xs md:text-sm font-medium space-x-2">
                    <button type="button" data-action="editar" data-index="${index}" class="text-blue-600 hover:text-blue-900">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button type="button" data-action="eliminar" data-index="${index}" class="text-red-600 hover:text-red-900">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });

        document.getElementById('totalGeneral').textContent = `$${totalGeneral.toFixed(2)}`;

        // Acciones editar/eliminar con DELEGACIÓN (más robusto tras cada render)
        if (tbody) {
            // Eliminar handler previo si existe para no duplicar
            if (tbody.__ventasActionHandler) tbody.removeEventListener('click', tbody.__ventasActionHandler);
            const handler = async (e) => {
                const btn = e.target && e.target.closest && e.target.closest('button[data-action]');
                if (!btn) return;
                e.preventDefault();
                e.stopPropagation();
                const action = btn.getAttribute('data-action');
                const idx = parseInt(btn.getAttribute('data-index'));
                if (Number.isNaN(idx)) return;
                if (action === 'eliminar') {
                    console.log('[Ventas] Click eliminar idx=', idx);
                    try {
                        const ok = await confirmarAccionJSON({
                            titulo: 'Eliminar venta',
                            mensaje: '¿Seguro que deseas eliminar esta venta? Esta acción no se puede deshacer.',
                            confirmarTexto: 'Eliminar', cancelarTexto: 'Cancelar'
                        });
                        if (!ok) return;
                        const res = await fetch(`/api/ventas/${idx}`, { method: 'DELETE' });
                        const data = await res.json().catch(() => ({}));
                        if (!res.ok) { mostrarNotificacion(data.error || 'Error al eliminar', 'error'); return; }
                        mostrarNotificacion('Venta eliminada correctamente', 'success');
                        await cargarVentas();
                    } catch (err) {
                        mostrarNotificacion('❌ ' + (err?.message || 'Error'), 'error');
                    }
                    return;
                }
                if (action === 'editar') {
                    // Intentar abrir panel de pre-ticket a partir de notas
                    try {
                        const v = ventasCache[idx];
                        const notas = String(v?.notas || '');
                        const m = notas.match(/Cliente:\s*([^\n|]+)/i);
                        const cliente = m ? m[1].trim() : '';
                        if (cliente && clienteNombre) {
                            clienteNombre.value = cliente;
                            preticketCard?.classList.remove('hidden');
                            await fetchPretickets();
                            await refrescarPreticketUI();
                            const card = document.getElementById('preticketCard');
                            if (card?.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            mostrarNotificacion(`Pre-ticket del cliente "${cliente}"`, 'info');
                            return;
                        }
                    } catch (_) {}
                    entrarEnEdicion(idx);
                }
            };
            tbody.addEventListener('click', handler);
            tbody.__ventasActionHandler = handler;
        }

        // Lightbox / Galería para fotos
        const imageModal = document.getElementById('imageModalIndex');
        const imageModalImg = document.getElementById('imageModalImgIndex');
        const imageModalClose = document.getElementById('imageModalCloseIndex');
        let galleryPhotos = [];
        let galleryIdx = 0;
        const imageModalIndicator = document.createElement('div');
        imageModalIndicator.id = 'imageModalIndicatorIndex';
        imageModalIndicator.className = 'absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-2 py-1 rounded';
        if (imageModal) imageModal.appendChild(imageModalIndicator);
        function updateIndicator() {
            if (!imageModalIndicator) return;
            const total = galleryPhotos.length || 0;
            imageModalIndicator.textContent = total ? `${galleryIdx + 1} / ${total}` : '';
        }
        function openGallery(photos, idx = 0) {
            galleryPhotos = photos || [];
            galleryIdx = Math.max(0, Math.min(idx, galleryPhotos.length - 1));
            if (!imageModal || !imageModalImg) return;
            imageModalImg.src = galleryPhotos[galleryIdx] || '';
            imageModal.classList.remove('hidden');
            updateIndicator();
        }
        function closeGallery() {
            if (!imageModal) return;
            imageModal.classList.add('hidden');
            galleryPhotos = [];
            galleryIdx = 0;
        }
        function nextPhoto() {
            if (!galleryPhotos.length) return;
            galleryIdx = (galleryIdx + 1) % galleryPhotos.length;
            imageModalImg.src = galleryPhotos[galleryIdx] || '';
            updateIndicator();
        }
        function prevPhoto() {
            if (!galleryPhotos.length) return;
            galleryIdx = (galleryIdx - 1 + galleryPhotos.length) % galleryPhotos.length;
            imageModalImg.src = galleryPhotos[galleryIdx] || '';
            updateIndicator();
        }
        tbody.querySelectorAll('button[data-photos]').forEach(btn => {
            btn.addEventListener('click', () => {
                try {
                    const arr = JSON.parse(btn.getAttribute('data-photos') || '[]');
                    openGallery(arr, 0);
                } catch (_) {}
            });
        });
        // Soporte legacy de una sola foto
        tbody.querySelectorAll('button[data-photo-url]').forEach(btn => {
            btn.addEventListener('click', () => {
                const url = btn.getAttribute('data-photo-url');
                openGallery(url ? [url] : [], 0);
            });
        });
        if (imageModal && imageModalClose) {
            imageModal.addEventListener('click', (e) => { if (e.target === imageModal) closeGallery(); });
            imageModalClose.addEventListener('click', closeGallery);
            document.addEventListener('keydown', (e) => {
                if (imageModal.classList.contains('hidden')) return;
                if (e.key === 'ArrowRight') nextPhoto();
                if (e.key === 'ArrowLeft') prevPhoto();
                if (e.key === 'Escape') closeGallery();
            });
            const btnPrev = document.getElementById('imageModalPrevIndex');
            const btnNext = document.getElementById('imageModalNextIndex');
            if (btnPrev) btnPrev.addEventListener('click', (e) => { e.stopPropagation(); prevPhoto(); });
            if (btnNext) btnNext.addEventListener('click', (e) => { e.stopPropagation(); nextPhoto(); });
        }
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

    // ======== ARQUEO DE CAJA (Index) =========
    const arqueoBtn = document.getElementById('arqueoBtn');
    const arqueoPanel = document.getElementById('arqueoPanel');
    const arqueoApertura = document.getElementById('arqueoApertura');
    const arqueoCierre = document.getElementById('arqueoCierre');
    const arqueoGuardar = document.getElementById('arqueoGuardar');
    const arqueoCerrarPanel = document.getElementById('arqueoCerrarPanel');
    const fechaInput = document.getElementById('fecha');

    function getArqueoKey() {
        const f = fechaInput?.value || new Date().toISOString().split('T')[0];
        return `arqueo:${f}`;
    }
    function cargarArqueo() {
        try {
            const saved = localStorage.getItem(getArqueoKey());
            if (saved) {
                const obj = JSON.parse(saved);
                if (arqueoApertura) arqueoApertura.value = obj?.apertura ?? '';
                if (arqueoCierre) arqueoCierre.value = obj?.cierre ?? '';
            } else {
                if (arqueoApertura) arqueoApertura.value = '';
                if (arqueoCierre) arqueoCierre.value = '';
            }
        } catch (_) {}
    }
    function hayPreticketsPendientes() {
        try {
            return Object.values(preticketsCache || {}).some(arr => Array.isArray(arr) && arr.length > 0);
        } catch (_) { return false; }
    }

    function updateArqueoCierreState() {
        try {
            const hayPendVentas = Array.isArray(ventasCache) && ventasCache.length > 0;
            // Solo considerar ventas pendientes para bloquear el cierre; ignorar pre-tickets
            const hayPendientes = hayPendVentas;
            if (arqueoCierre) {
                arqueoCierre.disabled = !!hayPendientes;
                arqueoCierre.title = hayPendientes ? 'No se puede cargar el Cierre con ventas pendientes sin exportar' : '';
                arqueoCierre.placeholder = hayPendientes ? 'Exporte primero' : '0.00';
                if (hayPendientes) arqueoCierre.value = '';
            }
        } catch (_) {}
    }

    if (arqueoBtn) {
        arqueoBtn.addEventListener('click', async () => {
            if (!arqueoPanel) return;
            cargarArqueo();
            await fetchPretickets();
            arqueoPanel.classList.toggle('hidden');
            updateArqueoCierreState();
        });
    }
    if (arqueoCerrarPanel) {
        arqueoCerrarPanel.addEventListener('click', () => arqueoPanel?.classList.add('hidden'));
    }
    if (arqueoGuardar) {
        arqueoGuardar.addEventListener('click', async () => {
            const apertura = parseFloat(arqueoApertura?.value || '');
            const cierre = parseFloat(arqueoCierre?.value || '');

            // Si no hay cierre todavía, guardar solo apertura sin validar
            if (!isFinite(cierre)) {
                const payload = {
                    apertura: isFinite(apertura) ? +apertura.toFixed(2) : null,
                    cierre: null,
                    savedAt: new Date().toISOString()
                };
                try {
                    localStorage.setItem(getArqueoKey(), JSON.stringify(payload));
                    mostrarNotificacion('✅ Apertura guardada', 'success');
                    arqueoPanel?.classList.add('hidden');
                } catch (e) {
                    mostrarNotificacion('❌ No se pudo guardar la apertura', 'error');
                }
                return;
            }

            // Calcular efectivo del día (solo ventas con pago en efectivo) desde HISTORIAL
            const fechaSel = (fechaInput?.value || new Date().toISOString().split('T')[0]);
            let efectivoDia = 0;
            try {
                const res = await fetch('/api/historial');
                const hist = await res.json();
                const ventasDia = Array.isArray(hist[fechaSel]) ? hist[fechaSel] : [];
                efectivoDia = ventasDia
                    .filter(v => (String(v.pago || '')).toLowerCase().includes('efect'))
                    .reduce((sum, v) => {
                        const precio = Number(v.precio_final ?? v.precio ?? 0);
                        const unidades = Number(v.unidades ?? 0);
                        const total = Number(v.total ?? (precio * unidades));
                        return sum + (isFinite(total) ? total : 0);
                    }, 0);
            } catch (_) { efectivoDia = 0; }

            const esperado = (isFinite(apertura) ? apertura : 0) + efectivoDia;
            const cierreVal = isFinite(cierre) ? cierre : NaN;
            const coincide = isFinite(cierreVal) && Math.abs(cierreVal - esperado) < 0.01;
            if (!coincide) {
                const diff = isFinite(cierreVal) ? +(cierreVal - esperado).toFixed(2) : NaN;
                const dir = isNaN(diff) ? '' : (diff > 0 ? 'Sobra' : 'Falta');
                const msg = `No coincide el cierre de caja.\nCierre declarado: $${isFinite(cierreVal)?cierreVal.toFixed(2):'N/A'}\nEsperado: $${esperado.toFixed(2)}\nDiferencia: $${isNaN(diff)?'N/A':Math.abs(diff).toFixed(2)} ${dir}`;
                mostrarNotificacion(`❌ ${msg.replace(/\n/g, ' | ')}`, 'error');
                return; // No guardar si no coincide
            }

            const payload = {
                apertura: isFinite(apertura) ? +apertura.toFixed(2) : null,
                cierre: isFinite(cierre) ? +cierre.toFixed(2) : null,
                savedAt: new Date().toISOString()
            };
            try {
                localStorage.setItem(getArqueoKey(), JSON.stringify(payload));
                mostrarNotificacion('✅ Arqueo guardado', 'success');
                arqueoPanel?.classList.add('hidden');
            } catch (e) {
                mostrarNotificacion('❌ No se pudo guardar el arqueo', 'error');
            }
        });
    }

    // ======== EXPORTAR =========
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
