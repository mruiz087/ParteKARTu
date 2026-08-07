// ========== FIXED CARPOOLING UTILS ==========
// Additional helper functions for fixed carpooling

let selectedDays = [];

/** Local calendar date as YYYY-MM-DD (avoids UTC shift from Date#toISOString). */
function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Yesterday as YYYY-MM-DD in local time. */
function yesterdayStr() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Parse YYYY-MM-DD as a local midnight Date. */
function parseLocalDate(dateStr) {
    const [y, m, d] = String(dateStr).split('-').map(Number);
    return new Date(y, m - 1, d);
}

function isPastDateStr(dateStr) {
    if (!dateStr) return false;
    return dateStr < todayStr();
}

/** Returns false and shows toast if dateStr is before today. */
function assertNotPastDate(dateStr) {
    if (isPastDateStr(dateStr)) {
        showToast(t('fixed.no_modificar_pasadas'));
        return false;
    }
    return true;
}

/**
 * Whether a member was on leave on a given local date string.
 * Open leave: is_on_leave + dateStr >= (leave_since || today) — legacy rows without leave_since
 * only affect today onward so the past stays frozen.
 * Closed periods in leave_history: { from, to } inclusive.
 */
function wasOnLeaveOn(member, dateStr) {
    if (!member || !dateStr) return false;

    const history = Array.isArray(member.leave_history) ? member.leave_history : [];
    for (const period of history) {
        if (!period?.from) continue;
        const to = period.to || period.from;
        if (dateStr >= period.from && dateStr <= to) return true;
    }

    if (member.is_on_leave) {
        const since = member.leave_since || todayStr();
        if (dateStr >= since) return true;
    }

    return false;
}

Object.assign(window, {
    selectedDays,
    todayStr,
    yesterdayStr,
    parseLocalDate,
    isPastDateStr,
    assertNotPastDate,
    wasOnLeaveOn
});
