import { AsyncLocalStorage } from 'async_hooks';

import { StorageKey, StorageValue, StorageDriver, Storage } from '../interface';

export class AsyncLocalStorageDriver implements StorageDriver {
  private readonly context = new AsyncLocalStorage<Storage>();

  get active() {
    return this.context.getStore() !== undefined;
  }

  public get<T>(key: StorageKey): T {
    return this.context.getStore()?.get(key) as T;
  }

  public set(key: StorageKey, value: StorageValue): void {
    this.context.getStore()?.set(key, value);
  }

  public run<T>(cb: () => Promise<T>): Promise<T> {
    return this.context.run(new Map(this.context.getStore()), cb);
  }
}
