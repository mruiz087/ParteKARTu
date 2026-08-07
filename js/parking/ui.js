// State for weekly view
let currentWeekOffset = 0; // 0 = current week, -1 = last week, etc.
window.currentGroupId = window.currentGroupId || null;

function getStartOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
    return new Date(d.setDate(diff));
}

function getISOWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function changeWeek(offset) {
    if (offset === 0) {
        currentWeekOffset = 0;
    } else {
        currentWeekOffset += offset;
    }
    renderParkingCalendar();
}

function renderParkingCalendar() {
    const grid = document.getElementById('parking-calendar-grid');
    if (!grid) return;
    grid.innerHTML = '';

    // Calculate start of the week based on offset
    const today = new Date();
    const startOfCurrentWeek = getStartOfWeek(today);
    const viewStart = new Date(startOfCurrentWeek);
    viewStart.setDate(viewStart.getDate() + (currentWeekOffset * 7));

    // Update Header
    const endOfWeek = new Date(viewStart);
    endOfWeek.setDate(endOfWeek.getDate() + 6);

    const options = { month: 'short', day: 'numeric' };
    const dateRange = `${viewStart.toLocaleDateString('es-ES', options)} - ${endOfWeek.toLocaleDateString('es-ES', options)}`;
    const year = viewStart.getFullYear();
    const weekNum = getISOWeekNumber(viewStart);

    document.getElementById('parking-month-year').innerText = `${dateRange} ${year} (${t('parking.semana')}${weekNum})`;

    // Update buttons in index.html to call changeWeek instead of changeMonth
    // We might need to override the onclick attributes dynamically or hardcode them in HTML
    const prevBtn = document.querySelector('#view-group-detail-parking .fa-chevron-left').parentElement;
    const nextBtn = document.querySelector('#view-group-detail-parking .fa-chevron-right').parentElement;

    prevBtn.onclick = () => changeWeek(-1);
    nextBtn.onclick = () => changeWeek(1);

    // Render 7 days
    const startDate = window.parkingState?.startDate || new Date(2025, 0, 6);

    for (let i = 0; i < 7; i++) {
        const currentDate = new Date(viewStart);
        currentDate.setDate(currentDate.getDate() + i);

        const d = currentDate.getDate();

        // Calculate week index for logic
        const weeksPassed = Math.floor((currentDate - startDate) / (1000 * 60 * 60 * 24 * 7));

        // Logic Calculation
        const N = window.parkingState?.spots?.length || 0;
        const U = window.parkingState?.members?.length || 0;

        // Render cell content
        let cellContent = `<span class="text-[8px] font-bold text-slate-600">${d}</span>`;
        if (currentDate.toDateString() === today.toDateString()) {
            cellContent = `<span class="text-[8px] font-bold text-emerald-400">${d}</span>`;
        }

        // Add CLICK handler
        const dateStr = currentDate.toISOString();

        // Calculate assignments for this day
        const assignments = getAssignmentsForDate(currentDate);

        const myId = currentUser.id;
        const myAssign = assignments.find(a => a.user.user_id === myId);
        const isMyTurn = myAssign && myAssign.isAttending;
        const hasSpot = myAssign && myAssign.finalSpotName !== null;
        const isFixedSpot = myAssign && myAssign.isFixedSpot;

        // isReserve is true if I am attending but have no spot
        const isReserve = isMyTurn && !hasSpot;

        const isToday = currentDate.toDateString() === today.toDateString();
        const isPast = currentDate < new Date(today.getFullYear(), today.getMonth(), today.getDate());

        const cell = document.createElement('div');
        cell.className = `calendar-cell flex flex-col items-center justify-center p-1 rounded-xl border transition-all ${isPast ? 'opacity-30' : 'cursor-pointer hover:bg-slate-800'}`;

        if (isToday) cell.classList.add('ring-1', 'ring-emerald-500', 'bg-emerald-500/10');
        else if (hasSpot) cell.classList.add('border-emerald-500/50', 'bg-emerald-500/5');
        else cell.classList.add('bg-slate-900/40', 'border-slate-800');

        let spotAnnotation = '';
        if (hasSpot) {
            const lockIcon = isFixedSpot ? '<i class="fas fa-lock text-[6px] mr-0.5"></i>' : '';
            spotAnnotation = `<span class="text-[8px] font-black text-emerald-400 uppercase mt-1 leading-none">${lockIcon}${myAssign.finalSpotName}</span>`;
        } else if (isReserve) {
            // Check if I was originally a spot owner but marked as not attending?
            // "isReserve" here means current status. If I am R1 and get P1, hasSpot is true.
            // If I am R1 and don't get spot, isReserve is true.
            spotAnnotation = `<span class="text-[8px] font-black text-amber-500 uppercase mt-1 leading-none">RES</span>`;
        }

        // Only show info if someone attends
        const attendingCount = assignments.filter(a => a.status !== 'not_attending').length;

        cell.innerHTML = `
            <span class="text-[8px] font-black text-slate-500 uppercase mb-0.5">${currentDate.toLocaleDateString('es-ES', { weekday: 'short' }).substring(0, 2)}</span>
            <span class="text-xs font-black ${isToday ? 'text-emerald-400' : 'text-slate-200'} leading-none">${currentDate.getDate()}</span>
            <div class="h-4 flex items-center justify-center">
                ${(attendingCount > 0) ? spotAnnotation : ''}
            </div>
        `;

        if (!isPast) {
            cell.onclick = () => window.openParkingDayDetail(currentDate.toISOString());
        }
        grid.appendChild(cell);
    }
}

function renderDayCell(container, dayNum, innerHTML, extraClasses = '', inlineStyle = '', onClick = null) {
    const el = document.createElement('div');
    el.className = `fixed-day-cell flex flex-col items-center justify-center relative border ${extraClasses}`;
    if (inlineStyle) el.style = inlineStyle;
    el.innerHTML = innerHTML;
    if (onClick) el.onclick = onClick;
    container.appendChild(el);
}

function refreshParkingData() {
    if (window.currentGroupId) {
        loadParkingGroupDetail(window.currentGroupId, document.getElementById('parking-group-title').innerText);
    }
}

// Make functions global
window.openSpotManagementModal = openSpotManagementModal;
window.closeSpotManagementModal = closeSpotManagementModal;
window.handleAddSpot = handleAddSpot;
window.handleDeleteSpot = handleDeleteSpot;
window.renderParkingCalendar = renderParkingCalendar;
window.refreshParkingData = refreshParkingData;
window.openParkingDayDetail = openParkingDayDetail;
window.closeParkingDayDetail = closeParkingDayDetail;
window.openParkingMembersModal = openParkingMembersModal;
window.closeParkingMembersModal = closeParkingMembersModal;
window.openRoutineModal = openRoutineModal;
window.closeRoutineModal = closeRoutineModal;
window.toggleRoutineDay = toggleRoutineDay;
window.saveRoutine = saveRoutine;
window.handleToggleAttendance = handleToggleAttendance;

let selectedRoutineDays = [];
let currentDetailDateStr = null;

function openParkingDayDetail(dateIsoStr) {
    const date = new Date(dateIsoStr);
    currentDetailDateStr = dateIsoStr.split('T')[0];

    const N = window.parkingState.spots.length;
    const U = window.parkingState.members.length;
    if (N === 0 || U === 0) return;

    const startDate = window.parkingState.startDate || new Date(2025, 0, 6);
    const weeksPassed = Math.floor((date - startDate) / (1000 * 60 * 60 * 24 * 7));
    const mold = window.getMold(N, U);
    const rotationOffset = (U > N) ? weeksPassed : 0;
    const rotatedMembers = window.rotateUsers(window.parkingState.members, rotationOffset);

    // 1. Identificar interesados
    const dayOfWeek = date.getDay() || 7;
    const interestedIds = rotatedMembers.filter(m => {
        const override = window.parkingState.attendance[currentDetailDateStr]?.find(a => a.user_id === m.user_id);
        if (override) return override.is_attending;
        return m.routine && m.routine.includes(dayOfWeek);
    }).map(m => m.user_id);

    // 2. Reuse shared logic
    const assignments = getAssignmentsForDate(date);

    // --- RENDERIZADO (Separar fijos de compartidos) ---
    const list = document.getElementById('parking-assignments-list');
    
    const fixedSpotAssignments = assignments.filter(a => a.isFixedSpot);
    const sharedAssignments = assignments.filter(a => !a.isFixedSpot);
    
    let html = '';
    
    // Sección de plazas fijas
    if (fixedSpotAssignments.length > 0) {
        html += `<div class="mb-4">
            <h4 class="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                <i class="fas fa-lock"></i> Plazas Fijas
            </h4>`;
        
        html += fixedSpotAssignments.map((a) => {
            const isMe = a.user.user_id === currentUser.id;
            
            let statusLabel = "NO ASISTE";
            let statusColor = "text-slate-500";
            let rowBg = "bg-slate-800/50 border-slate-700";
            let badgeText = a.spotName || 'Unknown';
            
            if (a.isAttending) {
                statusLabel = "EN SU PLAZA";
                statusColor = "text-indigo-400";
                rowBg = "bg-indigo-900/20 border-indigo-500/30";
                badgeText = a.spotName;
            } else {
                statusLabel = "PLAZA LIBRE";
                statusColor = "text-emerald-400";
                rowBg = "bg-emerald-900/10 border-emerald-500/20";
            }
            
            return `
                <div class="flex items-center justify-between p-3 rounded-xl border ${rowBg} ${isMe ? 'ring-1 ring-indigo-400' : ''} ${!a.isAttending ? 'opacity-50' : ''}">
                    <div class="flex items-center gap-3">
                        <div class="flex flex-col">
                            <span class="text-white font-bold text-sm ${isMe ? 'text-indigo-300' : ''}">${escapeHtml(a.user.display_name)}</span>
                            <span class="text-[10px] uppercase tracking-widest font-black ${statusColor}">${statusLabel}</span>
                        </div>
                    </div>
                    <div class="text-right">
                        <span class="font-black text-xs px-3 py-1.5 rounded-lg ${a.isAttending ? 'bg-indigo-500 text-white' : 'bg-emerald-500/20 text-emerald-400'}">
                            <i class="fas fa-lock text-[8px] mr-1"></i>${badgeText}
                        </span>
                    </div>
                </div>
            `;
        }).join('');
        
        html += `</div>`;
    }
    
    // Sección de plazas compartidas
    html += `<div>
        <h4 class="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-2 flex items-center gap-2">
            <i class="fas fa-users"></i> Plazas Compartidas
        </h4>`;
    
    html += sharedAssignments.map((a) => {
        const isMe = a.user.user_id === currentUser.id;
        const isOriginalOwner = a.moldValue.startsWith('P');
        const assignedFixedSpot = a.assignedFixedSpot;

        let statusLabel = "DESAPUNTADO";
        let statusColor = "text-slate-500";
        let rowBg = "bg-slate-800/50 border-slate-700";
        let badgeText = a.moldValue;

        if (a.isAttending) {
            if (a.finalSpotName) {
                if (assignedFixedSpot) {
                    statusLabel = "PLAZA FIJA ASIGNADA";
                    statusColor = "text-indigo-400";
                    rowBg = "bg-indigo-900/20 border-indigo-500/30";
                } else {
                    statusLabel = isOriginalOwner ? "TIENE PLAZA" : "RESERVA CON PLAZA";
                    statusColor = "text-emerald-400";
                    rowBg = "bg-emerald-900/20 border-emerald-500/30";
                }
                badgeText = a.finalSpotName;
            } else {
                statusLabel = "EN RESERVA";
                statusColor = "text-amber-400";
                badgeText = a.moldValue;
            }
        }

        return `
            <div class="flex items-center justify-between p-3 rounded-xl border ${rowBg} ${isMe ? 'ring-1 ring-emerald-400' : ''} ${!a.isAttending ? 'opacity-40' : ''}">
                <div class="flex items-center gap-3">
                    <div class="flex flex-col">
                        <span class="text-white font-bold text-sm ${isMe ? 'text-emerald-300' : ''}">${escapeHtml(a.user.display_name)}</span>
                        <div class="flex items-center gap-2">
                             <span class="text-[9px] font-black px-1.5 bg-slate-900 text-slate-400 rounded border border-slate-700">${a.moldValue}</span>
                             <span class="text-[10px] uppercase tracking-widest font-black ${statusColor}">${statusLabel}</span>
                        </div>
                    </div>
                </div>
                <div class="text-right">
                    <span class="font-black text-xs px-3 py-1.5 rounded-lg ${a.finalSpotName ? (assignedFixedSpot ? 'bg-indigo-500 text-white' : 'bg-emerald-500 text-white') : 'bg-slate-700 text-slate-400'}">
                        ${assignedFixedSpot ? '<i class="fas fa-lock text-[8px] mr-1"></i>' : ''}${badgeText}
                    </span>
                </div>
            </div>
        `;
    }).join('');
    
    html += `</div>`;
    
    list.innerHTML = html;

    // ActualizarUI básica del modal
    document.getElementById('parking-detail-date').innerText = date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    document.getElementById('modal-parking-day-detail').classList.remove('hidden');
    document.getElementById('check-parking-attendance').checked = interestedIds.includes(currentUser.id);
}

function getAssignmentsForDate(date) {
    const N = window.parkingState?.spots?.length || 0;
    const U = window.parkingState?.members?.length || 0;
    if (N === 0 || U === 0) return [];

    const dateIsoStr = date.toISOString().split('T')[0];
    const startDate = window.parkingState.startDate || new Date(2025, 0, 6);

    // Calculate weeksPassed based on Mondays to align rotation
    const startMonday = getStartOfWeek(new Date(startDate));
    startMonday.setHours(0, 0, 0, 0);
    const currentMonday = getStartOfWeek(new Date(date));
    currentMonday.setHours(0, 0, 0, 0);
    const diffTime = currentMonday - startMonday;
    const weeksPassed = Math.round(diffTime / (1000 * 60 * 60 * 24 * 7));

    // Separate fixed spot users from shared users
    const fixedSpotUsers = window.parkingState.members.filter(m => m.has_fixed_spot);
    const sharedUsers = window.parkingState.members.filter(m => !m.has_fixed_spot);
    const sharedU = sharedUsers.length;

    // Calculate N for shared spots only (exclude fixed spots)
    const sharedSpots = window.parkingState.spots.filter(s => !s.is_fixed_spot);
    const sharedN = sharedSpots.length;

    const dayOfWeek = date.getDay() || 7;

    // 1. Identify interested users (both fixed and shared)
    const interestedIds = window.parkingState.members.filter(m => {
        const override = window.parkingState.attendance[dateIsoStr]?.find(a => a.user_id === m.user_id);
        if (override) return override.is_attending;
        return m.routine && m.routine.includes(dayOfWeek);
    }).map(m => m.user_id);

    // 2. Process fixed spot users first
    let fixedSpotAssignments = fixedSpotUsers.map(member => {
        const isAttending = interestedIds.includes(member.user_id);
        const spot = window.parkingState.spots.find(s => s.id === member.fixed_spot_id);
        const spotName = spot?.name || 'Unknown';
        
        return {
            user: member,
            moldValue: 'FIXED',
            isAttending: isAttending,
            finalSpotName: isAttending ? spotName : null,
            priority: 0,
            isFixedSpot: true,
            spotName: spotName,
            spotAvailable: !isAttending
        };
    });

    // 3. Process shared users with rotation
    let availableFixedSpots = fixedSpotAssignments
        .filter(a => a.spotAvailable)
        .map(a => ({ spotName: a.spotName, originalOwner: a.user }));

    const mold = window.getMold(sharedN, sharedU, true); // Use sharedN instead of N
    const rotationOffset = (sharedU > sharedN) ? weeksPassed : 0;
    const rotatedSharedMembers = window.rotateUsers(sharedUsers, rotationOffset);

    let sharedAssignments = rotatedSharedMembers.map((member, index) => ({
        user: member,
        moldValue: mold[index] || 'R',
        isAttending: interestedIds.includes(member.user_id),
        finalSpotName: null,
        priority: index,
        isFixedSpot: false
    }));

    // 4. Manage shared spots (P) and detect gaps
    let availableSharedSpots = [];
    sharedAssignments.forEach(a => {
        if (a.moldValue.startsWith('P')) {
            const spotIndex = parseInt(a.moldValue.substring(1)) - 1;
            const spotName = sharedSpots[spotIndex]?.name || a.moldValue;

            if (a.isAttending) {
                a.finalSpotName = spotName;
            } else {
                availableSharedSpots.push(spotName);
            }
        }
    });

    // 5. Manage Reserves (R) for shared users
    let reserveCandidates = sharedAssignments
        .filter(a => a.moldValue.startsWith('R') && a.isAttending)
        .sort((a, b) => {
            const numA = parseInt(a.moldValue.substring(1));
            const numB = parseInt(b.moldValue.substring(1));
            return numA - numB;
        });

    // First assign available shared spots to reserves
    reserveCandidates.forEach(candidate => {
        if (availableSharedSpots.length > 0) {
            candidate.finalSpotName = availableSharedSpots.shift();
        }
    });

    // Then assign available fixed spots to remaining reserves
    reserveCandidates.forEach(candidate => {
        if (!candidate.finalSpotName && availableFixedSpots.length > 0) {
            const fixedSpot = availableFixedSpots.shift();
            candidate.finalSpotName = fixedSpot.spotName;
            candidate.assignedFixedSpot = true;
            candidate.fixedSpotOwner = fixedSpot.originalOwner;
        }
    });

    // Combine both assignments
    return [...fixedSpotAssignments, ...sharedAssignments];
}

function closeParkingDayDetail() {
    document.getElementById('modal-parking-day-detail').classList.add('hidden');
    currentDetailDateStr = null;
}

function openParkingMembersModal() {
    const modal = document.getElementById('modal-parking-members');
    if (!modal) return;
    modal.classList.remove('hidden');

    const list = document.getElementById('parking-members-list-general');
    const membersBase = window.parkingState.members; // Orden original, sin rotar

    // Separate fixed and shared members
    const fixedMembers = membersBase.filter(m => m.has_fixed_spot);
    const sharedMembers = membersBase.filter(m => !m.has_fixed_spot);

    const sharedU = sharedMembers.length; // Only shared members for rotation

    const today = new Date(); // Use today for "current week" context in members modal
    const startDate = window.parkingState.startDate || new Date(2025, 0, 6);

    // Calculate weeksPassed based on Mondays to align rotation
    const startMonday = getStartOfWeek(new Date(startDate));
    startMonday.setHours(0, 0, 0, 0);
    const currentMonday = getStartOfWeek(new Date(today));
    currentMonday.setHours(0, 0, 0, 0);
    const diffTime = currentMonday - startMonday;
    const weeksPassed = Math.round(diffTime / (1000 * 60 * 60 * 24 * 7));

    const sharedSpots = window.parkingState.spots.filter(s => !s.is_fixed_spot);
    const sharedN = sharedSpots.length;
    const mold = window.getMold(sharedN, sharedU, true);

    // Calculamos el desplazamiento para las etiquetas del molde
    const offset = (sharedU > sharedN) ? (weeksPassed % sharedU) : 0;

    let html = '';

    // Sección de miembros con plaza fija
    if (fixedMembers.length > 0) {
        html += `<div class="mb-4">
            <h4 class="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                <i class="fas fa-lock"></i> Plazas Fijas
            </h4>`;
        
        html += fixedMembers.map(m => {
            const spot = window.parkingState.spots.find(s => s.id === m.fixed_spot_id);
            const spotName = spot?.name || 'Unknown';
            
            return `
                <div class="flex items-center justify-between p-4 rounded-xl bg-indigo-900/10 border border-indigo-500/20 transition-all">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-lg bg-indigo-900/30 flex items-center justify-center text-[10px] font-black text-indigo-400 border border-indigo-500/30">
                            <i class="fas fa-lock"></i>
                        </div>
                        <div class="flex flex-col">
                            <span class="text-white font-bold text-sm">${escapeHtml(m.display_name)}</span>
                            <span class="text-[9px] uppercase tracking-widest text-indigo-400 font-black">PLAZA FIJA</span>
                        </div>
                    </div>
                    <div class="text-right">
                        <span class="font-black text-xs px-3 py-1.5 rounded-lg bg-indigo-500 text-white">
                            ${spotName}
                        </span>
                    </div>
                </div>
            `;
        }).join('');
        
        html += `</div>`;
    }

    // Sección de miembros con plaza compartida
    html += `<div>
        <h4 class="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-2 flex items-center gap-2">
            <i class="fas fa-users"></i> Plazas Compartidas
        </h4>`;
    
    html += sharedMembers.map((m, index) => {
        // Buscamos qué etiqueta le toca a este usuario según la semana
        const moldValue = mold[(index + (sharedU - offset)) % sharedU];
        const isSpot = moldValue.startsWith('P');

        const statusText = isSpot ? "TIENE PLAZA" : "RESERVA";
        const statusColor = isSpot ? "text-emerald-400" : "text-amber-400";
        const bgColor = isSpot ? "bg-emerald-900/10 border-emerald-500/20" : "bg-slate-800/50 border-slate-700";

        return `
            <div class="flex items-center justify-between p-4 rounded-xl ${bgColor} border transition-all">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-[10px] font-black text-slate-500 border border-slate-700">
                        ${moldValue}
                    </div>
                    <div class="flex flex-col">
                        <span class="text-white font-bold text-sm">${escapeHtml(m.display_name)}</span>
                        <span class="text-[9px] uppercase tracking-widest ${statusColor} font-black">${statusText}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    html += `</div>`;
    
    list.innerHTML = html;

    // Show 'Edit Mold' button only for group admin
    const editBtn = document.getElementById('btn-edit-mold');
    if (editBtn) editBtn.classList.toggle('hidden', !window.parkingState.isAdmin);

    // Show custom mold indicator
    const indicator = document.getElementById('mold-custom-indicator');
    if (indicator) {
        indicator.classList.toggle('hidden', !window.parkingState.customMold);
    }
}

function closeParkingMembersModal() {
    document.getElementById('modal-parking-members')?.classList.add('hidden');
}

// Routine Logic
function openRoutineModal() {
    const modal = document.getElementById('modal-parking-routine');
    modal.classList.remove('hidden');

    // Load current routine
    const myMember = window.parkingState.members.find(m => m.user_id === currentUser.id);
    selectedRoutineDays = myMember?.routine || [1, 2, 3, 4, 5];

    updateRoutineUI();
}

function closeRoutineModal() {
    document.getElementById('modal-parking-routine').classList.add('hidden');
}

function toggleRoutineDay(day) {
    if (selectedRoutineDays.includes(day)) {
        selectedRoutineDays = selectedRoutineDays.filter(d => d !== day);
    } else {
        selectedRoutineDays.push(day);
    }
    updateRoutineUI();
}

function updateRoutineUI() {
    document.querySelectorAll('#modal-parking-routine .day-btn-pill').forEach(btn => {
        const day = parseInt(btn.dataset.day);
        if (selectedRoutineDays.includes(day)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

async function saveRoutine() {
    await window.updateRoutine(selectedRoutineDays);
    closeRoutineModal();
    showToast(t('parking.toast_rutina_guardada'));
}

async function handleToggleAttendance() {
    if (!currentDetailDateStr) return;
    const isAttending = document.getElementById('check-parking-attendance').checked;
    await window.toggleAttendance(currentDetailDateStr, isAttending);

    // Re-render modal to show updated assignments
    const dateIso = currentDetailDateStr + "T12:00:00Z";
    openParkingDayDetail(dateIso);

    // Also re-render calendar in background
    renderParkingCalendar();
}

// Modal Logic
function openSpotManagementModal() {
    document.getElementById('modal-manage-spots').classList.remove('hidden');
    renderSpotsList();
}

function closeSpotManagementModal() {
    document.getElementById('modal-manage-spots').classList.add('hidden');
}

function renderSpotsList() {
    const list = document.getElementById('spots-list');
    if (!window.parkingState || !window.parkingState.spots) return;

    list.innerHTML = window.parkingState.spots.map(s => `
        <div class="flex justify-between items-center bg-slate-900/50 p-3 rounded-xl border border-slate-700">
            <span class="text-sm font-bold text-slate-300">${escapeHtml(s.name)}</span>
            <button onclick="handleDeleteSpot('${s.id}')" class="text-red-400 hover:text-red-300 p-2">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `).join('');

    if (window.parkingState.spots.length === 0) {
        list.innerHTML = `<p class="text-center text-xs text-slate-500 italic py-4">${t('parking.no_plazas_creadas')}</p>`;
    }
}

async function handleAddSpot() {
    const input = document.getElementById('new-spot-name');
    const name = input.value.trim();
    if (!name) return;

    await window.addSpot(name); // Calling logic from groups.js

    input.value = '';
    renderSpotsList(); // Re-render list with new state (updated by addSpot->loadParkingGroupDetail)
}

async function handleDeleteSpot(id) {
    await window.deleteSpot(id);
    renderSpotsList();
}

// ========== MOLD EDITOR ==========
let currentMoldDraft = []; // Temporary editable copy of the mold

function openMoldEditorModal() {
    const N = window.parkingState.spots.length;
    const U = window.parkingState.members.length;
    if (N === 0 || U === 0) return;

    // Start with current active mold (custom or auto)
    currentMoldDraft = [...window.getMold(N, U)];
    renderMoldEditor();
    document.getElementById('modal-mold-editor').classList.remove('hidden');
}

function closeMoldEditorModal() {
    document.getElementById('modal-mold-editor').classList.add('hidden');
    currentMoldDraft = [];
}

function renderMoldEditor() {
    const list = document.getElementById('mold-editor-list');
    if (!list) return;

    const isCustomActive = !!window.parkingState.customMold;

    list.innerHTML = currentMoldDraft.map((slot, index) => {
        const isP = slot.startsWith('P');
        const badgeColor = isP ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white';
        const rowBg = isP ? 'bg-emerald-900/10 border-emerald-500/20' : 'bg-slate-800/50 border-slate-700';
        const isFirst = index === 0;
        const isLast = index === currentMoldDraft.length - 1;

        return `
            <div class="flex items-center gap-3 p-3 rounded-xl border ${rowBg} transition-all">
                <span class="font-black text-xs px-2 py-1 rounded-lg ${badgeColor} min-w-[36px] text-center">${slot}</span>
                <span class="flex-1 text-slate-400 text-[10px] uppercase font-bold">${isP ? 'Plaza' : 'Reserva'}</span>
                <div class="flex gap-1">
                    <button onclick="window.moveMoldSlot(${index}, -1)"
                        class="w-8 h-8 rounded-lg ${isFirst ? 'bg-slate-800/30 text-slate-600 cursor-not-allowed' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'} flex items-center justify-center text-xs font-black transition-all"
                        ${isFirst ? 'disabled' : ''}>↑</button>
                    <button onclick="window.moveMoldSlot(${index}, 1)"
                        class="w-8 h-8 rounded-lg ${isLast ? 'bg-slate-800/30 text-slate-600 cursor-not-allowed' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'} flex items-center justify-center text-xs font-black transition-all"
                        ${isLast ? 'disabled' : ''}>↓</button>
                </div>
            </div>
        `;
    }).join('');

    // Update header indicator
    const statusEl = document.getElementById('mold-editor-status');
    if (statusEl) {
        if (isCustomActive) {
            statusEl.innerHTML = `<span class="text-[9px] font-black text-amber-400 uppercase tracking-widest">✦ Molde personalizado activo</span>`;
        } else {
            statusEl.innerHTML = `<span class="text-[9px] font-black text-slate-500 uppercase tracking-widest">Molde automático</span>`;
        }
    }
}

function moveMoldSlot(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= currentMoldDraft.length) return;
    // Swap
    [currentMoldDraft[index], currentMoldDraft[newIndex]] = [currentMoldDraft[newIndex], currentMoldDraft[index]];
    renderMoldEditor();
}

async function saveMoldEditor() {
    if (currentMoldDraft.length === 0) return;
    try {
        await window.saveCustomMold([...currentMoldDraft]);
        closeMoldEditorModal();
        renderParkingCalendar();
        showToast(t('parking.molde_guardado'));
    } catch (e) {
        console.error('saveMoldEditor error:', e);
        showToast('❌ ' + (e?.message || 'Error al guardar el molde'));
    }
}

async function resetMoldEditor() {
    try {
        await window.resetCustomMold();
        // Refresh draft to auto mold
        const N = window.parkingState.spots.length;
        const U = window.parkingState.members.length;
        currentMoldDraft = [...window.buildMold(N, U)];
        renderMoldEditor();
        renderParkingCalendar();
        showToast(t('parking.molde_reseteado'));
    } catch (e) {
        showToast('Error al restablecer el molde');
    }
}

// Register new global functions
window.openMoldEditorModal = openMoldEditorModal;
window.closeMoldEditorModal = closeMoldEditorModal;
window.moveMoldSlot = moveMoldSlot;
window.saveMoldEditor = saveMoldEditor;
window.resetMoldEditor = resetMoldEditor;

