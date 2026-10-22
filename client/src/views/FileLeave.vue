<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>{{ editId ? 'Revise application' : 'File a leave' }}</h1>
        <div class="sub">{{ editId ? 'Correct the application and resubmit it. It will go through approval again from the first step.' : 'Application for Leave (CSC Form No. 6)' }}</div>
      </div>
    </div>

    <div v-if="returnedNote" class="alert warn" style="margin-bottom:16px"><strong>Returned:</strong> {{ returnedNote }}</div>

    <form class="grid-main" @submit.prevent="submit">
      <div class="stack">
        <div class="card card-pad stack">
          <h2>6.A Type of leave</h2>
          <div class="radio-cards">
            <div v-for="t in types" :key="t.id" class="radio-card" :class="{ selected: f.leave_type_id === t.id }" @click="f.leave_type_id = t.id" tabindex="0" @keydown.enter.space.prevent="f.leave_type_id = t.id">
              <span class="t">{{ t.name }}</span>
              <span class="d">{{ typeHint(t) }}</span>
            </div>
          </div>
          <p v-if="lt && lt.legal_basis" class="faint" style="margin:0">{{ lt.legal_basis }}</p>
        </div>

        <div class="card card-pad stack" v-if="lt">
          <h2>6.C Inclusive dates</h2>
          <div class="form-grid">
            <label class="field">Start date<input class="input" type="date" v-model="f.start_date" required /></label>
            <label class="field">End date<input class="input" type="date" v-model="f.end_date" :min="f.start_date" required :disabled="f.is_half_day" /></label>
            <div class="span-2 row" v-if="lt.allow_half_day">
              <label class="check"><input type="checkbox" v-model="f.is_half_day" /> Half day only</label>
              <select v-if="f.is_half_day" class="input" style="width:auto" v-model="f.half_day_period"><option value="AM">Morning (AM)</option><option value="PM">Afternoon (PM)</option></select>
            </div>
          </div>
          <p class="faint" style="margin:0">{{ lt.day_count === 'CALENDAR' ? 'Counted in calendar days.' : 'Weekends and holidays are not counted.' }}</p>
        </div>

        <div class="card card-pad stack" v-if="lt && lt.form6_detail !== 'NONE'">
          <h2>6.B Details of leave</h2>
          <div class="stack" style="gap:8px">
            <label v-for="o in detailOptions" :key="o.value" class="check"><input type="radio" :value="o.value" v-model="f.detail_option" /> {{ o.label }}</label>
          </div>
          <label class="field" v-if="needsDetailText">{{ detailTextLabel }}<input class="input" v-model="f.detail_text" maxlength="255" /></label>
        </div>

        <div class="card card-pad stack" v-if="lt">
          <h2>Reason and supporting documents</h2>
          <label class="field">Reason / remarks<textarea class="input" v-model="f.reason" maxlength="2000" placeholder="Short explanation (optional for most leave types)"></textarea></label>
          <div class="field" style="font-weight:600">6.D Commutation
            <div class="row" style="font-weight:400">
              <label class="check"><input type="radio" value="NOT_REQUESTED" v-model="f.commutation" /> Not requested</label>
              <label class="check"><input type="radio" value="REQUESTED" v-model="f.commutation" /> Requested</label>
            </div>
          </div>
          <label class="field">Attachments
            <input class="input" type="file" multiple accept=".pdf,.jpg,.jpeg,.png" @change="onFiles" />
            <span class="help">PDF, JPG or PNG, up to 5 files.<template v-if="lt.attachment_note"> {{ attachmentHint }}</template></span>
          </label>
          <div v-if="existingAttachments.length" class="faint">Already attached: {{ existingAttachments.map((a) => a.original_name).join(', ') }}</div>
        </div>
      </div>

      <div class="stack" style="position:sticky;top:16px">
        <div class="card">
          <div class="card-head"><h2>Summary</h2></div>
          <div class="card-body stack" style="gap:10px">
            <div v-if="!lt" class="faint">Choose a leave type to begin.</div>
            <template v-else>
              <dl class="kv">
                <dt>Leave</dt><dd>{{ lt.name }}</dd>
                <dt>Dates</dt><dd>{{ f.start_date ? fmtRange(f.start_date, f.is_half_day ? f.start_date : f.end_date) : '—' }}</dd>
                <dt>Days applied</dt><dd><strong>{{ preview ? fmtDays(preview.days) : '—' }}</strong></dd>
                <template v-if="preview && preview.estimate && preview.estimate.balance_type">
                  <dt>{{ preview.estimate.balance_type }} balance</dt><dd>{{ fmtDays(preview.estimate.balance) }}</dd>
                  <dt v-if="preview.estimate.pending">Pending</dt><dd v-if="preview.estimate.pending">− {{ fmtDays(preview.estimate.pending) }}</dd>
                  <dt>With pay</dt><dd>{{ fmtDays(preview.estimate.with_pay) }}</dd>
                  <dt>Without pay</dt><dd :style="{ color: preview.estimate.without_pay ? 'var(--bad)' : '' }">{{ fmtDays(preview.estimate.without_pay) }}</dd>
                </template>
              </dl>
              <div v-if="preview && preview.errors.length" class="alert error"><ul><li v-for="e in preview.errors" :key="e">{{ e }}</li></ul></div>
              <div v-if="preview && preview.warnings.length" class="alert warn"><ul><li v-for="w in preview.warnings" :key="w">{{ w }}</li></ul></div>
              <div v-if="error" class="alert error">{{ error }}</div>
              <button class="btn primary" :disabled="busy || !canSubmit">{{ busy ? 'Submitting…' : editId ? 'Resubmit application' : 'Submit application' }}</button>
              <p class="faint" style="margin:0">After submitting, you get a tracking number and the application goes to {{ firstStepText }}.</p>
            </template>
          </div>
        </div>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import { toast } from '../store';
import { fmtDays, fmtRange, todayStr } from '../format';

const route = useRoute();
const router = useRouter();
const editId = route.params.id ? Number(route.params.id) : null;
const types = ref([]);
const files = ref([]);
const existingAttachments = ref([]);
const returnedNote = ref('');
const preview = ref(null);
const error = ref('');
const busy = ref(false);
const f = reactive({
  leave_type_id: null, start_date: todayStr(), end_date: todayStr(), is_half_day: false, half_day_period: 'AM',
  detail_option: null, detail_text: '', reason: '', commutation: 'NOT_REQUESTED',
});

const lt = computed(() => types.value.find((t) => t.id === f.leave_type_id));
const DETAILS = {
  LOCATION: [{ value: 'WITHIN_PH', label: 'Within the Philippines' }, { value: 'ABROAD', label: 'Abroad (specify)' }],
  ILLNESS: [{ value: 'IN_HOSPITAL', label: 'In hospital (specify illness)' }, { value: 'OUT_PATIENT', label: 'Out patient (specify illness)' }],
  WOMEN_ILLNESS: [{ value: 'ILLNESS', label: 'Specify illness' }],
  STUDY: [{ value: 'MASTERS', label: "Completion of Master's degree" }, { value: 'BAR_BOARD', label: 'BAR/Board examination review' }],
  OTHER: [{ value: 'MONETIZATION', label: 'Monetization of leave credits' }, { value: 'TERMINAL', label: 'Terminal leave' }],
};
const detailOptions = computed(() => (lt.value ? DETAILS[lt.value.form6_detail] || [] : []));
const needsDetailText = computed(() => ['ABROAD', 'IN_HOSPITAL', 'OUT_PATIENT', 'ILLNESS'].includes(f.detail_option));
const detailTextLabel = computed(() => (f.detail_option === 'ABROAD' ? 'Country' : 'Illness'));
const canSubmit = computed(() => lt.value && preview.value && !preview.value.errors.length);
const firstStepText = computed(() => (lt.value && lt.value.code === 'SL' ? 'OSH for medical clearance, then your supervisor' : 'your immediate supervisor'));
const attachmentHint = computed(() => {
  const t = lt.value;
  if (!t) return '';
  if (t.attachment_rule === 'ALWAYS') return `Required: ${t.attachment_note}.`;
  if (t.attachment_rule === 'OVER_DAYS') return `Required beyond ${fmtDays(t.attachment_threshold_days)} days: ${t.attachment_note}.`;
  return t.attachment_note || '';
});

function typeHint(t) {
  if (t.is_credit_type) return 'Uses your earned credits';
  if (t.deducts_from_type_id) return `Charged to ${types.value.find((x) => x.id === t.deducts_from_type_id)?.code || 'credits'} · max ${fmtDays(t.max_days_per_year)}/yr`;
  if (t.max_days_per_year) return `Up to ${fmtDays(t.max_days_per_year)} day(s) a year`;
  if (t.max_days_per_request) return `Up to ${fmtDays(t.max_days_per_request)} ${t.day_count === 'CALENDAR' ? 'calendar ' : ''}days`;
  return '';
}

function onFiles(e) { files.value = Array.from(e.target.files || []); }

let timer;
watch(f, () => {
  if (f.is_half_day) f.end_date = f.start_date;
  if (f.end_date < f.start_date) f.end_date = f.start_date;
  clearTimeout(timer);
  timer = setTimeout(runPreview, 250);
}, { deep: true });
watch(() => f.leave_type_id, () => { if (!detailOptions.value.some((o) => o.value === f.detail_option)) f.detail_option = detailOptions.value[0]?.value || null; });
watch(files, () => runPreview());

async function runPreview() {
  if (!f.leave_type_id) { preview.value = null; return; }
  try {
    preview.value = await api.post('/requests/preview', { ...f, attachment_count: files.value.length, request_id: editId || undefined });
  } catch (e) { error.value = e.message; }
}

async function submit() {
  error.value = '';
  busy.value = true;
  const fd = new FormData();
  Object.entries(f).forEach(([k, v]) => { if (v !== null && v !== undefined) fd.append(k, String(v)); });
  files.value.forEach((x) => fd.append('files', x));
  try {
    if (editId) {
      await api.put(`/requests/${editId}`, fd);
      toast('Application resubmitted');
      router.push(`/requests/${editId}`);
    } else {
      const r = await api.post('/requests', fd);
      toast(`Submitted. Tracking no. ${r.tracking_no}`);
      router.push(`/requests/${r.id}`);
    }
  } catch (e) {
    error.value = e.data && e.data.errors ? e.data.errors.join(' · ') : e.message;
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  types.value = await api.get('/leave-types');
  if (editId) {
    const d = await api.get(`/requests/${editId}`);
    const r = d.request;
    Object.assign(f, {
      leave_type_id: r.leave_type_id, start_date: r.start_date, end_date: r.end_date, is_half_day: !!r.is_half_day, half_day_period: r.half_day_period || 'AM',
      detail_option: r.detail_option, detail_text: r.detail_text || '', reason: r.reason || '', commutation: r.commutation,
    });
    existingAttachments.value = d.attachments;
    const ret = [...d.actions].reverse().find((a) => a.action === 'RETURN');
    if (ret) returnedNote.value = `${ret.remarks} (${ret.step_name}, ${ret.actor_name})`;
  } else if (route.query.type) {
    f.leave_type_id = Number(route.query.type);
  }
});
</script>
