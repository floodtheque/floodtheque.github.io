// Définit le mot de passe administrateur : il est demandé sans être affiché, haché (scrypt)
// et SEUL le hash est écrit dans le fichier .env à la racine du projet (ignoré par git).
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { ROOT } from '../src/config.js';
import { hashPassword } from '../src/security.js';

const ENV_FILE = path.join(ROOT, '.env');

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); }; // n'affiche pas la saisie
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

const first = await askHidden('Nouveau mot de passe admin (12 caractères minimum) : ');
if (first.length < 12) {
  console.error('✗ Trop court : 12 caractères minimum (une phrase de passe, c\'est très bien).');
  process.exit(1);
}
const second = await askHidden('Confirme-le : ');
if (first !== second) {
  console.error('✗ Les deux saisies ne correspondent pas.');
  process.exit(1);
}

const line = `FLOOD_ADMIN_PASSWORD_HASH='${hashPassword(first)}'`;
const existing = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
const next = /^FLOOD_ADMIN_PASSWORD_HASH=.*$/m.test(existing)
  ? existing.replace(/^FLOOD_ADMIN_PASSWORD_HASH=.*$/m, line)
  : `${existing}${existing && !existing.endsWith('\n') ? '\n' : ''}${line}\n`;
fs.writeFileSync(ENV_FILE, next, { mode: 0o600 });
console.log(`✔ Hash enregistré dans ${ENV_FILE}. Redémarre le serveur, puis connecte-toi sur /admin.`);
