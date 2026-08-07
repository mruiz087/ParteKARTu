// ========== FIXED CARPOOLING CALENDAR ==========
// Adapted from GidApp js/calendar.js


async function renderFixedCalendar() {
    const grid = document.getElementById('calendar-grid');
    const title = document.getElementById('calendar-month-year');
    if (!grid) return;

    grid.innerHTML = '';
    const y = viewDate.getFullYear();
    const m = viewDate.getMonth();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const monthYear = viewDate.toLocaleString(currentLang === 'eu' ? 'eu-ES' : 'es-ES', { month: 'long', year: 'numeric' });
    if (title) title.innerText = monthYear;

    const firstDay = new Date(y, m, 1).getDay();
    const adjFirstDay = firstDay === 0 ? 6 : firstDay - 1;
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    for (let x = 0; x < adjFirstDay; x++) grid.appendChild(document.createElement('div'));

    for (let i = 1; i <= daysInMonth; i++) {
        const dStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const cellDate = new Date(y, m, i);
        const isPast = cellDate < today;
        const isToday = cellDate.getTime() === today.getTime();

        const trip = state.trips.find(t => t.date === dStr);
        const defaultDriverId = getRecommendedDriver(dStr);
        let driverId = trip?.effective_id !== undefined ? trip.effective_id : defaultDriverId;

        const cell = document.createElement('div');
        cell.className = `fixed-day-cell ${isPast ? 'fixed-day-past' : ''} ${isToday ? 'today' : ''} flex flex-col items-center justify-center relative`;

        if (trip?.status === 'holiday') {
            cell.style.backgroundColor = '#7f1d1d';
            cell.innerHTML = `
                <span class="text-[10px] font-bold text-white">${i}</span>
                <i class="fas fa-star text-amber-400 text-[10px] mt-1"></i>
            `;
        } else if (trip?.status === 'canceled') {
            cell.innerHTML = `
                <span class="text-[10px] font-bold text-slate-400">${i}</span>
                <i class="fas fa-times text-slate-500 text-[10px] mt-1"></i>
            `;
        } else if (trip?.status === 'pending_relevo') {
            cell.classList.add('warning-bg');
            cell.innerHTML = `
                <span class="text-[10px] font-bold text-white">${i}</span>
                <i class="fas fa-exclamation-triangle text-amber-500 text-[10px]"></i>
            `;
        } else if (driverId) {
            const driver = state.members.find(m => m.user_id === driverId);
            cell.style.borderColor = driver?.color || '#334155';

            let symbol = '';
            if (trip?.type === 'single') {
                symbol = '<i class="fas fa-car text-yellow-400 text-[10px] my-0.5"></i>';
            } else if (trip?.status === 'substituted') {
                symbol = '<i class="fas fa-exchange-alt text-indigo-400 text-[10px] my-0.5"></i>';
            } else if (trip?.status === 'debt_settled') {
                symbol = '<i class="fas fa-handshake text-emerald-400 text-[10px] my-0.5"></i>';
            }

            cell.innerHTML = `
                <span class="text-[10px] font-bold text-white">${i}</span>
                ${symbol}
            `;
        } else {
            cell.innerHTML = `<span class="text-[10px] font-bold text-slate-600">${i}</span>`;
        }

        if (!isPast && window.abrirMenuViaje) cell.onclick = () => abrirMenuViaje(dStr, trip, driverId);
        grid.appendChild(cell);
    }

    // Render legend
    const legend = document.getElementById('calendar-legend');
    if (legend) {
        legend.innerHTML = state.members.map(m => `
            <div class="flex items-center gap-1.5 ${m.is_on_leave ? 'opacity-50' : ''}">
                <div class="w-3 h-3 rounded-full" style="background: ${m.color}"></div>
                <span class="text-[10px] font-bold uppercase text-slate-400">${m.display_name}${m.is_on_leave ? ' ' + t('fixed.de_baja') : ''}</span>
            </div>
        `).join('');
    }
}

function getRecommendedDriver(dateStr) {
    if (!state.members.length) return null;

    const rutina = currentGroup?.metadata?.rutina;
    if (!rutina || !rutina.dias || rutina.dias.length === 0) return null;

    const { dias, fecha_inicio } = rutina;
    if (!dias || dias.length === 0) return null;

    const targetDate = parseLocalDate(dateStr);
    targetDate.setHours(0, 0, 0, 0);

    if (!dias.includes(targetDate.getDay())) return null;

    const startRaw = (fecha_inicio || '2025-01-01').slice(0, 10);
    const startDate = parseLocalDate(startRaw);
    startDate.setHours(0, 0, 0, 0);

    if (targetDate < startDate) return null;

    let totalRutinaDays = 0;
    let tempDate = new Date(startDate);
    while (tempDate <= targetDate) {
        if (dias.includes(tempDate.getDay())) {
            totalRutinaDays++;
        }
        tempDate.setDate(tempDate.getDate() + 1);
    }

    const skippedDays = state.trips.filter(t => {
        const tDate = parseLocalDate(t.date);
        tDate.setHours(0, 0, 0, 0);
        const esDiaRutina = dias.includes(tDate.getDay());
        const esInactivo = (t.status === 'holiday' || t.status === 'canceled');
        return esDiaRutina && esInactivo && tDate < targetDate;
    }).length;

    // Full roster keeps cycle length stable; leave shifts turn to next active member
    const membersSorted = [...state.members].sort((a, b) => a.order_index - b.order_index);
    const n = membersSorted.length;
    if (n === 0) return null;

    const effectiveCount = totalRutinaDays - skippedDays;
    let memberIndex = Math.floor((effectiveCount - 1) / (rutina.consecutivos || 2)) % n;

    for (let attempt = 0; attempt < n; attempt++) {
        const candidate = membersSorted[memberIndex];
        if (!wasOnLeaveOn(candidate, dateStr)) {
            return candidate.user_id;
        }
        memberIndex = (memberIndex + 1) % n;
    }

    return null;
}

async function refrescarCalendario() {
    await refreshFixedData();
    showToast(t('fixed.calendario_actualizado'));
}

async function refreshFixedData() {
    if (!currentGroupId) return;

    // Reload members
    const { data: mems } = await _supabase.schema('fixed_carpooling').from('fixed_members')
        .select('*')
        .eq('group_id', currentGroupId);
    state.members = mems || [];
    groupMembers = mems || [];

    // Reload trips
    const { data: trips } = await _supabase.schema('fixed_carpooling').from('fixed_trips')
        .select('*')
        .eq('group_id', currentGroupId);
    state.trips = trips || [];
    allTrips = trips || [];

    // Reload debts
    const { data: debts } = await _supabase.schema('fixed_carpooling').from('fixed_debts')
        .select('*')
        .eq('group_id', currentGroupId);
    state.debts = debts || [];

    renderFixedCalendar();
}

// Expose functions
Object.assign(window, {
    renderFixedCalendar,
    getRecommendedDriver,
    refrescarCalendario,
    refreshFixedData
});
