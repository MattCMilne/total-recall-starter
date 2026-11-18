// Creates (or resets) the owner login. Run it in a terminal, never in a chat:
//   npm run create-owner -- you@example.com "Your Name"
// It asks for the password without showing it. On Railway: railway run npm run create-owner -- ...
import readline from 'node:readline';
import { pool, migrate, one } from '../server/db.js';
import { hashPassword } from '../server/auth.js';

const [email, ...nameParts] = process.argv.slice(2);
const name = nameParts.join(' ').trim();
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Usage: npm run create-owner -- you@example.com "Your Name"');
  process.exit(1);
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); };
    rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

const password = process.env.OWNER_PASSWORD || await askHidden('Choose a password (12+ characters): ');
if (password.length < 12) {
  console.error('Use at least 12 characters.');
  process.exit(1);
}
await migrate();
const row = await one(
  `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
   ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, name = COALESCE(NULLIF(EXCLUDED.name, ''), users.name)
   RETURNING id, email`, [email.toLowerCase(), name, await hashPassword(password)]);
console.log(`Owner login ready for ${row.email}.`);
await pool.end();
