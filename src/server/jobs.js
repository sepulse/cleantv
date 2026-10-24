import { randomUUID } from 'node:crypto';
import { CleanTvError, ErrorCode } from '../core/errors.js';
import { publicError } from './http-errors.js';

/** @returns {{ start: (serial: string, work: (onProgress: (value: object) => void) => Promise<object>) => string,
 *   stream: (id: string, request: import('node:http').IncomingMessage,
 *     response: import('node:http').ServerResponse) => boolean }} */
export function createJobs() {
  const jobs = new Map();
  const busy = new Set();

  function emit(job, event, data) {
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    job.events.push(frame);
    for (const response of job.listeners) response.write(frame);
    if (event === 'complete' || event === 'error') {
      busy.delete(job.serial);
      job.done = true;
      for (const response of job.listeners) response.end();
      job.listeners.clear();
      const expiry = setTimeout(() => jobs.delete(job.id), 10 * 60 * 1000);
      expiry.unref();
    }
  }

  return {
    start(serial, work) {
      if (busy.has(serial)) throw new CleanTvError(ErrorCode.DEVICE_BUSY);
      const job = { id: randomUUID(), serial, events: [], listeners: new Set(), done: false };
      busy.add(serial);
      jobs.set(job.id, job);
      queueMicrotask(async () => {
        try {
          const result = await work(progress => emit(job, 'progress', progress));
          emit(job, 'complete', { succeeded: result.succeeded, failed: result.failed, results: result.results });
        } catch (error) {
          const { code, message } = publicError(error);
          emit(job, 'error', { code, message });
        }
      });
      return job.id;
    },
    stream(id, request, response) {
      const job = jobs.get(id);
      if (!job) return false;
      response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', Connection: 'keep-alive' });
      response.write('retry: 2000\n\n');
      for (const frame of job.events) response.write(frame);
      if (job.done) response.end();
      else {
        job.listeners.add(response);
        const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 15000);
        heartbeat.unref();
        response.on('close', () => { clearInterval(heartbeat); job.listeners.delete(response); });
      }
      return true;
    },
  };
}
