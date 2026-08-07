// --- GESTIÓN DE DEUDAS ---

/**
 * Simplifica las deudas del grupo actual:
 * 1. Netting mutuo: si A→B y B→A existen, se compensan y queda sólo la neta.
 * 2. Cadenas: si A→B y B→C existen, se crea A→C y se reducen A→B y B→C.
 * Se llama tras cualquier creación/incremento de deuda.
 */
async function simplificarDeudas(groupId) {
    try {
        console.log('[SimplificarDeudas] Iniciando simplificación para grupo:', groupId);
        
        // Obtener todas las deudas activas del grupo
        const { data: debts, error } = await _supabase
            .schema('fixed_carpooling').from('fixed_debts')
            .select('*')
            .eq('group_id', groupId)
            .gt('amount', 0);

        if (error || !debts || debts.length === 0) {
            console.log('[SimplificarDeudas] No hay deudas para simplificar');
            return;
        }
        
        console.log('[SimplificarDeudas] Deudas iniciales:', debts.length, debts);

        let changed = true;
        let iterations = 0;
        const MAX_ITER = 20; // Seguridad ante bucles infinitos

        while (changed && iterations < MAX_ITER) {
            changed = false;
            iterations++;

            // Recargar deudas tras cada ronda de cambios
            const { data: currentDebts } = await _supabase
                .schema('fixed_carpooling').from('fixed_debts')
                .select('*')
                .eq('group_id', groupId)
                .gt('amount', 0);

            if (!currentDebts || currentDebts.length === 0) break;

            // --- PASO 1: Netting mutuo (A→B y B→A) ---
            for (const d of currentDebts) {
                const inverse = currentDebts.find(
                    x => x.creditor_id === d.debtor_id &&
                         x.debtor_id  === d.creditor_id &&
                         x.id !== d.id
                );
                if (!inverse) continue;

                const net = d.amount - inverse.amount;
                changed = true;

                if (net > 0) {
                    // Queda deuda a favor de d.creditor_id
                    await _supabase.schema('fixed_carpooling').from('fixed_debts')
                        .update({ amount: net }).eq('id', d.id);
                    await _supabase.schema('fixed_carpooling').from('fixed_debts')
                        .delete().eq('id', inverse.id);
                } else if (net < 0) {
                    // Queda deuda a favor de inverse.creditor_id
                    await _supabase.schema('fixed_carpooling').from('fixed_debts')
                        .update({ amount: -net }).eq('id', inverse.id);
                    await _supabase.schema('fixed_carpooling').from('fixed_debts')
                        .delete().eq('id', d.id);
                } else {
                    // Se anulan completamente
                    await _supabase.schema('fixed_carpooling').from('fixed_debts')
                        .delete().eq('id', d.id);
                    await _supabase.schema('fixed_carpooling').from('fixed_debts')
                        .delete().eq('id', inverse.id);
                }
                break; // Reiniciar bucle con datos frescos
            }

            if (changed) continue; // Priorizar netting antes de cadenas

            // --- PASO 2: Simplificación de cadenas (A→B y B→C → A→C) ---
            // Recargar tras el netting
            const { data: chainDebts } = await _supabase
                .schema('fixed_carpooling').from('fixed_debts')
                .select('*')
                .eq('group_id', groupId)
                .gt('amount', 0);

            if (!chainDebts) break;

            console.log('[SimplificarDeudas] Procesando cadenas, deudas actuales:', chainDebts.length);

            // Procesar todas las cadenas posibles en esta iteración
            for (const ab of chainDebts) {
                // Buscar B→C (cualquier C, incluyendo A)
                const bc = chainDebts.find(
                    x => x.creditor_id === ab.debtor_id &&
                         x.id !== ab.id
                );
                if (!bc) continue;

                const transfer = Math.min(ab.amount, bc.amount);
                changed = true;
                
                console.log('[SimplificarDeudas] Cadena encontrada:', {
                    ab: `${ab.creditor_id}→${ab.debtor_id} (${ab.amount})`,
                    bc: `${bc.creditor_id}→${bc.debtor_id} (${bc.amount})`,
                    transfer,
                    result: `${ab.creditor_id}→${bc.debtor_id} (+${transfer})`
                });

                // Reducir A→B
                if (ab.amount - transfer <= 0) {
                    await _supabase.schema('fixed_carpooling').from('fixed_debts')
                        .delete().eq('id', ab.id);
                } else {
                    await _supabase.schema('fixed_carpooling').from('fixed_debts')
                        .update({ amount: ab.amount - transfer }).eq('id', ab.id);
                }

                // Reducir B→C
                if (bc.amount - transfer <= 0) {
                    await _supabase.schema('fixed_carpooling').from('fixed_debts')
                        .delete().eq('id', bc.id);
                } else {
                    await _supabase.schema('fixed_carpooling').from('fixed_debts')
                        .update({ amount: bc.amount - transfer }).eq('id', bc.id);
                }

                // Crear o incrementar deuda directa: C le debe a A
                // ab: creditor=A, debtor=B  → B le debe a A
                // bc: creditor=B, debtor=C  → C le debe a B
                // Simplificado: creditor=A, debtor=C → C le debe a A
                const { data: acExisting } = await _supabase
                    .schema('fixed_carpooling').from('fixed_debts')
                    .select('*')
                    .eq('group_id', groupId)
                    .eq('creditor_id', ab.creditor_id)  // A
                    .eq('debtor_id', bc.debtor_id)      // C
                    .maybeSingle();

                if (acExisting) {
                    await _supabase.schema('fixed_carpooling').from('fixed_debts')
                        .update({ amount: acExisting.amount + transfer })
                        .eq('id', acExisting.id);
                } else {
                    await _supabase.schema('fixed_carpooling').from('fixed_debts').insert({
                        group_id: groupId,
                        creditor_id: ab.creditor_id,  // A
                        debtor_id: bc.debtor_id,      // C
                        amount: transfer
                    });
                }

                break; // Reiniciar con datos frescos
            }
        }
        
        console.log('[SimplificarDeudas] Simplificación completada, iteraciones:', iterations);
    } catch (err) {
        console.error('[SimplificarDeudas] Error al simplificar deudas:', err);
    }
}

async function abrirCanjeDeuda() {
    const date = document.getElementById('modal-viaje').dataset.date;
    if (!assertNotPastDate(date)) return;
    const listContainer = document.getElementById('deudas-list');
    if (!listContainer) return;

    listContainer.innerHTML = "";

    // Filtrar deudas donde el deudor NO está de baja
    const misCreditos = state.debts.filter(d => {
        const deudor = state.members.find(m => m.user_id === d.debtor_id);
        return d.creditor_id === currentUser.id && d.amount > 0 && !deudor?.is_on_leave;
    });

    misCreditos.forEach(deuda => {
        const deudor = state.members.find(m => m.user_id === deuda.debtor_id);

        const btn = document.createElement('button');
        btn.className = "w-full p-4 mb-2 bg-indigo-600/20 border border-indigo-500/50 rounded-xl text-left flex justify-between items-center hover:bg-indigo-600/40 transition-all";
        btn.innerHTML = `
            <div class="flex flex-col">
                <span class="text-[10px] uppercase font-black text-indigo-300">${t('fixed.deudor')}</span>
                <span class="font-bold text-white">${escapeHtml(deudor?.display_name || 'Usuario')}</span>
            </div>
            <div class="text-right">
                <span class="block text-[14px] font-black text-white">${deuda.amount}</span>
                <span class="text-[8px] uppercase opacity-50 text-indigo-200">${t('fixed.viajes_pend')}</span>
            </div>
        `;

        btn.onclick = () => ejecutarCanje(deuda, date);
        listContainer.appendChild(btn);
    });

    document.getElementById('modal-deudas').classList.remove('hidden');
}

async function ejecutarCanje(deuda, date) {
    if (!currentGroupId || !currentUser) return;
    if (!assertNotPastDate(date)) return;
    try {
        const { data: existing } = await _supabase.schema('fixed_carpooling').from('fixed_trips')
            .select('id')
            .eq('group_id', currentGroupId)
            .eq('date', date)
            .maybeSingle();

        const payload = {
            group_id: currentGroupId,
            date: date,
            status: 'debt_settled',
            effective_id: deuda.debtor_id,
            type: 'routine_mod',
            creator_id: currentUser.id
        };

        if (existing) {
            await _supabase.schema('fixed_carpooling').from('fixed_trips').update(payload).eq('id', existing.id);
        } else {
            await _supabase.schema('fixed_carpooling').from('fixed_trips').insert(payload);
        }

        if (deuda.amount > 1) {
            await _supabase.schema('fixed_carpooling').from('fixed_debts').update({ amount: deuda.amount - 1 }).eq('id', deuda.id);
        } else {
            await _supabase.schema('fixed_carpooling').from('fixed_debts').delete().eq('id', deuda.id);
        }

        showToast(t('fixed.deuda_canjeada') + " " + (state.members.find(m => m.user_id === deuda.debtor_id)?.display_name));

        document.getElementById('modal-deudas').classList.add('hidden');
        cerrarModal();
        await refreshFixedData();
    } catch (err) {
        console.error(err);
        showToast("Error Supabase: " + (err.message || "desconocido"), "error");
    }
}

async function ejecutarUnionPuntual(trip) {
    if (trip?.date && !assertNotPastDate(trip.date)) return;
    try {
        const pasajeros = trip.metadata?.pasajeros || [];

        if (pasajeros.includes(currentUser.id)) {
            showToast(t('fixed.ya_partes_viaje'), "info");
            cerrarModal();
            return;
        }

        pasajeros.push(currentUser.id);

        const { error: tripError } = await _supabase.schema('fixed_carpooling').from('fixed_trips').update({
            metadata: { ...trip.metadata, pasajeros: pasajeros }
        }).eq('id', trip.id);

        if (tripError) throw tripError;

        const { data: existingDebt } = await _supabase.schema('fixed_carpooling').from('fixed_debts')
            .select('*')
            .eq('group_id', currentGroup.id)
            .eq('creditor_id', trip.effective_id)
            .eq('debtor_id', currentUser.id)
            .maybeSingle();

        if (existingDebt) {
            await _supabase.schema('fixed_carpooling').from('fixed_debts').update({ amount: (existingDebt.amount || 0) + 1 }).eq('id', existingDebt.id);
        } else {
            await _supabase.schema('fixed_carpooling').from('fixed_debts').insert({
                group_id: currentGroup.id,
                creditor_id: trip.effective_id,
                debtor_id: currentUser.id,
                amount: 1
            });
        }

        await simplificarDeudas(currentGroup.id);

        showToast(t('fixed.unido_viaje'));
        await refreshFixedData();
        cerrarModal();

    } catch (err) {
        console.error("Error al unirse:", err);
        showToast(t('fixed.error_union'), "error");
    }
}

async function abrirCrearDeuda() {
    const listContainer = document.getElementById('crear-deuda-list');
    if (!listContainer) return;

    listContainer.innerHTML = "";

    // Filtrar miembros excluyendo al usuario actual y a los que están de baja
    const otrosMiembros = state.members.filter(m => m.user_id !== currentUser.id && !m.is_on_leave);

    if (otrosMiembros.length === 0) {
        listContainer.innerHTML = `<p class="text-center text-slate-400 text-[10px] uppercase font-bold py-8">${t('shared.no_miembros')}</p>`;
        document.getElementById('modal-crear-deuda').classList.remove('hidden');
        return;
    }

    otrosMiembros.forEach(miembro => {
        const btn = document.createElement('button');
        btn.className = "w-full p-4 mb-2 bg-emerald-600/20 border border-emerald-500/50 rounded-xl text-left flex justify-between items-center hover:bg-emerald-600/40 transition-all";
        btn.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-4 h-4 rounded-full" style="background: ${miembro.color}"></div>
                <span class="font-bold text-white">${escapeHtml(miembro.display_name)}</span>
            </div>
            <i class="fas fa-plus text-emerald-400"></i>
        `;

        btn.onclick = () => crearDeudaManual(miembro.user_id);
        listContainer.appendChild(btn);
    });

    document.getElementById('modal-crear-deuda').classList.remove('hidden');
}

async function crearDeudaManual(deudorId) {
    try {
        if (!currentGroup) throw new Error("No active group");

        // Verificar si ya existe una deuda
        const { data: existingDebt } = await _supabase.schema('fixed_carpooling').from('fixed_debts')
            .select('*')
            .eq('group_id', currentGroup.id)
            .eq('creditor_id', currentUser.id)
            .eq('debtor_id', deudorId)
            .maybeSingle();

        if (existingDebt) {
            // Incrementar la deuda existente
            await _supabase.schema('fixed_carpooling').from('fixed_debts')
                .update({ amount: (existingDebt.amount || 0) + 1 })
                .eq('id', existingDebt.id);
        } else {
            // Crear nueva deuda
            await _supabase.schema('fixed_carpooling').from('fixed_debts').insert({
                group_id: currentGroup.id,
                creditor_id: currentUser.id,
                debtor_id: deudorId,
                amount: 1
            });
        }

        await simplificarDeudas(currentGroup.id);

        const deudor = state.members.find(m => m.user_id === deudorId);
        showToast(t('fixed.deuda_creada') + ": " + (deudor?.display_name || 'Usuario'));

        document.getElementById('modal-crear-deuda').classList.add('hidden');
        await refreshFixedData();
    } catch (err) {
        console.error("Error al crear deuda:", err);
        showToast(t('fixed.error_deuda'), "error");
    }
}

// --- VER TABLA DE DEUDAS ---

async function abrirTablaDeudas() {
    const tbody = document.getElementById('tabla-deudas-body');
    if (!tbody) return;

    tbody.innerHTML = "";

    // Filtrar deudas con cantidad mayor a 0
    const deudasActivas = state.debts.filter(d => d.amount > 0);

    if (deudasActivas.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3" class="text-center py-6 text-slate-400 text-sm">${t('fixed.sin_deudas')}</td>
            </tr>
        `;
    } else {
        deudasActivas.forEach(deuda => {
            const acreedor = state.members.find(m => m.user_id === deuda.creditor_id);
            const deudor = state.members.find(m => m.user_id === deuda.debtor_id);

            const row = document.createElement('tr');
            row.className = "border-b border-slate-700/50 hover:bg-slate-800/30 transition-colors";
            row.innerHTML = `
                <td class="py-3 px-2">
                    <div class="flex items-center gap-2">
                        <div class="w-3 h-3 rounded-full" style="background: ${acreedor?.color || '#6366f1'}"></div>
                        <span class="text-white font-bold text-sm">${escapeHtml(acreedor?.display_name || 'Usuario')}</span>
                    </div>
                </td>
                <td class="py-3 px-2">
                    <div class="flex items-center gap-2">
                        <div class="w-3 h-3 rounded-full" style="background: ${deudor?.color || '#6366f1'}"></div>
                        <span class="text-white font-bold text-sm">${escapeHtml(deudor?.display_name || 'Usuario')}</span>
                    </div>
                </td>
                <td class="py-3 px-2 text-center">
                    <span class="inline-block bg-amber-500/20 text-amber-400 font-black text-sm px-3 py-1 rounded-lg">${deuda.amount}</span>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    document.getElementById('modal-tabla-deudas').classList.remove('hidden');
}

// Expose functions globally
Object.assign(window, {
    abrirCanjeDeuda,
    ejecutarCanje,
    ejecutarUnionPuntual,
    abrirCrearDeuda,
    crearDeudaManual,
    abrirTablaDeudas,
    simplificarDeudas
});
