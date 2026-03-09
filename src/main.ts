import { WcsBridge } from './lib/WcsBridge.ts';

const wcs = new WcsBridge();

wcs.init().then(() => {
  console.log("🌌 WCSLib Wasm Loaded!");
  // Expose to window for the browser console
  (window as any).wcs = wcs;

  // Create a dummy FITS header for testing
  const dummyHeader = "SIMPLE  =                    T /                                                " +
                      "BITPIX  =                  -32 /                                                " +
                      "NAXIS   =                    2 /                                                " +
                      "END                                                                             ";
  (window as any).header = dummyHeader;
});