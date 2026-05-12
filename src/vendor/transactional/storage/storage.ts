import { AsyncLocalStorageDriver } from './driver/async-local-storage';
import type { StorageDriver } from './driver/interface';

export class Storage {
  private driver: StorageDriver | undefined;

  public create() {
    if (this.driver) {
      // We probably should not allow calling this function when driver is already defined
      return this.driver;
    }

    this.driver = new AsyncLocalStorageDriver();

    return this.driver;
  }

  public get() {
    if (!this.driver) {
      throw new Error(
        'No storage driver defined in your app ... please call initializeTransactionalContext() before application start.',
      );
    }

    return this.driver;
  }
}
