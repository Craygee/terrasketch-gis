declare module "seek-bzip" {
  const decoder: {
    decode(input: Uint8Array, output?: { writeByte(value: number): void }): Uint8Array;
  };
  export default decoder;
}
