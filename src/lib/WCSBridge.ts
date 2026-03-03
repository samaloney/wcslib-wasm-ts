// @ts-ignore
import WcsModuleFactory from './generated/wcslib-8.5.js';
import wasmUrl from './generated/wcslib-8.5.wasm?url';
import {readFileSync} from 'node:fs'; // Node-only for testing

export class WCSBridge {
    private module: any;

    async init() {
        const isNode = typeof window === 'undefined';

        const config: any = {};

        if (isNode) {
            // In Vitest/Node, we manually provide the binary
            // You may need to adjust this path based on your test runner location
            const wasmBuffer = readFileSync('./src/lib/generated/wcslib-8.5.wasm');
            config.wasmBinary = wasmBuffer;
        } else {
            // In Browser, use the URL
            config.locateFile = (path: string) => path.endsWith('.wasm') ? wasmUrl : path;
        }
        // Ensure we await the fully initialized instance
        const instance = await WcsModuleFactory(config);

        // Debug: Log the instance keys to see what Emscripten gave us
        console.log("Module Keys:", Object.keys(instance).filter(k => k.startsWith('HEAP')));

        this.module = instance;
    }

    /**
     * Internal helper to write a string to Wasm memory
     */
    private writeStringToHeap(str: string): number {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(str);
        const ptr = this.module._malloc(bytes.length + 1); // +1 for null terminator

        // Write the bytes to the heap
        this.module.HEAPU8.set(bytes, ptr);
        // Add the null terminator (C-style string)
        this.module.HEAPU8[ptr + bytes.length] = 0;

        return ptr;
    }

    /**
     * _wcspih: Parse a FITS header string into WCS structures
     * @param header The raw FITS header (one long string or 80-char chunks)
     */
    parseHeader(header: string) {
        const headerPtr = this.writeStringToHeap(header);

        const nwcsPtr = this.module._malloc(4);
        const wcsPtrPtr = this.module._malloc(4);

        // Note: nkeyrec for FITS is usually header.length / 80
        const nkeyrec = Math.floor(header.length / 80);

        const status = this.module.ccall(
            'wcspih',
            'number',
            ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
            [headerPtr, nkeyrec, 2, 0, 0, nwcsPtr, wcsPtrPtr]
        );

        if (status !== 0) {
            this.module._free(headerPtr);
            throw new Error(`wcspih failed with status: ${status}`);
        }

        const nwcs = this.module.getValue(nwcsPtr, 'i32');
        const wcsPtr = this.module.getValue(wcsPtrPtr, 'i32');

        const setStatus = this.module._wcsset(wcsPtr);
        if (setStatus !== 0) throw new Error(`wcsset failed: ${setStatus}`);

        // Clean up
        this.module._free(headerPtr);
        this.module._free(nwcsPtr);
        this.module._free(wcsPtrPtr);

        return {nwcs, wcsPtr};
    }

    // /**
    //  * _wcsp2s: Pixel to Sky coordinates
    //  */
    // pixelToSky(wcsPtr: number, pixelCoords: number[]): number[] {
    //     const n = pixelCoords.length;
    //     const pixPtr = this.module._malloc(n * 8);
    //     const skyPtr = this.module._malloc(n * 8); // sky, phi, theta, etc.
    //     const imgPtr = this.module._malloc(n * 8);
    //     const statPtr = this.module._malloc(n * 4);
    //
    //     // Load pixels into Wasm memory
    //     this.module.HEAPF64.set(new Float64Array(pixelCoords), pixPtr / 8);
    //
    //     // int wcsp2s(struct wcsprm *wcs, int ncoord, int nelem, double pixcrd[],
    //     //           double imgcrd[], double phi[], double theta[], double world[], int stat[])
    //     const status = this.module._wcsp2s(wcsPtr, 1, n, pixPtr, imgPtr, skyPtr, skyPtr + 8, skyPtr + 16, statPtr);
    //
    //     const worldCoords = Array.from(this.module.HEAPF64.subarray(skyPtr / 8, skyPtr / 8 + n));
    //
    //     [pixPtr, skyPtr, imgPtr, statPtr].forEach(p => this.module._free(p));
    //     return worldCoords;
    // }
    //
    // /**
    //  * _wcss2p: Sky to Pixel coordinates
    //  */
    // skyToPixel(wcsPtr: number, skyCoords: number[]): number[] {
    //     const n = skyCoords.length;
    //     const skyPtr = this.module._malloc(n * 8);
    //     const pixPtr = this.module._malloc(n * 8);
    //     const imgPtr = this.module._malloc(n * 8);
    //     const statPtr = this.module._malloc(n * 4);
    //
    //     this.module.HEAPF64.set(new Float64Array(skyCoords), skyPtr / 8);
    //
    //     // int wcss2p(struct wcsprm *wcs, int ncoord, int nelem, double world[],
    //     //           double phi[], double theta[], double imgcrd[], double pixcrd[], int stat[])
    //     this.module._wcss2p(wcsPtr, 1, n, skyPtr, skyPtr + 8, skyPtr + 16, imgPtr, pixPtr, statPtr);
    //
    //     const pixelCoords = Array.from(this.module.HEAPF64.subarray(pixPtr / 8, pixPtr / 8 + n));
    //
    //     [skyPtr, pixPtr, imgPtr, statPtr].forEach(p => this.module._free(p));
    //     return pixelCoords;
    // }

    /**
     * Pixel to Sky (RA/Dec)
     * @param wcsPtr The pointer to the wcsprm struct (from parseHeader)
     * @param x Pixel X
     * @param y Pixel Y
     */
    pixelToSky(wcsPtr: number, x: number, y: number): { ra: number; dec: number; status: number } {
        const ncoord = 1; // Number of points to transform
        const nelem = 2;  // Dimensions (RA, Dec)

        // Allocate 16 bytes (2 doubles) for input and output
        const pixPtr = this.module._malloc(16);
        const worldPtr = this.module._malloc(16);
        const statPtr = this.module._malloc(4); // int status

        // Set input: x, y
        this.module.HEAPF64.set([x, y], pixPtr / 8);

        // int wcsp2s(struct wcsprm *wcs, int ncoord, int nelem, double pixcrd[],
        //           double imgcrd[], double phi[], double theta[], double world[], int stat[])
        // Allocate memory for output arrays
        const imgPtr = this.module._malloc(16);
        const phiPtr = this.module._malloc(16);
        const thetaPtr = this.module._malloc(16);

        const status = this.module._wcsp2s(wcsPtr, ncoord, nelem, pixPtr, imgPtr, phiPtr, thetaPtr, worldPtr, statPtr);

        // Clean up additional allocations
        this.module._free(imgPtr);
        this.module._free(phiPtr);
        this.module._free(thetaPtr);

        const ra = this.module.HEAPF64[worldPtr / 8];
        const dec = this.module.HEAPF64[worldPtr / 8 + 1];

        // Clean up
        this.module._free(pixPtr);
        this.module._free(worldPtr);
        this.module._free(statPtr);

        return {ra, dec, status};
    }

    /**
     * Sky to Pixel (RA/Dec -> X/Y)
     */
    skyToPixel(wcsPtr: number, ra: number, dec: number): { x: number; y: number; status: number } {
        const worldPtr = this.module._malloc(16);
        const pixPtr = this.module._malloc(16);
        const statPtr = this.module._malloc(4);

        this.module.HEAPF64.set([ra, dec], worldPtr / 8);

        // int wcss2p(struct wcsprm *wcs, int ncoord, int nelem, double world[],
        //           double phi[], double theta[], double imgcrd[], double pixcrd[], int stat[])
        const phiPtr = this.module._malloc(16); // 2 doubles
        const thetaPtr = this.module._malloc(16); // 2 doubles
        const imgPtr = this.module._malloc(16); // 2 doubles
        const status = this.module._wcss2p(wcsPtr, 1, 2, worldPtr, phiPtr, thetaPtr, imgPtr, pixPtr, statPtr);

        // Clean up additional allocations
        this.module._free(phiPtr);
        this.module._free(thetaPtr);
        this.module._free(imgPtr);

        const x = this.module.HEAPF64[pixPtr / 8];
        const y = this.module.HEAPF64[pixPtr / 8 + 1];

        this.module._free(worldPtr);
        this.module._free(pixPtr);
        this.module._free(statPtr);

        return {x, y, status};
    }
}
