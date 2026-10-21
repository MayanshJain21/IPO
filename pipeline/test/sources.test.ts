import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseBseIssues } from '../src/sources/bse';
import {
  parseIssueSize,
  parseNseCurrent,
  parseNseDetail,
  parseNsePast,
  parseNseSubscription,
} from '../src/sources/nse';
import { docTypeFromLabel, parseSebiListing, splitTitle } from '../src/sources/sebi';
import { deriveIssueStatus } from '../src/store/ipos';
import { fixtureJson, fixtureText } from './helpers';

describe('SEBI listing parser', () => {
  it('parses a full DRHP list page (double-quoted markup)', () => {
    const rows = parseSebiListing(fixtureText('sebi-drhp-page.html'), 'drhp');
    assert.equal(rows.length, 25);
    assert.deepEqual(rows[0], {
      companyName: 'Hunger Pangs Limited',
      slug: 'hunger-pangs',
      docType: 'drhp',
      title: 'Hunger Pangs Limited – DRHP',
      filedOn: '2026-10-21',
      sourceUrl:
        'https://www.sebi.gov.in/filings/public-issues/oct-2026/hunger-pangs-limited-drhp_105347.html',
    });
    const bySlug = new Map(rows.map((r) => [r.slug, r]));
    assert.equal(bySlug.get('tablespace-technologies')?.docType, 'addendum');
    assert.equal(bySlug.get('paramotor-digital-technology')?.docType, 'drhp'); // UDRHP-I
  });

  it('parses an AJAX page (single-quoted markup) the same way', () => {
    const rows = parseSebiListing(fixtureText('sebi-rhp-ajax.html'), 'rhp');
    assert.equal(rows.length, 25);
    assert.equal(rows[0]?.companyName, 'BLS Polymers Limited');
    assert.equal(rows[0]?.docType, 'rhp');
    assert.equal(rows[0]?.filedOn, '2026-10-19');
  });

  it('splits the hand-typed title formats seen on SEBI', () => {
    const cases: [string, string, string][] = [
      ['Hunger Pangs Limited – DRHP', 'Hunger Pangs Limited', 'DRHP'],
      ['Grace Renewable Energy Limited- DRHP', 'Grace Renewable Energy Limited', 'DRHP'],
      [
        'Zetwerk Manufacturing Businesses Limited : Addendum to RHP',
        'Zetwerk Manufacturing Businesses Limited',
        'Addendum to RHP',
      ],
      [
        'A-One Steels Limited – Addendum - II to DRHP',
        'A-One Steels Limited',
        'Addendum - II to DRHP',
      ],
      ['PM CONA INDUSTRIES LIMITED', 'PM CONA INDUSTRIES LIMITED', ''], // no label at all
    ];
    for (const [title, company, label] of cases) {
      assert.deepEqual(splitTitle(title), { company, label }, title);
    }
  });

  it('classifies labels, falling back to the list a row came from', () => {
    assert.equal(docTypeFromLabel('Addendum to DRHP', 'drhp'), 'addendum');
    assert.equal(docTypeFromLabel('UDRHP-I', 'drhp'), 'drhp');
    assert.equal(docTypeFromLabel('Draft Red Herring Prospectus', 'drhp'), 'drhp');
    assert.equal(docTypeFromLabel('RHP', 'rhp'), 'rhp');
    assert.equal(docTypeFromLabel('Prospectus', 'prospectus'), 'prospectus');
  });
});

describe('NSE parsers', () => {
  it('keeps only mainboard (EQ) current issues', () => {
    const rows = parseNseCurrent(fixtureJson('nse-current-issue.json'));
    assert.deepEqual(
      rows.find((r) => r.symbol === 'PARASHLTH'),
      {
        symbol: 'PARASHLTH',
        companyName: 'Paras Healthcare Limited',
        slug: 'paras-healthcare',
        openDate: '2026-10-21',
        closeDate: '2026-10-23',
        priceBandLow: 660,
        priceBandHigh: 693,
        listingDate: null,
      },
    );
  });

  it('drops SME and debt from past issues and reads listing dates', () => {
    const rows = parseNsePast(fixtureJson('nse-past-issues.json'));
    assert.equal(rows.length, 12); // the fixture has 12 EQ + 4 SME + 2 DEBT
    assert.equal(rows.find((r) => r.slug === 'fusion-cx')?.listingDate, '2026-10-22');
  });

  it('extracts lot, face value, fresh issue vs OFS in crore, managers, registrar', () => {
    const d = parseNseDetail(fixtureJson('nse-ipo-detail.json'));
    assert.equal(d.lotSize, 21);
    assert.equal(d.faceValue, 1);
    assert.equal(d.freshIssueCr, 500); // Rs. 5000 million
    assert.equal(d.ofsCr, 950); // Rs. 9,500 million
    assert.equal(d.issueSizeCr, 1450);
    assert.equal(d.leadManagers?.length, 3);
    assert.equal(d.registrar, 'MUFG Intime India Private Limited');
  });

  it('reads subscription per investor category', () => {
    const s = parseNseSubscription(fixtureJson('nse-active-category.json'));
    assert.ok(s);
    assert.ok(Math.abs(s.retail! - 0.6934) < 0.001);
    assert.ok(Math.abs(s.total! - 0.1472) < 0.001);
    assert.equal(s.updatedAt, '2026-10-21T11:27:00.000Z'); // 16:57 IST
  });

  it('rejects a response whose shape changed (Zod at the border)', () => {
    assert.throws(() => parseNseCurrent([{ symbol: 'X', name: 'renamed field' }]));
  });
});

describe('parseIssueSize: real NSE sentences (regressions)', () => {
  it('ignores ₹ amounts inside brackets: they are sub-portions, not the issue', () => {
    // Jio Platforms: fresh issue in shares; Rs. 5,000 million is the employee portion
    assert.deepEqual(
      parseIssueSize(
        'Initial Public Offer comprising of Fresh Issue of up to 27,00,00,000 equity shares (including Employee Reservation Portion aggregating up to Rs. 5,000 million, Eligible RIL shareholders portion aggregating up to Rs. 25,000 million and Anchor reservation portion of 7,24,74,066 equity shares)',
      ),
      { freshIssueCr: null, ofsCr: null, issueSizeCr: null },
    );
    // HD Fire Protect: OFS in shares; Rs. 17.50 million is the employee reservation
    assert.deepEqual(
      parseIssueSize(
        'Initial Public offer comprising of Offer for sale up to 26,284,500 Equity Shares (Including Eligible Employee Reservation up to Rs. 17.50 million and Anchor portion 78,64,008 Equity Shares)',
      ),
      { freshIssueCr: null, ofsCr: null, issueSizeCr: null },
    );
  });

  it('keeps the known part when the other is in shares', () => {
    // AceVector: fresh ₹287 cr, OFS in shares → total unknown
    assert.deepEqual(
      parseIssueSize(
        'Initial Public offering comprising of Fresh issue aggregating up to Rs. 2870 million and offer for sale up to 4,15,62,500 Equity Shares (including Anchor portion of 5,90,62,500 Equity Shares)',
      ),
      { freshIssueCr: 287, ofsCr: null, issueSizeCr: null },
    );
  });
});

describe('BSE parser', () => {
  it('keeps only mainboard IPOs', () => {
    const rows = parseBseIssues(fixtureJson('bse-public-issues.json'));
    const jio = rows.find((r) => r.slug === 'jio-platforms');
    assert.equal(jio?.priceBandLow, 1065);
    assert.equal(jio?.priceBandHigh, 1119);
    assert.equal(jio?.faceValue, 10);
    assert.ok(!rows.some((r) => r.slug === 'natco-pharma')); // a rights issue, not an IPO
  });
});

describe('deriveIssueStatus', () => {
  const d = { openDate: '2026-10-21', closeDate: '2026-10-23', listingDate: null };
  it('follows the dates', () => {
    assert.equal(deriveIssueStatus(d, '2026-10-20'), 'upcoming');
    assert.equal(deriveIssueStatus(d, '2026-10-21'), 'open');
    assert.equal(deriveIssueStatus(d, '2026-10-23'), 'open');
    assert.equal(deriveIssueStatus(d, '2026-10-24'), 'closed');
    assert.equal(deriveIssueStatus({ ...d, listingDate: '2026-10-28' }, '2026-10-28'), 'listed');
  });
  it('stays undefined when the dates are unknown', () => {
    const none = { openDate: null, closeDate: null, listingDate: null };
    assert.equal(deriveIssueStatus(none, '2026-10-22'), undefined);
  });
});
