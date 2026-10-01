import { describe, expect, test, vi } from 'vitest';

import { IndexedDBDocStorage } from './doc';

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function transaction() {
  const completion = deferred();
  const commitCalled = deferred();
  const observed = vi.spyOn(completion.promise, 'catch');
  const add = vi.fn(async (_record: { createdAt: Date }) => {});
  const put = vi.fn(async (_record: { docId: string; timestamp: Date }) => {});
  const trx = {
    done: completion.promise,
    objectStore: vi.fn(() => ({ add, put })),
    commit: vi.fn(() => commitCalled.resolve()),
  };
  return { trx, completion, commitCalled, observed, add, put };
}

function fixture(transactions: ReturnType<typeof transaction>[]) {
  const storage = Object.create(IndexedDBDocStorage.prototype) as IndexedDBDocStorage;
  const emit = vi.fn();
  const postMessage = vi.fn();
  let next = 0;
  const start = vi.fn(() => {
    const current = transactions[next++];
    if (!current) throw new Error('Unexpected transaction');
    return current.trx;
  });
  Object.defineProperties(storage, {
    db: { value: { transaction: start } },
    channel: { value: { postMessage } },
    emit: { value: emit },
  });
  return { storage, emit, postMessage, start };
}

const update = { docId: 'isolated-fixture', bin: new Uint8Array([0, 0]) };

describe('IndexedDB document commit barrier', () => {
  test('does not return or broadcast until transaction completion', async () => {
    const tx = transaction(); const f = fixture([tx]);
    let settled = false;
    const pending = f.storage.pushDocUpdate(update, 'fixture-origin').then(result => {
      settled = true; return result;
    });
    await tx.commitCalled.promise;
    expect(tx.add).toHaveBeenCalledTimes(1);
    expect(tx.put).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);
    expect(f.emit).not.toHaveBeenCalled();
    expect(f.postMessage).not.toHaveBeenCalled();
    tx.completion.resolve();
    const result = await pending;
    expect(result.docId).toBe(update.docId);
    expect(f.emit).toHaveBeenCalledWith('update', expect.objectContaining(update), 'fixture-origin');
    expect(f.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'update', origin: 'fixture-origin' }));
  });

  test('transaction abort after request success rejects without broadcast', async () => {
    const tx = transaction(); const f = fixture([tx]);
    const error = new Error('transaction aborted');
    const pending = f.storage.pushDocUpdate(update);
    const rejected = expect(pending).rejects.toBe(error);
    await tx.commitCalled.promise;
    tx.completion.reject(error);
    await rejected;
    expect(f.emit).not.toHaveBeenCalled();
    expect(f.postMessage).not.toHaveBeenCalled();
    expect(f.start).toHaveBeenCalledTimes(1);
  });

  test('request failure consumes transaction rejection and preserves request error', async () => {
    const tx = transaction(); const f = fixture([tx]);
    const requestError = new Error('request failed');
    tx.add.mockImplementation(async () => {
      expect(tx.observed).toHaveBeenCalledTimes(1);
      tx.completion.reject(new Error('transaction also aborted'));
      throw requestError;
    });
    await expect(f.storage.pushDocUpdate(update)).rejects.toBe(requestError);
    expect(tx.trx.commit).not.toHaveBeenCalled();
    expect(f.emit).not.toHaveBeenCalled();
    expect(f.postMessage).not.toHaveBeenCalled();
  });

  test('constraint collision retries with later timestamp and awaits retry commit', async () => {
    const first = transaction(); const second = transaction();
    const f = fixture([first, second]);
    const collision = Object.assign(new Error('duplicate timestamp'), { name: 'ConstraintError' });
    first.add.mockImplementation(async () => {
      first.completion.reject(new Error('aborted collision'));
      throw collision;
    });
    const pending = f.storage.pushDocUpdate(update);
    await second.commitCalled.promise;
    expect(first.observed).toHaveBeenCalledTimes(1);
    expect(first.trx.commit).not.toHaveBeenCalled();
    const firstRecord = first.add.mock.calls[0][0];
    const secondRecord = second.add.mock.calls[0][0];
    expect(secondRecord.createdAt.getTime()).toBe(firstRecord.createdAt.getTime() + 1);
    expect(f.emit).not.toHaveBeenCalled();
    expect(f.postMessage).not.toHaveBeenCalled();
    second.completion.resolve(); await pending;
    expect(f.start).toHaveBeenCalledTimes(2);
    expect(f.emit).toHaveBeenCalledTimes(1);
    expect(f.postMessage).toHaveBeenCalledTimes(1);
  });

  test('constraint collision retains ten-attempt cap and consumes every abort', async () => {
    const transactions = Array.from({ length: 10 }, transaction);
    const f = fixture(transactions);
    const collision = Object.assign(new Error('duplicate timestamp'), { name: 'ConstraintError' });
    for (const tx of transactions) {
      tx.add.mockImplementation(async () => {
        tx.completion.reject(new Error('aborted collision'));
        throw collision;
      });
    }
    await expect(f.storage.pushDocUpdate(update)).rejects.toBe(collision);
    expect(f.start).toHaveBeenCalledTimes(10);
    for (const tx of transactions) expect(tx.observed).toHaveBeenCalledTimes(1);
    expect(f.emit).not.toHaveBeenCalled();
    expect(f.postMessage).not.toHaveBeenCalled();
  });
});
