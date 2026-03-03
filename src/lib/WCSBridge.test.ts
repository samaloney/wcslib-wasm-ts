import { describe, it, expect, beforeAll } from 'vitest';
import { WCSBridge } from './WCSBridge';

describe('WCSLib Wasm Integration', () => {
  let wcs: WCSBridge;

  // A standard 80-character per line FITS header
  // Note: Each line MUST be exactly 80 characters.
  const fitsHeader =
    "SIMPLE  =                    T /                                                " +
    "BITPIX  =                  -32 /                                                " +
    "NAXIS   =                    2 /                                                " +
    "NAXIS1  =                 1024 /                                                " +
    "NAXIS2  =                 1024 /                                                " +
    "CTYPE1  = 'HPLN-TAN'           /                                                " +
    "CTYPE2  = 'HPLT-TAN'           /                                                " +
    "CRVAL1  =                 0.0  /                                                " +
    "CRVAL2  =                 0.0  /                                                " +
    "CRPIX1  =                512.0 /                                                " +
    "CRPIX2  =                512.0 /                                                " +
    "CDELT1  =                  1.0 /                                                " +
    "CDELT2  =                  1.0 /                                                " +
    "END                                                                             ";

  beforeAll(async () => {
    wcs = new WCSBridge();
    await wcs.init();
  });

  it('should parse a FITS header and return a valid pointer', () => {
    const { nwcs, wcsPtr } = wcs.parseHeader(fitsHeader);
    expect(nwcs).toBe(1);
    expect(wcsPtr).toBeGreaterThan(0);
  });

  it('should convert center pixel to the CRVAL coordinates', () => {
    const { wcsPtr } = wcs.parseHeader(fitsHeader);

    // The center pixel (512, 512) should map to CRVAL (150.0, 2.0)
    const result = wcs.pixelToSky(wcsPtr, 512.0, 512.0);

    // We use toBeCloseTo because of floating point precision
    expect(result.ra).toBeCloseTo(0.0, 5);
    expect(result.dec).toBeCloseTo(0.0, 5);
  });

  it('should perform round-trip transformation (Sky -> Pixel -> Sky)', () => {
    const { wcsPtr } = wcs.parseHeader(fitsHeader);

    const initialRa = 0.00;
    const initialDec = 0.00;

    const pixel = wcs.skyToPixel(wcsPtr, initialRa, initialDec);
    const final = wcs.pixelToSky(wcsPtr, pixel.x, pixel.y);

    expect(final.ra).toBeCloseTo(initialRa, 8);
    expect(final.dec).toBeCloseTo(initialDec, 8);
  });
});