// ========== FLEXIBLE CARPOOLING API ==========

// Group type selection state
let selectedGroupType = 'flexible';

function selectGroupType(type, event) {
    selectedGroupType = type;
    event.target.closest('.grid').querySelectorAll('.btn-selector').forEach(btn => btn.classList.remove('active'));
    event.target.closest('.btn-selector').classList.add('active');
}

// Create a fixed group member (to be called by createGroup if type is fixed)
async function createFixedGroupMember(groupId) {
    // This will be handled by fixed/groups.js
    // For now, just placeholder
    if (window.createFixedMembership) {
        await window.createFixedMembership(groupId);
    }
}

async function loadUserData() {
    if (!user) return;

    // Try to get name from flexible first
    let { data: flexData } = await _supabase.schema('flexible_carpooling')
        .from('flexible_members')
        .select('display_name')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

    let name = flexData?.display_name;

    // If not found, try fixed
    if (!name) {
        let { data: fixedData } = await _supabase.schema('fixed_carpooling')
            .from('fixed_members')
            .select('display_name')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle();
        name = fixedData?.display_name;
    }

    const input = document.getElementById('user-display-name');
    if (input) input.value = name || '';
}

async function createGroup() {
    const name = document.getElementById('new-group-name').value.trim();
    if (!name) return;
    const code = generateGroupCode(8);
    const type = selectedGroupType;

    const { data: newGroup, error } = await _supabase.from('groups').insert({ name, code, owner_id: user.id, type }).select().single();
    if (error) {
        showToast(t('shared.create_group_error'));
        return;
    }

    // Insert into appropriate schema based on type
    if (type === 'flexible') {
        const { error: memErr } = await _supabase.schema('flexible_carpooling').from('flexible_members').insert({
            group_id: newGroup.id,
            user_id: user.id,
            user_email: user.email,
            display_name: user.email.split('@')[0],
            aporta_coche: false
        });
        if (memErr) {
            showToast(t('shared.create_group_error'));
            return;
        }
    } else if (type === 'fixed') {
        await createFixedGroupMember(newGroup.id);
    } else if (type === 'parking') {
        // Show spot type selection modal
        if (window.openSpotTypeSelectionModal) {
            window.openSpotTypeSelectionModal(newGroup.id);
        } else {
            console.error("openSpotTypeSelectionModal is not defined on window object");
        }
    }

    document.getElementById('new-group-name').value = '';
    selectedGroupType = 'flexible'; // Reset
    document.querySelectorAll('#tab-inicio .btn-selector').forEach(btn => btn.classList.remove('active'));
    document.getElementById('type-flexible').classList.add('active');

    showToast(t('shared.toast_name_saved'));
    switchTab('grupos');
}

async function joinGroup() {
    const btn = document.getElementById('btn-join-group');
    const input = document.getElementById('join-code');
    const code = input.value.trim().toUpperCase();
    if (!code || btn.disabled) return;

    btn.disabled = true;
    btn.style.opacity = "0.5";

    try {
        const { data: g } = await _supabase.from('groups').select('id, type').eq('code', code).maybeSingle();
        if (!g) {
            showToast(t('shared.toast_invalid_code'));
            return;
        }

        // Check membership based on group type
        let schema, table;
        if (g.type === 'flexible') {
            schema = 'flexible_carpooling';
            table = 'flexible_members';
        } else if (g.type === 'fixed') {
            schema = 'fixed_carpooling';
            table = 'fixed_members';
        } else if (g.type === 'parking') {
            schema = 'parking';
            table = 'members';
        }

        const { data: memberCheck } = await _supabase.schema(schema).from(table)
            .select('id')
            .eq('group_id', g.id)
            .eq('user_id', user.id);

        if (memberCheck && memberCheck.length > 0) {
            showToast(t('shared.toast_already_in_group'));
            input.value = "";
            switchTab('grupos');
            return;
        }

        // Join appropriate type
        if (g.type === 'flexible') {
            await _supabase.schema('flexible_carpooling').from('flexible_members').insert([
                { group_id: g.id, user_id: user.id, user_email: user.email, aporta_coche: true }
            ]);
        } else if (g.type === 'fixed') {
            // Call fixed join function
            if (window.joinFixedGroup) {
                await window.joinFixedGroup(g.id);
            }
        } else if (g.type === 'parking') {
            if (window.openSpotTypeSelectionModal) {
                try {
                    console.log("Opening spot type selection for parking group:", g.id);
                    window.openSpotTypeSelectionModal(g.id);
                } catch (err) {
                    console.error("Error opening spot type selection:", err);
                    showToast("Error al abrir selección de plaza", "error");
                    return;
                }
            } else {
                showToast("Módulo de parking no cargado", "error");
                return;
            }
        }

        input.value = "";
        switchTab('grupos');
    } catch (err) {
        console.error(err);
        showToast(t('shared.join_group_error'));
    } finally {
        btn.disabled = false;
        btn.style.opacity = "1";
    }
}

// Load flexible group detail 
async function loadFlexibleGroupDetail(groupId, groupName) {
    // Show detail view
    document.getElementById('view-groups-list').classList.add('hidden');
    document.getElementById('view-group-detail').classList.remove('hidden');
    document.getElementById('label-group-name').innerText = groupName;

    // Fetch members for this group
    const { data: members, error: memberError } = await _supabase.schema('flexible_carpooling')
        .from('flexible_members')
        .select('*')
        .eq('group_id', groupId);

    if (memberError) {
        console.error("Error fetching members:", memberError);
        return;
    }

    // Format for compatibility with crash prevention - use data directly from flexible_members
    groupMembers = (members || []).map(m => ({
        ...m,
        user_email: m.user_email || '---',
        display_name: m.display_name || m.user_email?.split('@')[0] || 'Usuario'
    }));

    // Sync car status checkbox
    const me = groupMembers.find(m => m.user_id === user.id);
    const carCheckbox = document.getElementById('group-user-has-car');
    if (carCheckbox) carCheckbox.checked = me?.aporta_coche || false;

    // Load trips and refresh
    await loadFlexibleTrips();
    refreshCalendar();
}

async function updateProfileName() {
    console.log("updateProfileName called");
    const input = document.getElementById('user-display-name');
    if (!input || !user) return;

    const newName = input.value.trim();
    if (!newName) return;

    try {
        console.log("Updating name in both schemas to:", newName);

        // Update in flexible members
        await _supabase.schema('flexible_carpooling')
            .from('flexible_members')
            .update({ display_name: newName })
            .eq('user_id', user.id);

        // Update in fixed members
        await _supabase.schema('fixed_carpooling')
            .from('fixed_members')
            .update({ display_name: newName })
            .eq('user_id', user.id);

        // Update in parking members
        await _supabase.schema('parking')
            .from('members')
            .update({ display_name: newName })
            .eq('user_id', user.id);

        showToast(t('shared.toast_name_saved'));

        // Refresh detail views if open
        if (typeof renderMembersList === 'function') renderMembersList();

        // If we're in fixed carpooling, refresh fixed data too
        if (currentGroupType === 'fixed' && typeof refreshFixedData === 'function') {
            await refreshFixedData();
        }
    } catch (err) {
        console.error("Error updating profile name:", err);
        showToast("Error Supabase", "error");
    }
}

async function loadFlexibleTrips() {
    const { data: trips } = await _supabase.schema('flexible_carpooling')
        .from('flexible_trips')
        .select('*')
        .eq('group_id', currentGroupId);
    allTrips = trips || [];
}

async function confirmTripCreation() {
    const type = selectedTripType;
    const repeat = selectedTripRepeat;
    let tripDates = [selectedDate];

    for (let i = 1; i < repeat; i++) {
        let d = new Date(selectedDate);
        d.setUTCDate(d.getUTCDate() + (i * 7));
        tripDates.push(d.toISOString().split('T')[0]);
    }

    await _supabase.schema('flexible_carpooling').from('flexible_trips').insert(tripDates.map(date => ({
        group_id: currentGroupId, date, passengers: [user.id], type
    })));

    selectedTripType = 'ida_vuelta';
    selectedTripRepeat = 0;

    document.querySelectorAll('#modal-trip .btn-selector').forEach(btn => btn.classList.remove('active'));
    document.querySelector('#modal-trip [onclick*="ida_vuelta"]').classList.add('active');
    document.querySelector('#modal-trip [onclick*="(0, event)"]').classList.add('active');

    closeTripModal();
    refreshCalendar();
}

async function setRealDriver(tripId, driverId) {
    const trip = allTrips.find(x => x.id === tripId);
    if (!trip) return;

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tripDate = new Date(trip.date);
    if (tripDate < today) return showToast(t('flexible.toast_past_days'));

    await _supabase.schema('flexible_carpooling').from('flexible_trips').update({ real_driver_id: driverId || null }).eq('id', tripId);
    refreshCalendar();
}

async function toggleTrip(id, isI, count) {
    let trip = allTrips.find(x => x.id === id);
    if (!trip) return;

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tripDate = new Date(trip.date);
    if (tripDate < today) return showToast(t('flexible.toast_past_days'));

    if (isI && trip.real_driver_id === user.id) {
        return showToast(t('flexible.toast_is_driver'));
    }

    if (isI && count === 1) await _supabase.schema('flexible_carpooling').from('flexible_trips').delete().eq('id', id);
    else {
        let p = isI ? trip.passengers.filter(u => u !== user.id) : [...trip.passengers, user.id];
        await _supabase.schema('flexible_carpooling').from('flexible_trips').update({ passengers: p }).eq('id', id);
    }
    refreshCalendar();
}

async function cleanupFutureTrips(groupId) {
    if (!user) return;
    const today = new Date().toISOString().split('T')[0];

    const { data: trips, error } = await _supabase.schema('flexible_carpooling').from('flexible_trips')
        .select('*')
        .eq('group_id', groupId)
        .gte('date', today);

    if (error || !trips) return;

    for (const trip of trips) {
        let updates = {};
        let changed = false;

        let pax = Array.isArray(trip.passengers) ? trip.passengers : [];
        if (pax.includes(user.id)) {
            updates.passengers = pax.filter(id => id !== user.id);
            changed = true;
        }

        if (trip.real_driver_id === user.id) {
            updates.real_driver_id = null;
            changed = true;
        }

        if (changed) {
            const finalPax = updates.passengers !== undefined ? updates.passengers : pax;
            if (finalPax.length === 0) {
                await _supabase.schema('flexible_carpooling').from('flexible_trips').delete().eq('id', trip.id);
            } else {
                await _supabase.schema('flexible_carpooling').from('flexible_trips').update(updates).eq('id', trip.id);
            }
        }
    }
}

// Expose functions globally
Object.assign(window, {
    selectGroupType,
    createGroup,
    joinGroup,
    loadFlexibleGroupDetail,
    loadFlexibleTrips,
    updateProfileName,
    confirmTripCreation,
    setRealDriver,
    toggleTrip,
    cleanupFutureTrips
});
