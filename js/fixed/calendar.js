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
                <div class="w-3 h-3 rounded-full" style="background: ${escapeHtml(m.color || '#334155')}"></div>
                <span class="text-[10px] font-bold uppercase text-slate-400">${escapeHtml(m.display_name)}${m.is_on_leave ? ' ' + t('fixed.de_baja') : ''}</span>
            </div>
        `).join('');
    }
}

function formatLocalDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getMembersSorted() {
    return [...state.members].sort((a, b) => a.order_index - b.order_index);
}

/** Leave period start that covers dateStr for this member (open leave or history). */
function leaveAnchorOn(member, dateStr) {
    if (!member || !dateStr) return null;

    const history = Array.isArray(member.leave_history) ? member.leave_history : [];
    for (const period of history) {
        if (!period?.from) continue;
        const to = period.to || period.from;
        if (dateStr >= period.from && dateStr <= to) return period.from;
    }

    if (member.is_on_leave) {
        const since = member.leave_since || todayStr();
        if (dateStr >= since) return since;
    }

    return null;
}

/** Rutina days from fromStr..toStr inclusive, minus holiday/canceled on those days. */
function countEffectiveRutinaDaysInRange(fromStr, toStr, dias) {
    if (!fromStr || !toStr || fromStr > toStr) return 0;

    const inactive = new Set(
        (state.trips || [])
            .filter(t => {
                const esInactivo = t.status === 'holiday' || t.status === 'canceled';
                return esInactivo && t.date >= fromStr && t.date <= toStr;
            })
            .map(t => t.date)
    );

    let count = 0;
    const cursor = parseLocalDate(fromStr);
    const end = parseLocalDate(toStr);
    while (cursor <= end) {
        const ds = formatLocalDate(cursor);
        if (dias.includes(cursor.getDay()) && !inactive.has(ds)) {
            count++;
        }
        cursor.setDate(cursor.getDate() + 1);
    }
    return count;
}

/** Effective rutina-day count from rutina start through dateStr (inclusive). */
function getEffectiveCountThrough(dateStr, dias, startDate) {
    const startStr = formatLocalDate(startDate);
    return countEffectiveRutinaDaysInRange(startStr, dateStr, dias);
}

function getFullRosterDriverId(dateStr, dias, startDate, consecutivos) {
    const membersSorted = getMembersSorted();
    const n = membersSorted.length;
    if (!n) return null;

    const targetDate = parseLocalDate(dateStr);
    if (!dias.includes(targetDate.getDay())) return null;
    if (targetDate < startDate) return null;

    const effectiveCount = getEffectiveCountThrough(dateStr, dias, startDate);
    if (effectiveCount <= 0) return null;

    const memberIndex = Math.floor((effectiveCount - 1) / consecutivos) % n;
    return membersSorted[memberIndex]?.user_id || null;
}

/**
 * First rutina day on/after leave anchors where the full-roster driver is on leave (as of asOfDateStr).
 * Returns { startStr, leaveMember } or null.
 */
function findDisplacementStart(asOfDateStr, dias, startDate, consecutivos) {
    const membersSorted = getMembersSorted();
    const onLeave = membersSorted.filter(m => wasOnLeaveOn(m, asOfDateStr));
    if (!onLeave.length) return null;

    const anchors = onLeave.map(m => leaveAnchorOn(m, asOfDateStr)).filter(Boolean);
    if (!anchors.length) return null;

    const startStr = formatLocalDate(startDate);
    let walkStr = anchors.reduce((a, b) => (a < b ? a : b));
    if (walkStr < startStr) walkStr = startStr;

    const cursor = parseLocalDate(walkStr);
    // Safety: search up to ~2 years for the first leave-owned turn
    const limit = parseLocalDate(walkStr);
    limit.setFullYear(limit.getFullYear() + 2);

    while (cursor <= limit) {
        const ds = formatLocalDate(cursor);
        if (dias.includes(cursor.getDay())) {
            const driverId = getFullRosterDriverId(ds, dias, startDate, consecutivos);
            const driver = membersSorted.find(m => m.user_id === driverId);
            if (driver && wasOnLeaveOn(driver, asOfDateStr)) {
                return { startStr: ds, leaveMember: driver };
            }
        }
        cursor.setDate(cursor.getDate() + 1);
    }

    return null;
}

/** Active members in circular order starting after leaveMember (skip anyone on leave that day). */
function getActiveRotatedAfter(leaveMember, dateStr) {
    const membersSorted = getMembersSorted();
    const n = membersSorted.length;
    if (!n || !leaveMember) return [];

    let startIdx = membersSorted.findIndex(m => m.user_id === leaveMember.user_id);
    if (startIdx < 0) startIdx = 0;

    const active = [];
    for (let i = 1; i <= n; i++) {
        const m = membersSorted[(startIdx + i) % n];
        if (!wasOnLeaveOn(m, dateStr)) active.push(m);
    }
    return active;
}

function getRecommendedDriver(dateStr) {
    if (!state.members.length) return null;

    const rutina = currentGroup?.metadata?.rutina;
    if (!rutina || !rutina.dias || rutina.dias.length === 0) return null;

    const { dias, fecha_inicio } = rutina;
    if (!dias || dias.length === 0) return null;

    const consecutivos = rutina.consecutivos || 2;
    const startRaw = (fecha_inicio || '2025-01-01').slice(0, 10);
    const startDate = parseLocalDate(startRaw);
    startDate.setHours(0, 0, 0, 0);

    const targetDate = parseLocalDate(dateStr);
    targetDate.setHours(0, 0, 0, 0);
    if (!dias.includes(targetDate.getDay())) return null;
    if (targetDate < startDate) return null;

    const fullDriverId = getFullRosterDriverId(dateStr, dias, startDate, consecutivos);
    if (!fullDriverId) return null;

    const anyoneOnLeave = state.members.some(m => wasOnLeaveOn(m, dateStr));
    if (!anyoneOnLeave) return fullDriverId;

    const displacement = findDisplacementStart(dateStr, dias, startDate, consecutivos);
    if (!displacement || dateStr < displacement.startStr) {
        // Before the leave person's first turn: keep full roster
        return fullDriverId;
    }

    const active = getActiveRotatedAfter(displacement.leaveMember, dateStr);
    if (!active.length) return null;

    const days = countEffectiveRutinaDaysInRange(displacement.startStr, dateStr, dias);
    if (days <= 0) return null;

    const memberIndex = Math.floor((days - 1) / consecutivos) % active.length;
    return active[memberIndex]?.user_id || null;
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
