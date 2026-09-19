/**
 * DNS + Gmail-focused deliverability checks for Destinations With Deanna (no secrets, no SMTP).
 * Usage: node scripts/verify-dns-mail.js [domain]
 */
const dns = require('dns').promises;

const DEFAULT_DOMAIN = 'destinationswithdeanna.com';
const EXPECTED_SEND_IP = '87.106.199.222';
const EXPECTED_PTR_HOST = 'cp.prime.ax';
const DKIM_SELECTORS = [
  'default',
  'mail',
  's1',
  'selector1',
  'google',
  'plesk',
  'k1',
  'dkim',
];

function pass(msg) {
  console.log(`PASS  ${msg}`);
}

function fail(msg) {
  console.log(`FAIL  ${msg}`);
}

function warn(msg) {
  console.log(`WARN  ${msg}`);
}

function info(msg) {
  console.log(`INFO  ${msg}`);
}

async function txtRecords(name) {
  try {
    const rows = await dns.resolveTxt(name);
    return rows.map((parts) => parts.join(''));
  } catch (err) {
    if (err && (err.code === 'ENODATA' || err.code === 'ENOTFOUND')) return [];
    throw err;
  }
}

async function mxRecords(name) {
  try {
    return await dns.resolveMx(name);
  } catch (err) {
    if (err && (err.code === 'ENODATA' || err.code === 'ENOTFOUND')) return [];
    throw err;
  }
}

async function aRecords(name) {
  try {
    return await dns.resolve4(name);
  } catch (err) {
    if (err && (err.code === 'ENODATA' || err.code === 'ENOTFOUND')) return [];
    throw err;
  }
}

async function ptrRecords(ip) {
  try {
    return await dns.reverse(ip);
  } catch (err) {
    if (err && (err.code === 'ENODATA' || err.code === 'ENOTFOUND')) return [];
    throw err;
  }
}

function findSpf(txts) {
  return txts.filter((t) => /^v=spf1\b/i.test(t));
}

function spfAuthorizesPrime(spf) {
  const lower = spf.toLowerCase();
  return (
    lower.includes('a:cp.prime.ax') ||
    lower.includes('include:prime.ax') ||
    lower.includes(`ip4:${EXPECTED_SEND_IP}`) ||
    /\ba\b/.test(lower) ||
    /\bmx\b/.test(lower)
  );
}

/**
 * Forward-confirmed reverse DNS: PTR hostname must resolve back to the same IP.
 * Gmail and Outlook weigh this heavily; a PTR to an unrelated CDN name is a hard fail.
 */
async function checkFcrDns(ip, ptrHostnames) {
  const results = [];
  for (const host of ptrHostnames) {
    const name = String(host || '')
      .trim()
      .replace(/\.$/, '')
      .toLowerCase();
    if (!name) continue;
    const forwards = await aRecords(name);
    const matches = forwards.includes(ip);
    results.push({ name, forwards, matches });
  }
  return results;
}

async function main() {
  const domain = String(process.argv[2] || DEFAULT_DOMAIN)
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
  let failures = 0;
  let gmailBlockers = 0;

  console.log(`\nMail DNS check for ${domain}\n`);
  console.log('=== Core DNS ===\n');

  const mx = await mxRecords(domain);
  if (mx.length) {
    pass(`MX: ${mx.map((r) => `${r.exchange} (prio ${r.priority})`).join(', ')}`);
  } else {
    fail('MX: none published');
    failures += 1;
  }

  const apexA = await aRecords(domain);
  if (apexA.includes(EXPECTED_SEND_IP)) {
    pass(`A ${domain} → ${apexA.join(', ')} (includes sending IP ${EXPECTED_SEND_IP})`);
  } else if (apexA.length) {
    warn(`A ${domain} → ${apexA.join(', ')} (expected ${EXPECTED_SEND_IP} for current Prime host)`);
  } else {
    warn(`A ${domain}: none`);
  }

  const txts = await txtRecords(domain);
  const spfs = findSpf(txts);
  if (spfs.length === 0) {
    fail('SPF: no v=spf1 TXT on apex');
    failures += 1;
    gmailBlockers += 1;
  } else if (spfs.length > 1) {
    fail(`SPF: multiple SPF TXT records (merge into one): ${spfs.join(' | ')}`);
    failures += 1;
    gmailBlockers += 1;
  } else {
    const spf = spfs[0];
    pass(`SPF: ${spf}`);
    if (spfAuthorizesPrime(spf)) {
      pass('SPF appears to authorize Prime/Plesk sending (a/mx/cp.prime.ax/ip4)');
    } else {
      fail(
        'SPF does not clearly authorize cp.prime.ax / Prime sending IP — add a:cp.prime.ax or ip4:87.106.199.222'
      );
      failures += 1;
      gmailBlockers += 1;
    }
    if (!/-all\s*$/i.test(spf) && !/~all\s*$/i.test(spf)) {
      warn('SPF ends without -all/~all — prefer -all once mail path is confirmed');
    }
  }

  const dmarcName = `_dmarc.${domain}`;
  const dmarcTxts = await txtRecords(dmarcName);
  const dmarc = dmarcTxts.find((t) => /^v=dmarc1\b/i.test(t));
  let dmarcStrict = false;
  let dmarcPolicy = '';
  if (!dmarc) {
    fail(`DMARC: missing TXT at ${dmarcName}`);
    failures += 1;
    gmailBlockers += 1;
  } else {
    pass(`DMARC: ${dmarc}`);
    const policyMatch = dmarc.match(/\bp=(none|quarantine|reject)\b/i);
    dmarcPolicy = policyMatch ? policyMatch[1].toLowerCase() : '';
    dmarcStrict = /\baspf=s\b/i.test(dmarc) || /\badkim=s\b/i.test(dmarc);
    if (!/\brua=/i.test(dmarc)) {
      warn('DMARC has no rua= — add aggregate report mailbox when ready');
    }
    if (dmarcStrict) {
      info(
        'DMARC uses strict alignment (aspf=s and/or adkim=s) — From, Return-Path, and DKIM d= must be exact domain match (not just organizational domain)'
      );
    }
    if (dmarcPolicy === 'quarantine' || dmarcPolicy === 'reject') {
      info(
        `DMARC p=${dmarcPolicy}: failed alignment is treated harshly by receivers. Temporary p=none can help isolate auth vs reputation while testing — see DEPLOY-PLESK.md tradeoffs.`
      );
    }
  }

  const policyTxts = await txtRecords(`_domainkey.${domain}`);
  if (policyTxts.length) {
    pass(`_domainkey policy: ${policyTxts.join(' | ')}`);
  } else {
    info('_domainkey policy TXT not present (optional; Plesk often publishes o=-)');
  }

  let dkimFound = 0;
  let defaultDkim = false;
  for (const selector of DKIM_SELECTORS) {
    const name = `${selector}._domainkey.${domain}`;
    const records = await txtRecords(name);
    const dkim = records.find((t) => /v=dkim1/i.test(t) || /\bp=/.test(t));
    if (dkim) {
      dkimFound += 1;
      if (selector === 'default') defaultDkim = true;
      const preview = dkim.length > 120 ? `${dkim.slice(0, 117)}...` : dkim;
      pass(`DKIM ${selector}: ${preview}`);
    }
  }
  if (!dkimFound) {
    fail('DKIM: no common selector TXT found (expected default._domainkey from Plesk)');
    failures += 1;
    gmailBlockers += 1;
  } else if (!defaultDkim) {
    warn('DKIM default selector not found — Plesk usually signs with s=default');
  }

  try {
    const cpA = await aRecords('cp.prime.ax');
    if (cpA.includes(EXPECTED_SEND_IP)) {
      pass(`cp.prime.ax → ${cpA.join(', ')}`);
    } else {
      warn(`cp.prime.ax → ${cpA.join(', ') || '(none)'} (expected ${EXPECTED_SEND_IP})`);
    }
  } catch {
    warn('Could not resolve cp.prime.ax');
  }

  console.log('\n=== Gmail / reverse DNS (FCrDNS) ===\n');

  const ptrs = await ptrRecords(EXPECTED_SEND_IP);
  if (!ptrs.length) {
    fail(`PTR for ${EXPECTED_SEND_IP}: missing — IONOS/Prime must publish reverse DNS`);
    failures += 1;
    gmailBlockers += 1;
  } else {
    info(`PTR ${EXPECTED_SEND_IP} → ${ptrs.join(', ')}`);
    const fcr = await checkFcrDns(EXPECTED_SEND_IP, ptrs);
    let anyMatch = false;
    for (const row of fcr) {
      if (row.matches) {
        anyMatch = true;
        pass(`FCrDNS: ${row.name} → ${row.forwards.join(', ')} (matches sending IP)`);
      } else {
        fail(
          `FCrDNS broken: PTR ${row.name} → A ${row.forwards.join(', ') || '(none)'} (does not include ${EXPECTED_SEND_IP})`
        );
        failures += 1;
        gmailBlockers += 1;
      }
    }
    const ptrLooksLikeMailHost = ptrs.some(
      (h) =>
        /prime\.ax$/i.test(h) ||
        h.toLowerCase().includes(domain) ||
        h.toLowerCase() === EXPECTED_PTR_HOST
    );
    if (!ptrLooksLikeMailHost) {
      fail(
        `PTR hostname should be ${EXPECTED_PTR_HOST} (or a mail hostname on ${domain}), not ${ptrs.join(', ')}. Ask IONOS/Prime to fix reverse DNS.`
      );
      failures += 1;
      gmailBlockers += 1;
    } else if (anyMatch) {
      pass(`PTR hostname looks like a mail host (${ptrs.join(', ')})`);
    }
  }

  console.log('\n=== Gmail-focused summary ===\n');
  if (gmailBlockers === 0) {
    pass('Public DNS looks Gmail-ready for SPF/DKIM/DMARC + FCrDNS (still confirm live message auth)');
  } else {
    fail(`${gmailBlockers} Gmail-relevant issue(s) above — fix these before blaming HTML/content`);
  }

  console.log('\nManual Gmail checklist (not DNS-queryable here):');
  console.log('  1. Verify domain in Google Postmaster Tools: https://postmaster.google.com/');
  console.log('  2. Send a test to a Gmail inbox → open message → ⋮ → Show original');
  console.log('     Expect: SPF PASS, DKIM PASS (d=destinationswithdeanna.com), DMARC PASS');
  console.log('  3. Confirm Return-Path / envelope From is @destinationswithdeanna.com (strict aspf=s)');
  console.log('  4. Confirm DKIM-Signature d= matches From domain exactly (strict adkim=s)');
  console.log('  5. PTR must be fixed at the IP provider (IONOS/Prime) — Cloudflare DNS cannot set PTR');
  console.log(
    '  6. Shared IP reputation on 87.106.199.222 / Microsoft S3150 is provider-side — code cannot clear it'
  );
  console.log('  7. Optional while testing auth: soften DMARC to p=none (document tradeoffs in DEPLOY-PLESK.md)');

  console.log('\nNotes:');
  console.log('- iCloud often accepts when SPF/DKIM pass even if IP reputation is mediocre; Gmail/Outlook are stricter.');
  console.log('- Hotmail/Outlook S3150 on 87.106.199.222: https://sender.office.com/ + Prime SNDS.');
  console.log('- Prefer Plesk server-side DKIM; optional app DKIM uses DKIM_SELECTOR + DKIM_PRIVATE_KEY env only.\n');

  if (failures) {
    console.log(`Result: ${failures} failure(s). See DEPLOY-PLESK.md → Email authentication / Gmail checklist.`);
    process.exitCode = 1;
  } else {
    console.log(
      'Result: DNS checks passed (still confirm Plesk DKIM signing is enabled and IP reputation is clean).'
    );
  }
}

main().catch((err) => {
  console.error('DNS verify failed:', err.message || err);
  process.exitCode = 1;
});
