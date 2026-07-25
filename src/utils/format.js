const STATUS_LABELS = {
  new: 'New request',
  in_progress: 'In progress',
  awaiting_agent: 'Action required',
  awaiting_client: 'Awaiting client',
  sent: 'Sent to you',
  booked: 'Booked',
  confirmed: 'Confirmed',
  completed: 'Completed',
  archived: 'Archived',
};

const STATUS_NEXT = {
  new: 'Waiting on Deanna',
  in_progress: 'Deanna is building your plan',
  awaiting_agent: 'Deanna will reply soon',
  awaiting_client: 'Your reply is needed',
  sent: 'Review your proposal',
  booked: 'Booked — confirmation on its way',
  confirmed: 'Confirmed — download your documents',
  completed: 'Trip ready — enjoy!',
  archived: 'Archived plan',
};

/** Statuses agents can set manually (includes messaging and booking workflow). */
const PLAN_STATUS_OPTIONS = [
  'new',
  'in_progress',
  'awaiting_agent',
  'awaiting_client',
  'sent',
  'booked',
  'confirmed',
  'completed',
  'archived',
];

const CLOSED_PLAN_STATUSES = ['completed', 'archived'];
const ACTIVE_PLAN_STATUSES = PLAN_STATUS_OPTIONS.filter((s) => !CLOSED_PLAN_STATUSES.includes(s));
const STAFF_ACTION_STATUSES = ['new', 'awaiting_agent'];
const CLIENT_ACTION_STATUSES = ['awaiting_client', 'sent'];
/** Plans with a live booking — never counted as "action required" on either side. */
const BOOKED_PLAN_STATUSES = ['booked', 'confirmed'];

function isBookedStatus(status) {
  return BOOKED_PLAN_STATUSES.includes(status);
}

/** True once a booking exists, so the confirmation PDF is worth offering. */
function canDownloadConfirmation(status) {
  return isBookedStatus(status) || status === 'completed';
}

/**
 * Auto status after a portal message. Returns null when the status should stand:
 * closed plans must not reopen, and a live booking must not fall back to a
 * pre-booking status (unread message badges still surface the conversation).
 */
function nextStatusAfterMessage(currentStatus, senderIsStaff) {
  if (CLOSED_PLAN_STATUSES.includes(currentStatus)) return null;
  if (isBookedStatus(currentStatus)) return null;
  return senderIsStaff ? 'awaiting_client' : 'awaiting_agent';
}

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
  const key = PLAN_STATUS_OPTIONS.includes(status) ? status : 'new';
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

/**
 * Agent pricing notes are stored as one labelled block with the internal margin
 * appended last (see buildPricing in the agent routes). Everything from the
 * margin marker onwards is workspace-only, so drop it for customer views/PDFs.
 */
function stripMarginNotes(pricing) {
  const text = String(pricing || '');
  if (!text) return '';
  const lines = text.split('\n');
  const marginIndex = lines.findIndex((line) => /^\s*margin( notes)?\s*:/i.test(line));
  const visible = marginIndex === -1 ? lines : lines.slice(0, marginIndex);
  return visible.join('\n').trim();
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
  stripMarginNotes,
  isBookedStatus,
  canDownloadConfirmation,
  nextStatusAfterMessage,
  PREF_LABELS,
  STATUS_LABELS,
  PLAN_STATUS_OPTIONS,
  CLOSED_PLAN_STATUSES,
  ACTIVE_PLAN_STATUSES,
  STAFF_ACTION_STATUSES,
  CLIENT_ACTION_STATUSES,
  BOOKED_PLAN_STATUSES,
};
