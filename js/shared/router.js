// Router for handling different group types (flexible vs fixed)

function getCurrentGroupType() {
    return currentGroupType;
}

function setCurrentGroup(group) {
    if (!group) return;
    currentGroupId = group.id;
    currentGroupType = group.type;
    currentGroup = group;
}

async function getUserGroupIds() {
    if (!currentUser) return [];

    // Load flexible groups
    const { data: flexMembers } = await _supabase.schema('flexible_carpooling')
        .from('flexible_members')
        .select('group_id')
        .eq('user_id', currentUser.id);

    // Load fixed groups
    const { data: fixedMembers } = await _supabase.schema('fixed_carpooling')
        .from('fixed_members')
        .select('group_id')
        .eq('user_id', currentUser.id);

    // Load parking groups
    const { data: parkingMembers, error: parkingErr } = await _supabase.schema('parking')
        .from('members')
        .select('group_id')
        .eq('user_id', currentUser.id);

    if (parkingErr) console.warn("Error fetching parking groups:", parkingErr);

    const flexGroupIds = [...new Set((flexMembers || []).map(m => m.group_id))];
    const fixedGroupIds = [...new Set((fixedMembers || []).map(m => m.group_id))];
    const parkingGroupIds = [...new Set((parkingMembers || []).map(m => m.group_id))];

    return [...flexGroupIds, ...fixedGroupIds, ...parkingGroupIds];
}

async function loadGroupDetail(groupId) {
    // Fetch group data to determine type
    const { data: group, error } = await _supabase
        .from('groups')
        .select('id, name, code, type, metadata')
        .eq('id', groupId)
        .single();

    if (error || !group) {
        console.error('Error loading group:', error);
        return;
    }

    setCurrentGroup(group);

    // Route to appropriate module based on type
    if (group.type === GROUP_TYPES.FLEXIBLE) {
        await loadFlexibleGroupDetail(groupId, group.name);
    } else if (group.type === GROUP_TYPES.FIXED) {
        await loadFixedGroupDetail(groupId, group.name);
    } else if (group.type === GROUP_TYPES.PARKING) {
        await loadParkingGroupDetail(groupId, group.name);
    }
}

// Group list rendering with type badges
async function loadAllGroups() {
    if (!currentUser) return;

    const allGroupIds = await getUserGroupIds();

    if (allGroupIds.length === 0) {
        document.getElementById('html-groups-list').innerHTML = `<p class="text-slate-500 text-xs uppercase font-bold pt-4">${t('shared.no_grupos')}</p>`;
        return;
    }

    // Fetch group details
    const { data: groupData, error: groupError } = await _supabase
        .from('groups')
        .select('id, name, code, type')
        .in('id', allGroupIds)
        .order('created_at', { ascending: true });

    if (groupError) return console.warn('Error loading groups:', groupError);

    const groups = groupData || [];

    document.getElementById('html-groups-list').innerHTML = groups.map(g => `
        <div onclick="loadGroupDetail('${escapeHtml(g.id)}')" class="p-6 card-dark rounded-3xl cursor-pointer border-l-8 ${g.type === 'flexible' ? 'border-indigo-600' : g.type === 'fixed' ? 'border-amber-600' : 'border-emerald-600'} shadow-md">
            <div class="flex justify-between items-center">
                <div class="flex flex-col gap-2 items-start text-left">
                    <div class="flex items-center gap-2">
                        <span class="text-[9px] font-black ${g.type === 'flexible' ? 'text-indigo-400' : g.type === 'fixed' ? 'text-amber-400' : 'text-emerald-400'}">${t('group_type.' + g.type)}</span>
                    </div>
                    <span class="font-black text-sm uppercase italic text-slate-200">${escapeHtml(g.name)}</span>
                    <span class="text-[11px] font-bold text-white tracking-widest bg-slate-900 w-24 py-1.5 rounded-lg inline-block text-center">${escapeHtml(g.code)}</span>
                </div>
                <i class="fas fa-chevron-right text-slate-700"></i>
            </div>
        </div>
    `).join('');
}
