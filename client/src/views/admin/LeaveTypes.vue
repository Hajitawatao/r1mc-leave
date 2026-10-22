<template>
  <div class="page" v-if="data">
    <div class="page-head">
      <div><h1>Leave types &amp; approvals</h1><div class="sub">Entitlements, documentary requirements and the approval route for each leave type.</div></div>
      <button class="btn primary" @click="editType(null)">+ Add leave type</button>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-head">
        <div><h2>Default approval route</h2><div class="faint">Used by every leave type that has no route of its own.</div></div>
        <button class="btn sm" @click="editChain(null)">Edit route</button>
      </div>
      <div class="card-body"><ChainLine :steps="data.default_steps" /></div>
    </div>

    <div class="card table-wrap">
      <table class="table">
        <thead><tr><th>Leave type</th><th>Entitlement</th><th>Documents</th><th>Approval route</th><th></th></tr></thead>
        <tbody>
          <tr v-for="t in data.types" :key="t.id" :style="{ opacity: t.is_active ? 1 : .5 }">
            <td><strong>{{ t.name }}</strong> <span class="tag">{{ t.code }}</span><div class="faint">{{ t.legal_basis }}</div></td>
            <td class="faint" style="min-width:180px">{{ entitlement(t) }}</td>
            <td class="faint">{{ docs(t) }}</td>
            <td style="min-width:240px"><ChainLine v-if="t.steps.length" :steps="t.steps" /><span v-else class="faint">Default route</span></td>
            <td class="nowrap"><button class="btn sm" @click="editType(t)">Edit</button> <button class="btn sm" @click="editChain(t)">Route</button></td>
          </tr>
        </tbody>
      </table>
    </div>

    <Modal v-if="tf" :title="tf.id ? `Edit ${tf.name}` : 'Add leave type'" wide @close="tf = null">
      <div class="form-grid">
        <label class="field">Code<input class="input" v-model="tf.code" /></label>
        <label class="field">Name<input class="input" v-model="tf.name" /></label>
        <label class="field span-2">Legal basis<input class="input" v-model="tf.legal_basis" /></label>
        <label class="check span-2"><input type="checkbox" v-model="tf.is_credit_type" /> Earns credits and keeps its own balance (like VL and SL)</label>
        <label class="field" v-if="tf.is_credit_type">Credits earned per month<input class="input" type="number" step="0.001" v-model="tf.accrual_per_month" /></label>
        <label class="field" v-else>Charge to the balance of
          <select class="input" v-model="tf.deducts_from_type_id"><option :value="null">— none (separate entitlement) —</option><option v-for="c in creditTypes" :key="c.id" :value="c.id">{{ c.name }}</option></select>
        </label>
        <label class="field">When credits are not enough
          <select class="input" v-model="tf.insufficient_credit_action"><option value="LWOP">Allow; excess is leave without pay</option><option value="BLOCK">Do not allow filing</option></select>
        </label>
        <label class="field">Max days per application<input class="input" type="number" step="0.5" v-model="tf.max_days_per_request" /></label>
        <label class="field">Max days per calendar year<input class="input" type="number" step="0.5" v-model="tf.max_days_per_year" /></label>
        <label class="field">Count days as<select class="input" v-model="tf.day_count"><option value="WORKING">Working days (skip weekends/holidays)</option><option value="CALENDAR">Calendar days</option></select></label>
        <label class="field">Available to<select class="input" v-model="tf.sex_restriction"><option value="ANY">All employees</option><option value="F">Female only</option><option value="M">Male only</option></select></label>
        <label class="field">Supporting document
          <select class="input" v-model="tf.attachment_rule"><option value="NEVER">Not needed</option><option value="OPTIONAL">Optional</option><option value="ALWAYS">Always required</option><option value="OVER_DAYS">Required beyond N days</option></select>
        </label>
        <label class="field" v-if="tf.attachment_rule === 'OVER_DAYS'">N days<input class="input" type="number" step="0.5" v-model="tf.attachment_threshold_days" /></label>
        <label class="field span-2">Document description<input class="input" v-model="tf.attachment_note" placeholder="e.g. Medical certificate" /></label>
        <label class="field">File at least … days in advance (warning only)<input class="input" type="number" v-model="tf.min_advance_days" /></label>
        <label class="field">Form 6 section 6.B
          <select class="input" v-model="tf.form6_detail"><option value="NONE">None</option><option value="LOCATION">Within PH / abroad</option><option value="ILLNESS">In hospital / out patient</option><option value="WOMEN_ILLNESS">Specify illness (women)</option><option value="STUDY">Study purpose</option><option value="OTHER">Monetization / terminal</option></select>
        </label>
        <label class="field">Display order<input class="input" type="number" v-model="tf.sort_order" /></label>
        <div class="row span-2"><label class="check"><input type="checkbox" v-model="tf.allow_half_day" /> Half day allowed</label><label class="check"><input type="checkbox" v-model="tf.is_active" /> Active (employees can file it)</label></div>
      </div>
      <div v-if="error" class="alert error" style="margin-top:12px">{{ error }}</div>
      <template #foot><button class="btn" @click="tf = null">Cancel</button><button class="btn primary" @click="saveType">Save</button></template>
    </Modal>

    <Modal v-if="chain" :title="chain.type ? `Approval route: ${chain.type.name}` : 'Default approval route'" wide @close="chain = null">
      <p class="muted">Steps run in order. Each approver can approve, return (to the employee or the previous step) or disapprove. Exactly one step should certify leave credits (normally HR).</p>
      <div v-if="chain.type" class="alert info" style="margin-bottom:12px">Remove all steps to make this leave type use the default route. Changes apply to new applications; applications already filed keep their route.</div>
      <div class="stack" style="gap:8px">
        <div v-for="(s, i) in chain.steps" :key="i" class="card card-pad" style="padding:10px 12px">
          <div class="row">
            <strong style="width:20px">{{ i + 1 }}.</strong>
            <input class="input" style="flex:2;min-width:180px" v-model="s.name" placeholder="Step name" />
            <select class="input" style="flex:1;min-width:150px" v-model="s.approver_type"><option value="SUPERVISOR">Immediate supervisor</option><option value="DEPT_HEAD">Department head</option><option value="ROLE">Anyone with role…</option></select>
            <select v-if="s.approver_type === 'ROLE'" class="input" style="width:auto" v-model="s.approver_role"><option v-for="r in data.roles" :key="r" :value="r">{{ r }}</option></select>
            <label class="check"><input type="checkbox" v-model="s.certifies_credits" /> Certifies credits</label>
            <button class="btn sm" :disabled="i === 0" @click="move(i, -1)">↑</button>
            <button class="btn sm" :disabled="i === chain.steps.length - 1" @click="move(i, 1)">↓</button>
            <button class="btn sm danger" @click="chain.steps.splice(i, 1)">Remove</button>
          </div>
        </div>
        <button class="btn" style="align-self:flex-start" @click="chain.steps.push({ name: '', approver_type: 'ROLE', approver_role: 'HR', certifies_credits: false })">+ Add step</button>
      </div>
      <div v-if="error" class="alert error" style="margin-top:12px">{{ error }}</div>
      <template #foot><button class="btn" @click="chain = null">Cancel</button><button class="btn primary" @click="saveChain">Save route</button></template>
    </Modal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, h } from 'vue';
import { api } from '../../api';
import { toast } from '../../store';
import { fmtDays } from '../../format';
import Modal from '../../components/Modal.vue';

const ChainLine = (props) => h('div', { class: 'row', style: 'gap:4px' }, props.steps.flatMap((s, i) => [
  i ? h('span', { class: 'faint' }, '→') : null,
  h('span', { class: 'tag', title: s.name, style: s.certifies_credits ? 'background:var(--primary-soft);color:var(--primary)' : '' },
    s.approver_type === 'ROLE' ? s.approver_role : s.approver_type === 'SUPERVISOR' ? 'Supervisor' : 'Dept head'),
]));
ChainLine.props = ['steps'];

const data = ref(null);
const tf = ref(null);
const chain = ref(null);
const error = ref('');
const creditTypes = computed(() => data.value.types.filter((t) => t.is_credit_type));

function entitlement(t) {
  const parts = [];
  if (t.is_credit_type) parts.push(`Earns ${fmtDays(t.accrual_per_month)}/month`);
  if (t.deducts_from_type_id) parts.push(`Charged to ${data.value.types.find((x) => x.id === t.deducts_from_type_id)?.code}`);
  if (t.max_days_per_request) parts.push(`max ${fmtDays(t.max_days_per_request)} ${t.day_count === 'CALENDAR' ? 'calendar ' : ''}days/application`);
  if (t.max_days_per_year) parts.push(`max ${fmtDays(t.max_days_per_year)} days/year`);
  if (t.sex_restriction !== 'ANY') parts.push(t.sex_restriction === 'F' ? 'female' : 'male');
  return parts.join(' · ') || '—';
}
function docs(t) {
  if (t.attachment_rule === 'ALWAYS') return `Required: ${t.attachment_note || 'document'}`;
  if (t.attachment_rule === 'OVER_DAYS') return `Beyond ${fmtDays(t.attachment_threshold_days)} days: ${t.attachment_note || 'document'}`;
  if (t.attachment_rule === 'NEVER') return 'None';
  return 'Optional';
}

async function load() { data.value = await api.get('/admin/leave-types'); }
function editType(t) {
  error.value = '';
  tf.value = t ? { ...t, is_credit_type: !!t.is_credit_type, allow_half_day: !!t.allow_half_day, is_active: !!t.is_active }
    : { code: '', name: '', legal_basis: '', is_credit_type: false, accrual_per_month: 0, deducts_from_type_id: null, insufficient_credit_action: 'LWOP', max_days_per_request: null, max_days_per_year: null, day_count: 'WORKING', sex_restriction: 'ANY', attachment_rule: 'OPTIONAL', attachment_threshold_days: null, attachment_note: '', min_advance_days: 0, form6_detail: 'NONE', sort_order: 200, allow_half_day: true, is_active: true };
}
async function saveType() {
  error.value = '';
  const { steps, id, ...body } = tf.value;
  try {
    if (id) await api.put(`/admin/leave-types/${id}`, body); else await api.post('/admin/leave-types', body);
    toast('Leave type saved'); tf.value = null; await load();
  } catch (e) { error.value = e.message; }
}
function editChain(t) {
  error.value = '';
  const src = t ? t.steps : data.value.default_steps;
  chain.value = { type: t, steps: src.map((s) => ({ name: s.name, approver_type: s.approver_type, approver_role: s.approver_role || 'HR', certifies_credits: !!s.certifies_credits })) };
}
function move(i, d) { const a = chain.value.steps; [a[i], a[i + d]] = [a[i + d], a[i]]; }
async function saveChain() {
  error.value = '';
  try {
    await api.put(`/admin/approval-chains/${chain.value.type ? chain.value.type.id : 'default'}`, { steps: chain.value.steps });
    toast('Approval route saved'); chain.value = null; await load();
  } catch (e) { error.value = e.message; }
}
onMounted(load);
</script>
