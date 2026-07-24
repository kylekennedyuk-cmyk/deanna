const STATUS_LABELS = {
  new: 'New request',
  in_progress: 'In progress',
  sent: 'Sent to you',
  completed: 'Completed',
  archived: 'Archived',
};

const STATUS_NEXT = {
  new: 'Waiting on Deanna',
  in_progress: 'Deanna is building your plan',
  sent: 'Review your proposal',
  completed: 'Trip ready — enjoy!',
  archived: 'Archived plan',
};

const PREF_LABELS = {
  dates: 'Travel dates',
  travelDates: 'Travel dates',
  nights: 'Nights',
  airport: 'Preferred airport',
  adults: 'Adults',
  children: 'Children',
  childAges: 'Children’s ages',
  occasion: 'Occasion',
  pace: 'Pace',
  interests: 'Interests',
  mustHaves: 'Must-haves',
  avoid: 'Prefer to avoid',
  parks: 'Park priority',
  lands: 'Lands & experiences',
  diningStyle: 'Dining style',
  budget: 'Budget',
  flexibility: 'Budget flexibility',
  hotelType: 'Hotel type',
  board: 'Board basis',
  roomPrefs: 'Room preferences',
  accessibility: 'Accessibility',
  dietary: 'Dietary needs',
  celebration: 'Celebrations / notes',
  name: 'Name',
  email: 'Email',
  phone: 'Phone',
};

function statusLabel(status) {
  return STATUS_LABELS[status] || String(status || '').replace(/_/g, ' ');
}

function nextAction(status) {
  return STATUS_NEXT[status] || 'Check your plan for updates';
}

function statusBadgeClass(status) {
  const key = ['new', 'in_progress', 'sent', 'completed', 'archived'].includes(status)
    ? status
    : 'new';
  return `badge-status-${key}`;
}

function formatMoney(value) {
  const n = Number(value);
  if (!n && n !== 0) return '—';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDateTime(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(value);
  }
}

function preferenceEntries(prefs = {}) {
  const skip = new Set(['stepSaved', 'action', 'terms', '_csrf']);
  return Object.entries(prefs)
    .filter(([key, value]) => !skip.has(key) && value !== undefined && value !== null && String(value).trim() !== '')
    .map(([key, value]) => ({
      key,
      label: PREF_LABELS[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
      value: Array.isArray(value) ? value.join(', ') : String(value),
    }));
}

function planTitle(plan, preferences = {}) {
  const occasion = preferences.occasion || 'Disneyland Paris';
  return `${occasion} · Plan #${plan.id}`;
}

function selectedList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

module.exports = {
  statusLabel,
  nextAction,
  statusBadgeClass,
  formatMoney,
  formatDateTime,
  preferenceEntries,
  planTitle,
  selectedList,
  PREF_LABELS,
  STATUS_LABELS,
};
