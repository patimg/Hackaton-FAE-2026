import { mkdir, open, realpath, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, relative, dirname, sep } from 'node:path';
import { sha256 } from '../../files/validate';
import type { FileStorage, StorageReservation, StorageReservationInput } from './provider';

function inside(root:string, path:string) {
  const rel = relative(root,path);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !rel.startsWith(sep));
}
export class LocalFileStorage implements FileStorage {
  private root:string;
  constructor(root:string) {
    this.root = resolve(root);
    if (inside(resolve('public'),this.root)) throw new Error('El almacenamiento debe estar fuera de public.');
  }
  private async path(key:string, create:boolean) {
    if (!key || key.split('/').some(part => !part || part === '.' || part === '..') || key.includes('\\') || key.includes('\0')) throw new Error('Clave de archivo inválida.');
    const target = resolve(this.root,key);
    if (!inside(this.root,target) || target === this.root) throw new Error('Ruta fuera de almacenamiento.');
    await mkdir(this.root,{ recursive:true,mode:0o700 });
    const actualRoot = await realpath(this.root);
    if (inside(resolve('public'),actualRoot)) throw new Error('Raíz pública no permitida.');
    if (create) {
      // Validar cada padre antes de crear el siguiente: no seguir enlaces del disco.
      let parent = this.root;
      for (const segment of key.split('/').slice(0,-1)) {
        parent = resolve(parent,segment);
        try { await mkdir(parent,{mode:0o700}); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
        const info = await lstat(parent);
        if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('Directorio de almacenamiento inválido.');
      }
    }
    if (!inside(actualRoot,await realpath(dirname(target)))) throw new Error('Enlace fuera de almacenamiento.');
    return target;
  }
  async reserve(input:StorageReservationInput): Promise<StorageReservation> {
    if (!/^[a-f0-9-]{36}$/.test(input.documentId) || !/^[a-zA-Z0-9_.-]+$/.test(input.filename)) throw new Error('Destino inválido.');
    const key = `${input.folderKey}/${input.documentId}__${input.filename}`;
    await this.path(key,true);
    return { provider:'local',key,folderKey:input.folderKey };
  }
  async ensureStored(input:{ reservation:StorageReservation; bytes:Uint8Array; sha256:string }) {
    if (sha256(input.bytes) !== input.sha256) throw new Error('Hash del archivo incorrecto.');
    const target = await this.path(input.reservation.key,true);
    const file = await open(target, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,0o600);
    try { await file.writeFile(input.bytes); await file.sync(); }
    finally { await file.close(); }
    return input.reservation;
  }
  async read(input:{ key:string }) {
    const file = await open(await this.path(input.key,false),constants.O_RDONLY | constants.O_NOFOLLOW);
    let bytes:Buffer;
    try {
      if (!(await file.stat()).isFile()) throw new Error('No es un archivo.');
      bytes = await file.readFile();
    } finally { await file.close(); }
    return new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(bytes)); controller.close(); } });
  }
}
