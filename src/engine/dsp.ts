// Promise wrapper around dsp.worker.ts.

type Pending = {
  resolve: (v: any) => void;
  reject: (e: Error) => void;
  onProgress?: (p: number) => void;
};

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./dsp.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const { id, progress, result, error } = e.data;
    const job = pending.get(id);
    if (!job) return;
    if (progress !== undefined) job.onProgress?.(progress);
    else if (error !== undefined) {
      pending.delete(id);
      job.reject(new Error(error));
    } else {
      pending.delete(id);
      job.resolve(result);
    }
  };
  return worker;
}

function call<T>(msg: object, transfer: Transferable[], onProgress?: (p: number) => void) {
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    getWorker().postMessage({ ...msg, id }, transfer);
  });
}

/** step = input samples consumed per output sample (speed ratio). Inputs are transferred. */
export function resample(
  channels: Float32Array<ArrayBuffer>[],
  step: number,
  outLength: number,
  onProgress?: (p: number) => void,
) {
  return call<Float32Array<ArrayBuffer>[]>(
    { kind: 'resample', channels, step, outLength },
    channels.map((c) => c.buffer),
    onProgress,
  );
}

export function encodeMp3(
  channels: Float32Array<ArrayBuffer>[],
  sampleRate: number,
  kbps: number,
  onProgress?: (p: number) => void,
) {
  return call<Uint8Array>(
    { kind: 'mp3', channels, sampleRate, kbps },
    channels.map((c) => c.buffer),
    onProgress,
  );
}
