// Types for the parts of gifenc (MIT) that scripts/record-hero.ts uses; the
// package ships none.
declare module "gifenc" {
  type Palette = number[][];

  interface FrameOptions {
    palette?: Palette;
    delay?: number;
    dispose?: number;
    transparent?: boolean;
    transparentIndex?: number;
  }

  interface Encoder {
    writeFrame(index: Uint8Array, width: number, height: number, options?: FrameOptions): void;
    finish(): void;
    bytes(): Uint8Array;
  }

  const gifenc: {
    GIFEncoder: () => Encoder;
    quantize: (rgba: Uint8Array, maxColors: number) => Palette;
    applyPalette: (rgba: Uint8Array, palette: Palette) => Uint8Array;
  };
  export default gifenc;
}
