export interface Decoder {
  name: 'kdec';
  decompress(src: Uint8Array, rawSize: number): Promise<Uint8Array>;
}
