export type StorageReservation = { provider:'local'|'google-drive'; key:string; folderKey:string; fileId?:string };
export type StorageReservationInput = { documentId:string; folderKey:string; filename:string };
export interface FileStorage {
  assertReady(): Promise<void>;
  reserve(input:StorageReservationInput): Promise<StorageReservation>;
  ensureStored(input:{ reservation:StorageReservation; bytes:Uint8Array; sha256:string; mimeType:string }): Promise<StorageReservation>;
  read(input:{ key:string }): Promise<ReadableStream<Uint8Array>>;
  remove(input:{ key:string }): Promise<void>;
}
