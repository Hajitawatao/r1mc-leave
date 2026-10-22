<template>
  <div class="page">
    <div class="page-head">
      <div><h1>Import employees &amp; opening balances</h1><div class="sub">Load employee records from a Medsys export and opening leave credits from the Excel leave ledger.</div></div>
      <button class="btn" @click="download('/import/template')">Download template</button>
    </div>
    <div class="grid-main">
      <div class="card card-pad stack">
        <h2>1. Choose the file</h2>
        <input class="input" type="file" accept=".xlsx,.csv" @change="onFile" />
        <div class="form-grid">
          <label class="field">Balances are as of<input class="input" type="date" v-model="asOf" /><span class="help">The cut-off date of the Excel ledger. Post accruals for later months afterwards.</span></label>
          <label class="check" style="align-self:center"><input type="checkbox" v-model="overwrite" /> Overwrite balances of employees who already have leave history</label>
        </div>
        <h2>2. Check it</h2>
        <button class="btn" :disabled="!file || busy" style="align-self:flex-start" @click="run(true)">Validate (no changes)</button>
        <template v-if="result">
          <div class="stats">
            <div class="stat"><div class="label">Rows</div><div class="value">{{ result.total_rows }}</div></div>
            <div class="stat"><div class="label">New employees</div><div class="value">{{ result.new_employees }}</div></div>
            <div class="stat"><div class="label">Updates</div><div class="value">{{ result.updated_employees }}</div></div>
            <div class="stat"><div class="label">Rows with errors</div><div class="value" :style="{ color: result.error_rows ? 'var(--bad)' : '' }">{{ result.error_rows }}</div></div>
          </div>
          <div v-if="result.errors.length" class="card table-wrap">
            <table class="table"><thead><tr><th>Row</th><th>Employee no.</th><th>Problem</th></tr></thead>
              <tbody><tr v-for="e in result.errors" :key="e.row"><td>{{ e.row }}</td><td class="mono">{{ e.employee_no }}</td><td>{{ e.errors.join('; ') }}</td></tr></tbody></table>
          </div>
          <div v-if="!result.dry_run" class="alert ok">Import complete. {{ result.valid_rows }} employee(s) saved, {{ result.balances_set }} opening balance(s) set. Rows with errors were skipped.</div>
        </template>
        <h2>3. Import</h2>
        <button class="btn primary" :disabled="!file || busy || !result || !result.dry_run || !result.valid_rows" style="align-self:flex-start" @click="run(false)">Import {{ result && result.dry_run ? result.valid_rows + ' valid row(s)' : '' }}</button>
        <div v-if="error" class="alert error">{{ error }}</div>
      </div>
      <div class="card card-pad">
        <h2>How it works</h2>
        <ul class="muted" style="padding-left:18px">
          <li>Required columns: <span class="mono">employee_no, last_name, first_name</span>.</li>
          <li>Existing employees are matched by employee number and updated.</li>
          <li>Departments in the file are created automatically.</li>
          <li><span class="mono">supervisor_employee_no</span> sets the immediate supervisor who approves first.</li>
          <li><span class="mono">vl_balance, sl_balance</span> become opening balances on the leave card.</li>
          <li>New employees get a login: username and initial password are both the employee number. They must change it at first login.</li>
          <li>Excel <span class="mono">.xls</span> files must be saved as <span class="mono">.xlsx</span> or <span class="mono">.csv</span> first.</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { api, download } from '../../api';
import { toast } from '../../store';

const file = ref(null);
const asOf = ref('');
const overwrite = ref(false);
const result = ref(null);
const error = ref('');
const busy = ref(false);

function onFile(e) { file.value = e.target.files[0] || null; result.value = null; }
watch(overwrite, () => { if (result.value && !result.value.dry_run) return; result.value = null; });

async function run(dry) {
  error.value = '';
  busy.value = true;
  const fd = new FormData();
  fd.append('file', file.value);
  fd.append('dry_run', String(dry));
  fd.append('overwrite_balances', String(overwrite.value));
  if (asOf.value) fd.append('as_of', asOf.value);
  try {
    result.value = await api.post('/import/employees', fd);
    if (!dry) toast('Import complete');
  } catch (e) { error.value = e.message; } finally { busy.value = false; }
}
</script>
