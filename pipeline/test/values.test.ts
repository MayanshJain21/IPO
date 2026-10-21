import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  companySlug,
  parseDate,
  parseNumber,
  parsePriceBand,
  parseRupeesToCrore,
} from '../src/lib/values';

describe('companySlug: the key that matches one company across SEBI, NSE and BSE', () => {
  it('gives the same slug for every way the sources write a name', () => {
    const variants = [
      'NATCO PHARMA LTD',
      'Natco Pharma Limited',
      'Natco Pharma Ltd.',
      ' natco  pharma ',
    ];
    for (const v of variants) assert.equal(companySlug(v), 'natco-pharma');
  });
  it('handles &, brackets and "formerly known as"', () => {
    assert.equal(companySlug('Orient Cables (India) Limited'), 'orient-cables-india');
    assert.equal(companySlug('Shah & Sons Pvt Ltd'), 'shah-and-sons');
    assert.equal(companySlug('Acme Limited (formerly known as Acme Pvt Ltd)'), 'acme');
  });
  it('treats unspaced hyphens as word breaks', () => {
    assert.equal(companySlug('A-One Steels India Limited'), 'a-one-steels-india');
  });
});

describe('parseDate', () => {
  it('reads SEBI, NSE and BSE formats', () => {
    assert.equal(parseDate('Oct 21, 2026'), '2026-10-21');
    assert.equal(parseDate('21-Oct-2026'), '2026-10-21');
    assert.equal(parseDate('05-OCT-2026'), '2026-10-05');
    assert.equal(parseDate('2026-10-21T00:00:00'), '2026-10-21');
  });
  it('returns null for placeholders', () => {
    assert.equal(parseDate('-'), null);
    assert.equal(parseDate(''), null);
    assert.equal(parseDate(null), null);
  });
});

describe('numbers and money', () => {
  it('reads Indian digit grouping and exponents', () => {
    assert.equal(parseNumber('1,20,83,316'), 12083316);
    assert.equal(parseNumber('1.2083331E7'), 12083331);
    assert.equal(parseNumber('NA'), null);
  });
  it('converts rupee amounts to crore', () => {
    assert.equal(parseRupeesToCrore('Rs. 5000 million'), 500);
    assert.equal(parseRupeesToCrore('aggregating upto Rs. 9,500 million'), 950);
    assert.equal(parseRupeesToCrore('₹ 1,200 crore'), 1200);
    assert.equal(parseRupeesToCrore('Rs. 250 lakh'), 2.5);
    assert.equal(parseRupeesToCrore('up to 1,23,456 equity shares'), null);
  });
  it('reads price bands, including fixed-price issues', () => {
    assert.deepEqual(parsePriceBand('Rs.660 to Rs.693'), [660, 693]);
    assert.deepEqual(parsePriceBand('Rs. 660/- to Rs. 693/- per Equity Share'), [660, 693]);
    assert.deepEqual(parsePriceBand('1065.00 - 1119.00'), [1065, 1119]);
    assert.deepEqual(parsePriceBand('750.00'), [750, 750]);
    assert.equal(parsePriceBand('-'), null);
  });
});
