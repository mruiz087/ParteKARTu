// --- MODALES Y INTERFAZ ---

function cerrarModal() {
    document.querySelectorAll('.fixed.inset-0').forEach(m => m.classList.add('hidden'));
}



async function abrirMenuViaje(dStr, trip, driverId) {
    const modal = document.getElementById('modal-viaje');
    const subtitle = document.getElementById('modal-type-subtitle');

    const btnRelevar = document.getElementById('btn-relevar');
    const btnPedirRelevo = document.getElementById('btn-pedir-relevo');
    const btnCanjearDeuda = document.getElementById('btn-canjear-deuda');
    const btnFestivo = document.getElementById('btn-festivo');
    const btnNadie = document.getElementById('btn-nadie');
    const btnUnirsePuntual = document.getElementById('btn-unirse-puntual');
    const btnEliminarViaje = document.getElementById('btn-eliminar-viaje');
    const btnBajarseViaje = document.getElementById('btn-bajarse-viaje');

    const setupActions = document.getElementById('setup-actions');
    const statusActions = document.getElementById('status-actions');
    const btnCrearRutina = document.getElementById('btn-crear-rutina');
    const btnCrearPuntual = document.getElementById('btn-crear-puntual');
    const pasajerosList = document.getElementById('pasajeros-list');

    document.getElementById('modal-date-title').innerText = dStr;
    modal.dataset.date = dStr;

    const esMiTurno = driverId === currentUser.id;
    const estaVacante = trip?.status === 'pending_relevo';
    const esSoyCreador = trip?.creator_id === currentUser.id;

    // Ocultar todos los botones
    [btnRelevar, btnPedirRelevo, btnCanjearDeuda, btnCrearRutina, btnCrearPuntual, btnFestivo,
        btnNadie, btnUnirsePuntual, btnEliminarViaje, btnBajarseViaje].forEach(b => b?.classList.add('hidden'));

    if (!trip && !driverId) {
        // Caso: Día sin planificar
        setupActions.classList.remove('hidden');
        statusActions.classList.add('hidden');
        if (pasajerosList) pasajerosList.classList.add('hidden');
        subtitle.innerText = t('fixed.dia_sin_planificar');

        // Verificar si el usuario está de baja
        const currentMember = state.members.find(m => m.user_id === currentUser.id);
        const isOnLeave = currentMember?.is_on_leave || false;

        if (isOnLeave) {
            // Si está de baja, no mostrar botones de crear viaje
            subtitle.innerText = t('fixed.no_crear_baja');
        } else {
            const tieneRutina = currentGroup?.metadata?.rutina?.dias?.length > 0;
            if (tieneRutina) {
                btnCrearPuntual?.classList.remove('hidden');
            } else {
                btnCrearRutina?.classList.remove('hidden');
                btnCrearPuntual?.classList.remove('hidden');
            }
        }
    } else {
        setupActions.classList.add('hidden');
        statusActions.classList.remove('hidden');

        // VIAJE PUNTUAL - Lógica especial
        if (trip?.type === 'single') {
            const conductor = state.members.find(m => m.user_id === driverId);
            subtitle.innerText = t('fixed.viaje_puntual_de') + " " + (conductor?.display_name || 'Compañero');

            const pasajeros = trip.metadata?.pasajeros || [];
            const yaEstoyUnido = pasajeros.includes(currentUser.id);

            if (pasajerosList) {
                const pasajerosInfo = pasajeros
                    .map(pId => {
                        const p = state.members.find(m => m.user_id === pId);
                        return p ? { id: pId, nombre: p.display_name, color: p.color } : null;
                    })
                    .filter(p => p);

                if (pasajerosInfo.length > 0) {
                    pasajerosList.innerHTML = `
                        <div class="bg-slate-900/50 p-4 rounded-xl space-y-3 border border-slate-700">
                            <div class="flex items-center gap-2 mb-3">
                                <i class="fas fa-steering-wheel text-indigo-400 text-sm"></i>
                                <span class="text-xs font-black uppercase text-slate-400">${t('fixed.conductor')}</span>
                            </div>
                            <div class="flex items-center gap-3 bg-slate-800 p-3 rounded-lg">
                                <div class="w-4 h-4 rounded-full" style="background: ${conductor?.color || '#6366f1'}"></div>
                                <span class="text-sm font-bold text-white">${escapeHtml(conductor?.display_name || t('fixed.conductor'))}</span>
                            </div>
                            
                            ${pasajerosInfo.length > 0 ? `
                                <div class="pt-3 border-t border-slate-700">
                                    <div class="flex items-center gap-2 mb-3">
                                        <i class="fas fa-users text-emerald-400 text-sm"></i>
                                        <span class="text-xs font-black uppercase text-slate-400">${t('fixed.pasajeros')} (${pasajerosInfo.length})</span>
                                    </div>
                                    <div class="space-y-2">
                                        ${pasajerosInfo.map(p => `
                                            <div class="flex items-center gap-3 bg-slate-800 p-3 rounded-lg">
                                                <div class="w-4 h-4 rounded-full" style="background: ${escapeHtml(p.color)}"></div>
                                                <span class="text-sm font-bold text-white">${escapeHtml(p.nombre)}</span>
                                                ${p.id === currentUser.id ? '<span class="text-[8px] font-black text-indigo-400 ml-auto uppercase">(Tú)</span>' : ''}
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    `;
                    pasajerosList.classList.remove('hidden');
                } else {
                    if (pasajerosList) pasajerosList.classList.add('hidden');
                }
            }

            // CASO 1: Soy el creador/conductor del viaje puntual
            if (esSoyCreador) {
                if (btnEliminarViaje) {
                    btnEliminarViaje.classList.remove('hidden');
                    btnEliminarViaje.onclick = eliminarViajePuntual;
                }
                // NO mostrar festivo ni nadie va para viajes puntuales del creador
            }
            // CASO 2: No soy el creador pero quiero unirme
            else if (!yaEstoyUnido) {
                // Verificar si estoy de baja
                const currentMember = state.members.find(m => m.user_id === currentUser.id);
                const isOnLeave = currentMember?.is_on_leave || false;

                if (isOnLeave) {
                    // No mostrar botón de unirse si está de baja
                    subtitle.innerText = t('fixed.no_unir_baja');
                } else {
                    btnUnirsePuntual?.classList.remove('hidden');
                    btnUnirsePuntual.onclick = () => ejecutarUnionPuntual(trip);
                }
            }
            // CASO 3: Ya estoy unido - mostrar opción de bajarse
            else {
                btnBajarseViaje?.classList.remove('hidden');
                btnBajarseViaje.onclick = () => bajarseViajePuntual(trip);
            }
        } else {
            if (pasajerosList) pasajerosList.classList.add('hidden');

            if (trip?.status === 'holiday') {
                subtitle.innerText = t('fixed.dia_festivo_marcado');
                if (btnFestivo) {
                    btnFestivo.classList.remove('hidden');
                    btnFestivo.innerText = "Quitar Festivo";
                    btnFestivo.onclick = () => marcarEspecial('holiday');
                }
                if (btnNadie) {
                    btnNadie.classList.remove('hidden');
                    btnNadie.onclick = () => marcarEspecial('canceled');
                }
            } else if (trip?.status === 'canceled') {
                subtitle.innerText = t('fixed.viaje_cancelado_op');
                if (btnFestivo) {
                    btnFestivo.classList.remove('hidden');
                    btnFestivo.onclick = () => marcarEspecial('holiday');
                }
                if (btnNadie) {
                    btnNadie.classList.remove('hidden');
                    btnNadie.innerText = "Quitar Nadie va";
                    btnNadie.onclick = () => marcarEspecial('canceled');
                }
            } else if (estaVacante) {
                subtitle.innerText = t('fixed.pending_relevo');
                if (!esMiTurno && btnRelevar) {
                    btnRelevar.classList.remove('hidden');
                    btnRelevar.onclick = tomarRelevo;
                }
                if (btnFestivo) {
                    btnFestivo.classList.remove('hidden');
                    btnFestivo.onclick = () => marcarEspecial('holiday');
                }
                if (btnNadie) {
                    btnNadie.classList.remove('hidden');
                    btnNadie.onclick = () => marcarEspecial('canceled');
                }
            } else if (esMiTurno) {
                subtitle.innerText = t('fixed.te_toca_conducir');
                if (btnPedirRelevo) {
                    btnPedirRelevo.classList.remove('hidden');
                    btnPedirRelevo.onclick = pedirRelevo;
                }
                if (btnFestivo) {
                    btnFestivo.classList.remove('hidden');
                    btnFestivo.onclick = () => marcarEspecial('holiday');
                }
                if (btnNadie) {
                    btnNadie.classList.remove('hidden');
                    btnNadie.onclick = () => marcarEspecial('canceled');
                }

                const alguienMeDebe = state.debts?.some(d =>
                    d.creditor_id === currentUser.id && d.amount > 0
                );

                if (alguienMeDebe && btnCanjearDeuda) {
                    btnCanjearDeuda.classList.remove('hidden');
                    btnCanjearDeuda.onclick = abrirCanjeDeuda;
                }
            } else {
                const d = state.members.find(m => m.user_id === driverId);
                subtitle.innerText = t('fixed.conduce') + " " + (d?.display_name || 'Compañero');
                if (btnFestivo) {
                    btnFestivo.classList.remove('hidden');
                    btnFestivo.innerText = t('fixed.festivo');
                    btnFestivo.onclick = () => marcarEspecial('holiday');
                }
                if (btnNadie) {
                    btnNadie.classList.remove('hidden');
                    btnNadie.innerText = t('fixed.nadie_va');
                    btnNadie.onclick = () => marcarEspecial('canceled');
                }
            }
        }
    }

    modal.classList.remove('hidden');
}

function configurarViaje(type) {
    if (type === 'shared') {
        cerrarModal();
        selectedDays = [];
        document.querySelectorAll('.day-btn-pill').forEach(btn => btn.classList.remove('active'));

        const modalConfig = document.getElementById('modal-config-rutina');
        if (modalConfig) {
            renderOrderSetup();
            // Pre-rellenar el valor de días consecutivos si existe en la rutina actual
            const inputConsecutivos = document.getElementById('consectuvios-input');
            if (inputConsecutivos) {
                inputConsecutivos.value = currentGroup?.metadata?.rutina?.consecutivos || 2;
            }
            modalConfig.classList.remove('hidden');
        }
    } else if (type === 'single') {
        const date = document.getElementById('modal-viaje').dataset.date;
        crearViajePuntualDirecto(date);
    }
}

function toggleDay(day) {
    const btn = document.querySelector(`#modal-config-rutina .day-btn-pill[data-day="${day}"]`);
    if (!btn) return;
    if (selectedDays.includes(day)) {
        selectedDays = selectedDays.filter(d => d !== day);
        btn.classList.remove('active');
    } else {
        selectedDays.push(day);
        btn.classList.add('active');
    }
}

function renderOrderSetup() {
    const cont = document.getElementById('order-setup-list');
    cont.innerHTML = state.members.map((m, i) => `
        <div class="flex items-center justify-between bg-slate-900 p-3 rounded-xl border border-slate-700">
            <span class="text-xs font-bold">${escapeHtml(m.display_name)}</span>
            <input type="number" value="${m.order_index || i + 1}" class="w-12 bg-slate-800 text-center rounded text-indigo-400 font-bold border-none" id="order-input-${i}" onchange="updateOrder(${i})" oninput="updateOrder(${i})">
        </div>
    `).join('');
}

function updateOrder(index) {
    state.members[index].order_index = Number(document.getElementById(`order-input-${index}`).value);
    if (window.renderFixedCalendar) renderFixedCalendar();
}

// Expose functions globally
Object.assign(window, {
    abrirModal,
    cerrarModal,
    abrirMenuViaje,
    configurarViaje,
    toggleDay,
    updateOrder
});
