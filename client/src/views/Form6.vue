<template>
  <div class="f6-screen" v-if="d">
    <div class="no-print f6-toolbar">
      <button class="btn primary" @click="print">Print</button>
      <router-link :to="`/requests/${r.id}`" class="btn">Back to application</router-link>
      <span class="faint">Set paper to Legal or A4, portrait, margins “Default”.</span>
    </div>
    <div class="f6">
      <div class="f6-top">
        <div><em>Civil Service Form No. 6</em><br /><em>Revised 2020</em></div>
        <div class="f6-tracking">{{ r.tracking_no }}</div>
      </div>
      <div class="f6-head">
        <div>Republic of the Philippines</div>
        <div class="b">{{ s.org_name || 'Region 1 Medical Center' }}</div>
        <div>{{ s.org_address }}</div>
        <div class="f6-title">APPLICATION FOR LEAVE</div>
      </div>

      <table class="f6-t">
        <tr>
          <td style="width:38%"><span class="lb">1. OFFICE/DEPARTMENT</span><div class="val">{{ e.department_name || '' }}</div></td>
          <td colspan="3"><span class="lb">2. NAME:</span>
            <div class="name-grid"><span class="sm">(Last)</span><span class="sm">(First)</span><span class="sm">(Middle)</span>
              <span class="val">{{ e.last_name }}</span><span class="val">{{ e.first_name }}{{ e.suffix ? ' ' + e.suffix : '' }}</span><span class="val">{{ e.middle_name || '' }}</span></div>
          </td>
        </tr>
        <tr>
          <td><span class="lb">3. DATE OF FILING</span> <span class="val">{{ fmtDate(r.submitted_at, true) }}</span></td>
          <td style="width:30%"><span class="lb">4. POSITION</span> <span class="val">{{ e.position }}</span></td>
          <td colspan="2"><span class="lb">5. SALARY</span> <span class="val">{{ e.monthly_salary ? '₱' + Number(e.monthly_salary).toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '' }}</span></td>
        </tr>
        <tr><td colspan="4" class="sec">6. DETAILS OF APPLICATION</td></tr>
        <tr>
          <td colspan="2" class="top">
            <div class="lb">6.A TYPE OF LEAVE TO BE AVAILED OF</div>
            <div v-for="t in types" :key="t.id" class="opt"><span class="box">{{ t.id === r.leave_type_id ? '✔' : '' }}</span>{{ t.name }} <span class="sm">({{ t.legal_basis }})</span></div>
            <div class="opt"><span class="box"></span>Others: ______________</div>
          </td>
          <td colspan="2" class="top">
            <div class="lb">6.B DETAILS OF LEAVE</div>
            <div class="sm i">In case of Vacation/Special Privilege Leave:</div>
            <div class="opt"><span class="box">{{ ck('WITHIN_PH') }}</span>Within the Philippines ________</div>
            <div class="opt"><span class="box">{{ ck('ABROAD') }}</span>Abroad (Specify) <u>{{ r.detail_option === 'ABROAD' ? r.detail_text : '' }}</u></div>
            <div class="sm i">In case of Sick Leave:</div>
            <div class="opt"><span class="box">{{ ck('IN_HOSPITAL') }}</span>In Hospital (Specify Illness) <u>{{ r.detail_option === 'IN_HOSPITAL' ? r.detail_text : '' }}</u></div>
            <div class="opt"><span class="box">{{ ck('OUT_PATIENT') }}</span>Out Patient (Specify Illness) <u>{{ r.detail_option === 'OUT_PATIENT' ? r.detail_text : '' }}</u></div>
            <div class="sm i">In case of Special Leave Benefits for Women:</div>
            <div class="opt">(Specify Illness) <u>{{ r.detail_option === 'ILLNESS' ? r.detail_text : '' }}</u></div>
            <div class="sm i">In case of Study Leave:</div>
            <div class="opt"><span class="box">{{ ck('MASTERS') }}</span>Completion of Master's Degree</div>
            <div class="opt"><span class="box">{{ ck('BAR_BOARD') }}</span>BAR/Board Examination Review</div>
            <div class="sm i">Other purpose:</div>
            <div class="opt"><span class="box">{{ ck('MONETIZATION') }}</span>Monetization of Leave Credits</div>
            <div class="opt"><span class="box">{{ ck('TERMINAL') }}</span>Terminal Leave</div>
          </td>
        </tr>
        <tr>
          <td colspan="2" class="top">
            <div class="lb">6.C NUMBER OF WORKING DAYS APPLIED FOR</div>
            <div class="val">{{ fmtDays(r.days_applied) }} day(s)</div>
            <div class="lb" style="margin-top:6px">INCLUSIVE DATES</div>
            <div class="val">{{ fmtDate(r.start_date, true) }}<span v-if="r.end_date !== r.start_date"> to {{ fmtDate(r.end_date, true) }}</span><span v-if="r.is_half_day"> ({{ r.half_day_period }})</span></div>
          </td>
          <td colspan="2" class="top">
            <div class="lb">6.D COMMUTATION</div>
            <div class="opt"><span class="box">{{ r.commutation === 'NOT_REQUESTED' ? '✔' : '' }}</span>Not Requested</div>
            <div class="opt"><span class="box">{{ r.commutation === 'REQUESTED' ? '✔' : '' }}</span>Requested</div>
            <div class="sig"><div class="sig-name">{{ e.first_name }} {{ e.middle_name ? e.middle_name[0] + '.' : '' }} {{ e.last_name }}</div><div class="sm">(Signature of Applicant)</div></div>
          </td>
        </tr>
        <tr><td colspan="4" class="sec">7. DETAILS OF ACTION ON APPLICATION</td></tr>
        <tr>
          <td colspan="2" class="top">
            <div class="lb">7.A CERTIFICATION OF LEAVE CREDITS</div>
            <div class="sm">As of <u>{{ snap ? fmtDate(snap.as_of, true) : '__________' }}</u></div>
            <table class="f6-c">
              <tr><th></th><th>Vacation Leave</th><th>Sick Leave</th></tr>
              <tr><td class="i">Total Earned</td><td>{{ snapVal('VL') }}</td><td>{{ snapVal('SL') }}</td></tr>
              <tr><td class="i">Less this application</td><td>{{ lessVal('VL') }}</td><td>{{ lessVal('SL') }}</td></tr>
              <tr><td>Balance</td><td>{{ balVal('VL') }}</td><td>{{ balVal('SL') }}</td></tr>
            </table>
            <div class="sig"><div class="sig-name">{{ certStep?.acted_by_name || s.hr_certifying_officer || '' }}</div><div class="sm">{{ certStep?.acted_by_position || s.hr_certifying_position || '(Authorized Officer)' }}</div></div>
          </td>
          <td colspan="2" class="top">
            <div class="lb">7.B RECOMMENDATION</div>
            <div class="opt"><span class="box">{{ supStep && supStep.status === 'APPROVED' ? '✔' : '' }}</span>For approval</div>
            <div class="opt"><span class="box">{{ supStep && ['DISAPPROVED','RETURNED'].includes(supStep.status) ? '✔' : '' }}</span>For disapproval due to <u>{{ supStep && ['DISAPPROVED','RETURNED'].includes(supStep.status) ? supStep.remarks : '' }}</u></div>
            <div class="sig"><div class="sig-name">{{ supStep?.acted_by_name || '' }}</div><div class="sm">{{ supStep?.acted_by_position || '(Authorized Officer)' }}</div></div>
          </td>
        </tr>
        <tr>
          <td colspan="2" class="top">
            <div class="lb">7.C APPROVED FOR:</div>
            <div class="opt"><u>&nbsp;{{ r.status === 'APPROVED' ? fmtDays(r.days_with_pay) : '' }}&nbsp;</u> days with pay</div>
            <div class="opt"><u>&nbsp;{{ r.status === 'APPROVED' ? fmtDays(r.days_without_pay) : '' }}&nbsp;</u> days without pay</div>
            <div class="opt">______ others (Specify)</div>
          </td>
          <td colspan="2" class="top">
            <div class="lb">7.D DISAPPROVED DUE TO:</div>
            <div class="opt"><u>{{ r.status === 'DISAPPROVED' ? disStep?.remarks : '' }}</u></div>
          </td>
        </tr>
        <tr>
          <td colspan="4" style="text-align:center;padding-top:30px">
            <div class="sig-name" style="display:inline-block;min-width:300px">{{ finalStep?.acted_by_name || s.approving_officer || '' }}</div>
            <div class="sm">{{ finalStep?.acted_by_position || s.approving_position || '(Authorized Official)' }}</div>
          </td>
        </tr>
      </table>
      <div class="sm" style="margin-top:6px">Generated by the {{ s.org_short || 'R1MC' }} Leave System · Status: {{ r.status }} · Printed {{ fmtDateTime(now) }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../api';
import { fmtDate, fmtDateTime, fmtDays } from '../format';

const route = useRoute();
const d = ref(null);
const types = ref([]);
const s = ref({});
const now = new Date().toISOString().replace('T', ' ');
const r = computed(() => d.value.request);
const e = computed(() => d.value.employee);
const snap = computed(() => d.value.credits_snapshot);
const steps = computed(() => d.value.steps);
const certStep = computed(() => steps.value.find((x) => x.certifies_credits && x.status === 'APPROVED'));
const supStep = computed(() => steps.value.find((x) => x.approver_type !== 'ROLE' && x.status !== 'SKIPPED'));
const disStep = computed(() => steps.value.find((x) => x.status === 'DISAPPROVED'));
const finalStep = computed(() => (r.value.status === 'APPROVED' ? [...steps.value].reverse().find((x) => x.status === 'APPROVED') : disStep.value));
const ck = (v) => (r.value.detail_option === v ? '✔' : '');
const snapVal = (code) => (snap.value && snap.value[code] !== undefined ? fmtDays(snap.value[code]) : '');
const usedFrom = (code) => {
  if (!snap.value || snap.value.balance_type !== code) return 0;
  return r.value.status === 'APPROVED' ? Number(r.value.days_with_pay) : Math.min(Number(r.value.days_applied), Number(snap.value[code] || 0));
};
const lessVal = (code) => (snap.value ? fmtDays(usedFrom(code)) : '');
const balVal = (code) => (snap.value && snap.value[code] !== undefined ? fmtDays(Number(snap.value[code]) - usedFrom(code)) : '');

function print() { window.print(); }

onMounted(async () => {
  const [detail, lt, settings] = await Promise.all([api.get(`/requests/${route.params.id}`), api.get('/admin/leave-types'), api.get('/admin/settings')]);
  d.value = detail;
  types.value = lt.types.filter((t) => t.is_active || t.id === detail.request.leave_type_id);
  s.value = settings;
});
</script>

<style scoped>
.f6-screen { background: #e9e7e0; min-height: 100vh; padding: 20px 10px; }
.f6-toolbar { max-width: 816px; margin: 0 auto 12px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.f6 { background: #fff; color: #000; max-width: 816px; margin: 0 auto; padding: 28px 34px; font: 11px/1.35 Arial, Helvetica, sans-serif; box-shadow: 0 2px 10px rgba(0,0,0,.15); }
.f6-top { display: flex; justify-content: space-between; font-size: 10px; }
.f6-tracking { font-family: Consolas, monospace; font-size: 11px; border: 1px solid #000; padding: 2px 6px; height: fit-content; }
.f6-head { text-align: center; margin: 4px 0 10px; }
.f6-head .b { font-weight: 700; font-size: 13px; }
.f6-title { font-weight: 700; font-size: 16px; margin-top: 10px; letter-spacing: .04em; }
.f6-t { width: 100%; border-collapse: collapse; }
.f6-t > tr > td, .f6-t td { border: 1px solid #000; padding: 4px 6px; vertical-align: middle; }
.f6-t td.top { vertical-align: top; }
.sec { text-align: center; font-weight: 700; background: #ddd; }
.lb { font-weight: 700; font-size: 10.5px; }
.val { font-weight: 700; font-size: 12px; }
.sm { font-size: 9.5px; }
.i { font-style: italic; }
.name-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0 8px; }
.opt { margin: 2px 0; }
.box { display: inline-block; width: 12px; height: 12px; border: 1px solid #000; margin-right: 6px; text-align: center; line-height: 11px; font-size: 10px; vertical-align: -2px; }
.sig { text-align: center; margin-top: 22px; }
.sig-name { border-top: 1px solid #000; padding-top: 2px; font-weight: 700; min-height: 16px; margin: 0 20px; text-transform: uppercase; }
.f6-c { width: 100%; border-collapse: collapse; margin: 6px 0; }
.f6-c th, .f6-c td { border: 1px solid #000; padding: 2px 4px; text-align: center; font-size: 10.5px; }
.f6-c td:first-child { text-align: left; }
@media print {
  .f6-screen { background: #fff; padding: 0; }
  .f6 { box-shadow: none; padding: 0; max-width: none; }
  @page { margin: 12mm; }
}
</style>
