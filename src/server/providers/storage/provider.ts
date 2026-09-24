export type StorageReservation = { provider:'local'; key:string; folderKey:string };
export type StorageReservationInput = { documentId:string; folderKey:string; filename:string };
export interface FileStorage {
  reserve(input:StorageReservationInput): Promise<StorageReservation>;
  ensureStored(input:{ reservation:StorageReservation; bytes:Uint8Array; sha256:string }): Promise<StorageReservation>;
  read(input:{ key:string }): Promise<ReadableStream<Uint8Array>>;
}
