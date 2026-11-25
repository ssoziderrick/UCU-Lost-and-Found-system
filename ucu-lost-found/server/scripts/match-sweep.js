// Re-scores every open lost report against open found reports and expires stale suggestions.
//   npm run match:sweep
const db = require('../src/db');
const { sweep } = require('../src/matching/service');

sweep()
  .then((r) => console.log(`Re-scored ${r.lostReports} open lost report(s): ${r.suggestions} suggestion(s) kept, ${r.expired} expired.`))
  .catch((err) => { console.error('Sweep failed:', err.message); process.exitCode = 1; })
  .finally(() => db.pool.end());
