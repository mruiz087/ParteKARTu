// --- PERFIL Y AJUSTES ---

function changeLanguage(lang) {
    setLanguage(lang);
    applyTranslations();
    const langName = lang === 'es' ? 'Español' : 'Euskera';
    showToast(t('fixed.idioma_changed') + " " + langName);
}

async function clearFutureDriverOverrides(userId, fromDateStr) {
    if (!currentGroupId || !userId || !fromDateStr) return;

    const { data: futureTrips, error } = await _supabase.schema('fixed_carpooling').from('fixed_trips')
        .select('id, date, effective_id, type, status')
        .eq('group_id', currentGroupId)
        .eq('effective_id', userId)
        .gte('date', fromDateStr);

    if (error) {
        console.error('Error loading future trips for leave adaptation:', error);
        return;
    }

    for (const trip of (futureTrips || [])) {
        const payload = trip.type === 'single'
            ? { effective_id: null, status: 'canceled' }
            : { effective_id: null, status: 'pending_relevo' };

        const { error: updErr } = await _supabase.schema('fixed_carpooling').from('fixed_trips')
            .update(payload)
            .eq('id', trip.id);

        if (updErr) console.warn('Error clearing future driver override:', trip.id, updErr);
    }
}

async function toggleOnLeave() {
    if (!currentGroup) return;

    const currentMember = state.members.find(m => m.user_id === currentUser.id);
    if (!currentMember) return;

    const isCurrentlyOnLeave = currentMember.is_on_leave || false;
    const confirmMessage = isCurrentlyOnLeave ? t('fixed.confirm_volver_baja') : t('fixed.confirm_baja');

    if (!await showConfirm(confirmMessage)) return;

    try {
        const today = todayStr();
        let payload;

        if (!isCurrentlyOnLeave) {
            // Enter leave from today onward
            payload = {
                is_on_leave: true,
                leave_since: today
            };
        } else {
            // Return from leave: close open period into history (past stays excluded)
            const history = Array.isArray(currentMember.leave_history)
                ? [...currentMember.leave_history]
                : [];
            const since = currentMember.leave_since;
            if (since) {
                const to = yesterdayStr();
                if (since <= to) {
                    history.push({ from: since, to });
                }
                // same-day leave+return: no history entry (never affected a past day)
            }

            payload = {
                is_on_leave: false,
                leave_since: null,
                leave_history: history
            };
        }

        const { error } = await _supabase.schema('fixed_carpooling').from('fixed_members')
            .update(payload)
            .eq('user_id', currentUser.id)
            .eq('group_id', currentGroup.id);

        if (error) throw error;

        Object.assign(currentMember, payload);

        if (!isCurrentlyOnLeave) {
            await clearFutureDriverOverrides(currentUser.id, today);
        }

        showToast(!isCurrentlyOnLeave ? t('fixed.baja_marcada') : t('fixed.baja_quitada'));
        updateOnLeaveButton();
        await refreshFixedData();
    } catch (err) {
        console.error("Error al cambiar estado de baja:", err);
        showToast(t('fixed.error_guardar'), "error");
    }
}

function updateOnLeaveButton() {
    const btn = document.getElementById('btn-toggle-baja');
    if (!btn || !currentGroup) return;

    const currentMember = state.members.find(m => m.user_id === currentUser.id);
    const isOnLeave = currentMember?.is_on_leave || false;

    if (isOnLeave) {
        btn.setAttribute('data-i18n', 'fixed.volver_baja');
        btn.textContent = t('fixed.volver_baja');
        btn.className = "w-full py-4 bg-amber-900/20 border border-amber-500/30 text-amber-400 text-[10px] font-black uppercase rounded-xl hover:bg-amber-900/40 transition-all";
    } else {
        btn.setAttribute('data-i18n', 'fixed.estoy_de_baja');
        btn.textContent = t('fixed.estoy_de_baja');
        btn.className = "w-full py-4 bg-amber-900/20 border border-amber-500/30 text-amber-400 text-[10px] font-black uppercase rounded-xl hover:bg-amber-900/40 transition-all";
    }
}

Object.assign(window, {
    toggleOnLeave,
    updateOnLeaveButton,
    clearFutureDriverOverrides
});
