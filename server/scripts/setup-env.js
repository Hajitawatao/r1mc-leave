/* Creates server/.env interactively (used by setup.bat). Leaves an existing .env untouched. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  console.log('server\\.env already exists - keeping it.');
  process.exit(0);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q, def) => new Promise((res) => rl.question(`${q}${def !== undefined ? ` [${def}]` : ''}: `, (a) => res(a.trim() || def || '')));

(async () => {
  console.log('\nDatabase connection (MySQL / MariaDB from XAMPP is fine)');
  const host = await ask('  MySQL host', '127.0.0.1');
  const port = await ask('  MySQL port', '3306');
  const user = await ask('  MySQL user', 'root');
  const password = await ask('  MySQL password (Enter if none)', '');
  const name = await ask('  Database name', 'r1mc_leave');
  const appPort = await ask('Web port for the leave system', '8080');
  rl.close();
  const lines = [
    '# R1MC Leave System configuration (created by setup.bat)',
    `PORT=${appPort}`,
    'HOST=0.0.0.0',
    `DB_HOST=${host}`,
    `DB_PORT=${port}`,
    `DB_USER=${user}`,
    `DB_PASSWORD=${password}`,
    `DB_NAME=${name}`,
    `JWT_SECRET=${crypto.randomBytes(32).toString('hex')}`,
    'SESSION_HOURS=10',
    'MAX_UPLOAD_MB=10',
    '',
    '# Optional email notifications (leave SMTP_HOST empty to use in-app notifications only)',
    'SMTP_HOST=',
    'SMTP_PORT=25',
    'SMTP_SECURE=false',
    'SMTP_USER=',
    'SMTP_PASS=',
    'SMTP_FROM=R1MC Leave System <no-reply@r1mc.local>',
    '# Address staff use to open the system, used for links in emails, e.g. http://192.168.1.10:8080',
    'APP_URL=',
    '',
  ];
  fs.writeFileSync(envPath, lines.join('\r\n'));
  console.log('Saved server\\.env');
})();
