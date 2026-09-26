import { google, type drive_v3 } from 'googleapis';
import { Readable } from 'node:stream';
import { sha256 } from '../../files/validate';
import type { FileStorage, StorageReservation, StorageReservationInput } from './provider';

type Config = { clientId:string; clientSecret:string; refreshToken:string; rootFolderId:string };

export class GoogleDriveStorage implements FileStorage {
  private readonly drive:drive_v3.Drive;
  private readonly rootFolderId:string;
  constructor(config:Config) {
    const auth = new google.auth.OAuth2(config.clientId, config.clientSecret);
    auth.setCredentials({ refresh_token:config.refreshToken });
    this.drive = google.drive({ version:'v3', auth });
    this.rootFolderId = config.rootFolderId;
  }
  async assertReady() {
    let root:drive_v3.Schema$File;
    try {
      const response = await this.drive.files.get({
        fileId:this.rootFolderId,
        fields:'id,mimeType,trashed,capabilities(canAddChildren)',
        supportsAllDrives:true,
      });
      root = response.data;
    } catch (error) {
      const status = typeof error === 'object' && error !== null && 'response' in error
        ? (error as {response?:{status?:number}}).response?.status
        : undefined;
      if (status === 404) {
        throw new Error('La carpeta raíz de Google Drive no existe o no es accesible para la cuenta OAuth. Verifica el ID y comparte la carpeta con esa cuenta.');
      }
      throw error;
    }
    if (root.trashed) throw new Error('La carpeta raíz de Google Drive está en la papelera.');
    if (root.mimeType !== 'application/vnd.google-apps.folder') throw new Error('GOOGLE_DRIVE_ROOT_FOLDER_ID no identifica una carpeta.');
    if (root.capabilities?.canAddChildren === false) throw new Error('La cuenta OAuth no tiene permiso para añadir archivos a la carpeta raíz de Google Drive.');
  }
  private async folder(parentId:string,name:string) {
    const escaped = name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    const found = await this.drive.files.list({q:`'${parentId}' in parents and name = '${escaped}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,spaces:'drive',fields:'files(id,name)',pageSize:1});
    if (found.data.files?.[0]?.id) return found.data.files[0].id;
    const created = await this.drive.files.create({requestBody:{name,mimeType:'application/vnd.google-apps.folder',parents:[parentId]},fields:'id'});
    if (!created.data.id) throw new Error('Google Drive no devolvió el ID de la carpeta.');
    return created.data.id;
  }
  private async folders(key:string) {
    if (!key || key.includes('\\') || key.split('/').some(part => !part || part === '.' || part === '..' || part.includes('\0'))) throw new Error('Carpeta inválida.');
    let parent = this.rootFolderId;
    for (const part of key.split('/')) parent = await this.folder(parent,part);
    return parent;
  }
  async reserve(input:StorageReservationInput):Promise<StorageReservation> {
    if (!/^[a-f0-9-]{36}$/.test(input.documentId) || !/^[a-zA-Z0-9_.-]+$/.test(input.filename)) throw new Error('Destino inválido.');
    await this.folders(input.folderKey);
    return {provider:'google-drive',key:`${input.folderKey}/${input.documentId}__${input.filename}`,folderKey:input.folderKey};
  }
  async ensureStored(input:{reservation:StorageReservation;bytes:Uint8Array;sha256:string;mimeType:string}) {
    if (sha256(input.bytes) !== input.sha256) throw new Error('Hash del archivo incorrecto.');
    const parent = await this.folders(input.reservation.folderKey);
    const name = input.reservation.key.slice(input.reservation.key.lastIndexOf('/') + 1);
    const created = await this.drive.files.create({requestBody:{name,parents:[parent]},media:{mimeType:input.mimeType,body:Readable.from(Buffer.from(input.bytes))},fields:'id'});
    if (!created.data.id) throw new Error('Google Drive no devolvió el ID del archivo.');
    return {...input.reservation,key:created.data.id,fileId:created.data.id};
  }
  async read(input:{key:string}) {
    const response = await this.drive.files.get({fileId:input.key,alt:'media'},{responseType:'stream'});
    const stream = response.data as NodeJS.ReadableStream;
    return new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of stream as AsyncIterable<Buffer>) controller.enqueue(new Uint8Array(chunk));
          controller.close();
        } catch (error) { controller.error(error); }
      },
      cancel() { (stream as NodeJS.ReadableStream & { destroy():void }).destroy(); },
    });
  }
  async remove(input:{key:string}) {
    await this.drive.files.delete({fileId:input.key});
  }
}
