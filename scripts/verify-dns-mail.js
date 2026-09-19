/**
 * DNS-only mail auth checks for Destinations With Deanna (no secrets, no SMTP).
 * Usage: node scripts/verify-dns-mail.js [domain]
 */
const dns = require('dns').promises;

const DEFAULT_DOMAIN = 'destinationswithdeanna.com';
const EXPECTED_SEND_IP = '87.106.199.222';
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

async function main() {
  const domain = String(process.argv[2] || DEFAULT_DOMAIN)
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
  let failures = 0;

  console.log(`\nMail DNS check for ${domain}\n`);

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
  } else if (spfs.length > 1) {
    fail(`SPF: multiple SPF TXT records (merge into one): ${spfs.join(' | ')}`);
    failures += 1;
  } else {
    const spf = spfs[0];
    pass(`SPF: ${spf}`);
    if (spfAuthorizesPrime(spf)) {
      pass('SPF appears to authorize Prime/Plesk sending (a/mx/cp.prime.ax/ip4)');
    } else {
      fail('SPF does not clearly authorize cp.prime.ax / Prime sending IP — add a:cp.prime.ax or ip4:87.106.199.222');
      failures += 1;
    }
    if (!/-all\s*$/i.test(spf) && !/~all\s*$/i.test(spf)) {
      warn('SPF ends without -all/~all — prefer -all once mail path is confirmed');
    }
  }

  const dmarcName = `_dmarc.${domain}`;
  const dmarcTxts = await txtRecords(dmarcName);
  const dmarc = dmarcTxts.find((t) => /^v=dmarc1\b/i.test(t));
  if (!dmarc) {
    fail(`DMARC: missing TXT at ${dmarcName}`);
    failures += 1;
  } else {
    pass(`DMARC: ${dmarc}`);
    if (!/\brua=/i.test(dmarc)) {
      warn('DMARC has no rua= — add aggregate report mailbox when ready');
    }
    if (/\baspf=s\b/i.test(dmarc) || /\badkim=s\b/i.test(dmarc)) {
      info('DMARC uses strict alignment (aspf=s and/or adkim=s) — From, Return-Path, and DKIM d= must be exact domain match');
    }
  }

  const policyTxts = await txtRecords(`_domainkey.${domain}`);
  if (policyTxts.length) {
    pass(`_domainkey policy: ${policyTxts.join(' | ')}`);
  } else {
    info('_domainkey policy TXT not present (optional; Plesk often publishes o=-)');
  }

  let dkimFound = 0;
  for (const selector of DKIM_SELECTORS) {
    const name = `${selector}._domainkey.${domain}`;
    const records = await txtRecords(name);
    const dkim = records.find((t) => /v=dkim1/i.test(t) || /\bp=/.test(t));
    if (dkim) {
      dkimFound += 1;
      const preview = dkim.length > 120 ? `${dkim.slice(0, 117)}...` : dkim;
      pass(`DKIM ${selector}: ${preview}`);
    }
  }
  if (!dkimFound) {
    fail('DKIM: no common selector TXT found (expected default._domainkey from Plesk)');
    failures += 1;
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

  const ptrs = await ptrRecords(EXPECTED_SEND_IP);
  if (!ptrs.length) {
    fail(`PTR for ${EXPECTED_SEND_IP}: missing — Prime.ax must publish reverse DNS`);
    failures += 1;
  } else {
    info(`PTR ${EXPECTED_SEND_IP} → ${ptrs.join(', ')}`);
    const ptrOk = ptrs.some((h) => /prime\.ax$/i.test(h) || h.toLowerCase().includes(domain));
    if (!ptrOk) {
      warn(
        `PTR does not match prime.ax or ${domain} (currently ${ptrs.join(', ')}). Mismatched rDNS hurts reputation; ask Prime to set PTR to cp.prime.ax or the mail hostname.`
      );
    }
  }

  console.log('\nNotes (not DNS-fixable here):');
  console.log('- Hotmail/Outlook S3150 on 87.106.199.222 is provider IP reputation — Prime.ax must pursue delist/SNDS.');
  console.log('- Invalid recipient domains (NXDOMAIN / no MX) are recipient-side and not fixed by DMARC.');
  console.log('- Prefer Plesk server-side DKIM signing; optional app DKIM uses DKIM_SELECTOR + DKIM_PRIVATE_KEY env only.\n');

  if (failures) {
    console.log(`Result: ${failures} failure(s). See DEPLOY-PLESK.md → Email authentication.`);
    process.exitCode = 1;
  } else {
    console.log('Result: DNS checks passed (still confirm Plesk DKIM signing is enabled and IP reputation is clean).');
  }
}

main().catch((err) => {
  console.error('DNS verify failed:', err.message || err);
  process.exitCode = 1;
});
