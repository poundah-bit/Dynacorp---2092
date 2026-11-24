// Facility inputs and outputs: „in:“ green, „out:“ cyan, inputs first.
import { describe, expect, it } from 'vitest';
import { facilityDef } from '../src/sim/index';
import { ioLine } from '../src/ui/format';

describe('Wareneingang und -ausgang', () => {
  it('Raffinerie: in grün vor out cyan, mit Mengen pro Tag', () => {
    const html = ioLine(facilityDef('refinery'));
    expect(html).toMatch(/<span class="io-in"><b>in:<\/b> [^<]*Erdöl<\/span>.*<span class="io-out"><b>out:<\/b> [^<]*Brennstoff/);
    expect(html).toContain('pro Tag');
  });

  it('Rohstoffanlage hat nur out, Ausbaustufen vervielfachen', () => {
    const one = ioLine(facilityDef('oilwell'));
    expect(one).not.toContain('io-in');
    expect(one).toContain('350 l Erdöl');
    expect(ioLine(facilityDef('oilwell'), 2)).toContain('700 l Erdöl');
  });
});
