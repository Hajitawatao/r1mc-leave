<template>
  <div class="page" v-if="d">
    <div class="page-head">
      <div>
        <div class="row" style="gap:8px"><span class="mono muted">{{ r.tracking_no }}</span><StatusBadge :status="r.status" :lwop="r.is_lwop" /></div>
        <h1 style="margin-top:6px">{{ r.leave_name }} · {{ fmtRange(r.start_date, r.end_date) }}</h1>
        <div class="sub">{{ e.last_name }}, {{ e.first_name }} · {{ e.position }}<span v-if="e.department_name"> · {{ e.department_name }}</span></div>
      </div>
      <div class="row no-print">
        <router-link :to="`/requests/${r.id}/form6`" class="btn" target="_blank">Print CSC Form 6</router-link>
        <router-link v-if="d.can_edit" :to="`/requests/${r.id}/edit`" class="btn primary">Revise &amp; resubmit</router-link>
        <button v-if="d.can_cancel" class="btn danger" @click="showCancel = true">Cancel application</button>
      </div>
    </div>

    <div class="grid-main">
      <div class="stack">
        <div v-if="d.can_act" class="card" style="border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-soft)">
          <div class="card-head"><h2>Your action · {{ d.current_step.name }}</h2></div>
          <div class="card-body stack" style="gap:12px">
            <div v-if="d.current_step.certifies_credits" class="alert info">
              This step certifies leave credits. Credits are deducted on final approval; any days beyond the available balance become leave without pay automatically.
              <label class="field" style="margin-top:8px">Days without pay (override, optional)
                <input class="input" type="number" min="0" :max="r.days_applied" step="0.5" v-model="lwop" style="max-width:160px" />
                <span class="help">Leave blank to compute from the balance.</span>
              </label>
            </div>
            <label class="field">Remarks <span class="help">Required when returning or disapproving.</span>
              <textarea class="input" v-model="remarks" maxlength="1000"></textarea>
            </label>
            <div class="row">
              <button class="btn ok" :disabled="busy" @click="act('APPROVE')">Approve</button>
              <button class="btn warn" :disabled="busy" @click="act('RETURN', 'EMPLOYEE')">Return to employee</button>
              <button v-if="hasPrevious" class="btn warn" :disabled="busy" @click="act('RETURN', 'PREVIOUS')">Return to previous step</button>
              <button class="btn danger" :disabled="busy" @click="act('DISAPPROVE')">Disapprove</button>
            </div>
            <div v-if="error" class="alert error">{{ error }}</div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>Application details</h2></div>
          <div class="card-body">
            <dl class="kv">
              <dt>Leave type</dt><dd>{{ r.leave_name }} <span class="tag">{{ r.leave_code }}</span></dd>
              <dt>Inclusive dates</dt><dd>{{ fmtDate(r.start_date, true) }}<span v-if="r.end_date !== r.start_date"> to {{ fmtDate(r.end_date, true) }}</span><span v-if="r.is_half_day"> ({{ r.half_day_period }} half day)</span></dd>
              <dt>Days applied</dt><dd><strong>{{ fmtDays(r.days_applied) }}</strong></dd>
              <template v-if="r.status === 'APPROVED'">
                <dt>With pay</dt><dd>{{ fmtDays(r.days_with_pay) }}</dd>
                <dt>Without pay</dt><dd :style="{ color: r.days_without_pay ? 'var(--bad)' : '' }">{{ fmtDays(r.days_without_pay) }}</dd>
              </template>
              <template v-if="r.detail_option"><dt>Details (6.B)</dt><dd>{{ detailLabel }}<span v-if="r.detail_text">: {{ r.detail_text }}</span></dd></template>
              <dt>Commutation</dt><dd>{{ r.commutation === 'REQUESTED' ? 'Requested' : 'Not requested' }}</dd>
              <dt>Reason</dt><dd style="white-space:pre-wrap">{{ r.reason || '—' }}</dd>
              <dt>Filed</dt><dd>{{ fmtDateTime(r.submitted_at) }}</dd>
            </dl>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <h2>Supporting documents</h2>
            <label v-if="canAttach" class="btn sm no-print">Add file<input type="file" multiple accept=".pdf,.jpg,.jpeg,.png" hidden @change="addFiles" /></label>
          </div>
          <div class="card-body">
            <div v-if="!d.attachments.length" class="faint">None attached.</div>
            <div v-for="a in d.attachments" :key="a.id" class="bal">
              <a :href="`/api/requests/attachments/${a.id}`" target="_blank">{{ a.original_name }}</a>
              <span class="faint">{{ Math.ceil(a.size_bytes / 1024) }} KB</span>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>History</h2></div>
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>When</th><th>Action</th><th>By</th><th>Step</th><th>Remarks</th></tr></thead>
              <tbody>
                <tr v-for="a in d.actions" :key="a.id">
                  <td class="nowrap faint">{{ fmtDateTime(a.created_at) }}</td>
                  <td><strong>{{ ACTION_LABEL[a.action] }}</strong></td>
                  <td>{{ a.actor_name }}<div v-if="a.on_behalf_name" class="faint">for {{ a.on_behalf_name }}</div></td>
                  <td class="faint">{{ a.step_name || '' }}</td>
                  <td style="white-space:pre-wrap">{{ a.remarks || '' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="stack">
        <div class="card">
          <div class="card-head"><h2>Approval route</h2></div>
          <div class="card-body">
            <ol class="steps">
              <li v-for="s in d.steps" :key="s.id" :class="s.status">
                <span class="dot"></span>
                <div class="name">{{ s.name }}</div>
                <div class="meta">
                  <template v-if="s.approver_type === 'ROLE'">{{ roleName(s.approver_role) }}</template>
                  <template v-else>{{ s.approver_name }}</template>
                  · {{ stepStatus(s) }}
                </div>
                <div v-if="s.acted_by_name" class="meta">{{ s.acted_by_name }}, {{ fmtDateTime(s.acted_at) }}</div>
                <div v-if="s.remarks" class="meta" style="font-style:italic">“{{ s.remarks }}”</div>
              </li>
            </ol>
          </div>
        </div>

        <div class="card" v-if="d.balances">
          <div class="card-head"><h2>Employee's leave credits</h2></div>
          <div class="card-body">
            <div v-for="b in d.balances" :key="b.code" class="bal"><span>{{ b.name }}</span><span class="v">{{ fmtDays(b.balance) }}</span></div>
            <router-link :to="`/leave-card/${r.employee_id}`" class="faint">Open leave card →</router-link>
          </div>
        </div>

        <div class="card" v-if="d.overlaps">
          <div class="card-head"><h2>Team on leave in the same period</h2></div>
          <div class="card-body">
            <div v-if="!d.overlaps.length" class="faint">No overlapping leave in the same department or team.</div>
            <div v-for="o in d.overlaps" :key="o.tracking_no" class="bal">
              <div><div style="font-weight:600">{{ o.name }}</div><div class="faint">{{ o.leave_code }} · {{ fmtRange(o.start_date, o.end_date) }}</div></div>
              <StatusBadge :status="o.status" />
            </div>
          </div>
        </div>

        <div class="card" v-if="d.history">
          <div class="card-head"><h2>Leave in the last 12 months</h2></div>
          <div class="card-body">
            <div v-if="!d.history.length" class="faint">No other applications.</div>
            <div v-for="h in d.history" :key="h.tracking_no" class="bal">
              <span>{{ h.leave_code }} · {{ fmtRange(h.start_date, h.end_date) }}</span>
              <span class="faint">{{ fmtDays(h.days_applied) }}d · {{ h.status.toLowerCase() }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <Modal v-if="showCancel" title="Cancel application" @close="showCancel = false">
      <p v-if="r.status === 'APPROVED'" class="alert warn">This leave is already approved. Cancelling restores {{ fmtDays(r.days_with_pay) }} day(s) to the employee's credits.</p>
      <label class="field">Remarks<textarea class="input" v-model="cancelRemarks"></textarea></label>
      <template #foot>
        <button class="btn" @click="showCancel = false">Keep it</button>
        <button class="btn danger" :disabled="busy" @click="cancel">Cancel application</button>
      </template>
    </Modal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../api';
import { store, toast, refreshCounts } from '../store';
import { fmtDate, fmtDateTime, fmtDays, fmtRange, ACTION_LABEL } from '../format';
import StatusBadge from '../components/StatusBadge.vue';
import Modal from '../components/Modal.vue';

const route = useRoute();
const d = ref(null);
const remarks = ref('');
const lwop = ref('');
const error = ref('');
const busy = ref(false);
const showCancel = ref(false);
const cancelRemarks = ref('');
const r = computed(() => d.value.request);
const e = computed(() => d.value.employee);
const hasPrevious = computed(() => d.value.steps.some((s) => s.step_order < d.value.current_step.step_order && s.status === 'APPROVED'));
const canAttach = computed(() => ['PENDING', 'RETURNED'].includes(r.value.status) && r.value.employee_id === store.user.employee_id);
const DETAIL = { WITHIN_PH: 'Within the Philippines', ABROAD: 'Abroad', IN_HOSPITAL: 'In hospital', OUT_PATIENT: 'Out patient', ILLNESS: 'Illness', MASTERS: "Completion of Master's degree", BAR_BOARD: 'BAR/Board examination review', MONETIZATION: 'Monetization', TERMINAL: 'Terminal leave' };
const detailLabel = computed(() => DETAIL[r.value.detail_option] || r.value.detail_option);
const ROLE = { HR: 'HRMO', ACCOUNTING: 'Accounting', OSH: 'OSH', CAO: 'Chief Administrative Officer', MANAGEMENT: 'Management', ADMIN: 'Administrator' };
const roleName = (x) => ROLE[x] || x;
const stepStatus = (s) => ({ WAITING: 'waiting', PENDING: 'for action', APPROVED: 'approved', RETURNED: 'returned', DISAPPROVED: 'disapproved', SKIPPED: 'skipped' }[s.status]);

async function load() { d.value = await api.get(`/requests/${route.params.id}`); }

async function act(action, returnTo) {
  error.value = '';
  if (action !== 'APPROVE' && !remarks.value.trim()) { error.value = 'Write your remarks first. The employee will see them.'; return; }
  if (action === 'DISAPPROVE' && !window.confirm('Disapprove this application? This is final.')) return;
  busy.value = true;
  try {
    const out = await api.post(`/requests/${route.params.id}/action`, { action, remarks: remarks.value, return_to: returnTo, days_without_pay: lwop.value === '' ? undefined : lwop.value });
    toast(out.status === 'APPROVED' ? 'Approved. The employee has been notified.' : out.status === 'PENDING' ? `Done. Now at: ${out.next_step || out.returned_to}` : `Application ${out.status.toLowerCase()}.`);
    remarks.value = '';
    await load();
    refreshCounts();
  } catch (err) {
    error.value = err.message;
  } finally {
    busy.value = false;
  }
}

async function cancel() {
  busy.value = true;
  try {
    await api.post(`/requests/${route.params.id}/cancel`, { remarks: cancelRemarks.value });
    toast('Application cancelled');
    showCancel.value = false;
    await load();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    busy.value = false;
  }
}

async function addFiles(ev) {
  const fd = new FormData();
  Array.from(ev.target.files || []).forEach((f) => fd.append('files', f));
  try { await api.post(`/requests/${route.params.id}/attachments`, fd); toast('File attached'); await load(); } catch (err) { toast(err.message, 'error'); }
  ev.target.value = '';
}

onMounted(load);
</script>
