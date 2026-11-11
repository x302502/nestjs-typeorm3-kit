import { DynamicModule, ForwardReference, ModuleMetadata, Type } from '@nestjs/common';
import { MODULE_PATH } from '@nestjs/common/constants';
import { validateModuleKeys } from '@nestjs/common/utils/validate-module-keys.util';
import { ApiTags } from '@nestjs/swagger';

export interface IChildModuleMetadata extends ModuleMetadata {
  prefix?: string;
}
function fixPath(strInput: string) {
  let path = strInput;
  const regex = new RegExp('//', 'g');
  while (path.includes('//')) {
    path = path.replace(regex, '/');
  }

  const regexConfig = /(^\/+|\/+$)/gm;
  return path.replace(regexConfig, '');
}

const toPascalCase = (str: string) => {
  return str
    .replace(new RegExp(/[-_]+/, 'g'), ' ')
    .replace(new RegExp(/[^\w\s]/, 'g'), '')
    .replace(
      new RegExp(/\s+(.)(\w+)/, 'g'),
      ($1, $2, $3) => `${$2.toUpperCase() + $3.toLowerCase()}`,
    )
    .replace(new RegExp(/\s/, 'g'), '')
    .replace(new RegExp(/\w/), s => s.toUpperCase());
};

type ModuleImport = NonNullable<ModuleMetadata['imports']>[number];
type ModuleExport = NonNullable<ModuleMetadata['exports']>[number];
const SCOPED_IMPORTS = Symbol('child-module:scoped-imports');

// Scoped copies are cached per (original, parent path) so every mount point of the same
// module under the same path resolves to one Nest module instead of duplicating routes.
const scopedModuleCache = new WeakMap<Type<object>, Map<string, Type<object>>>();
const scopedDynamicCache = new WeakMap<object, Map<string, DynamicModule>>();

function pathOf(moduleType: Type<object>): string {
  const path = Reflect.getMetadata(MODULE_PATH, moduleType);
  return typeof path === 'string' ? fixPath(path) : '';
}

function isDynamicModule(item: unknown): item is DynamicModule {
  return !!item && typeof item === 'object' && 'module' in item;
}

function isForwardReference(item: unknown): item is ForwardReference {
  return !!item && typeof item === 'object' && 'forwardRef' in item;
}

function scopeModule(moduleType: Type<object>, parentPath: string): Type<object> {
  if (!parentPath) {
    return moduleType;
  }
  let byPath = scopedModuleCache.get(moduleType);
  const existing = byPath?.get(parentPath);
  if (existing) {
    return existing;
  }
  if (!byPath) {
    byPath = new Map();
    scopedModuleCache.set(moduleType, byPath);
  }

  // A subclass would inherit Nest's static module-identity key from an already-registered
  // original and be merged into it. A delegating class keeps the instance prototype chain
  // (lifecycle hooks, `instanceof`) while sharing no statics with the original.
  class ScopedModule {
    constructor(...args: unknown[]) {
      return Reflect.construct(moduleType, args, new.target);
    }
  }
  Object.setPrototypeOf(ScopedModule.prototype, moduleType.prototype);
  byPath.set(parentPath, ScopedModule as Type<object>);
  Object.defineProperty(ScopedModule, 'name', { value: moduleType.name });
  for (const key of Reflect.getMetadataKeys(moduleType)) {
    Reflect.defineMetadata(key, Reflect.getMetadata(key, moduleType), ScopedModule);
  }

  const path = fixPath(`${parentPath}/${pathOf(moduleType)}`);
  Reflect.defineMetadata(MODULE_PATH, path ? `/${path}` : '', ScopedModule);

  const imports = Reflect.getMetadata('imports', moduleType) as ModuleImport[] | undefined;
  if (imports) {
    const importParentPath = Reflect.getMetadata(SCOPED_IMPORTS, moduleType) ? parentPath : path;
    const scoped = scopeLists(
      imports,
      Reflect.getMetadata('exports', moduleType) as ModuleExport[] | undefined,
      importParentPath,
    );
    Reflect.defineMetadata('imports', scoped.imports, ScopedModule);
    Reflect.defineMetadata(SCOPED_IMPORTS, true, ScopedModule);
    if (scoped.exports) {
      Reflect.defineMetadata('exports', scoped.exports, ScopedModule);
    }
  }
  return ScopedModule;
}

function scopeDynamicModule(item: DynamicModule, parentPath: string): DynamicModule {
  if (!parentPath) {
    return item;
  }
  let byPath = scopedDynamicCache.get(item);
  const existing = byPath?.get(parentPath);
  if (existing) {
    return existing;
  }
  if (!byPath) {
    byPath = new Map();
    scopedDynamicCache.set(item, byPath);
  }

  // Own string keys only: Nest's identity symbol on `item` must not be copied.
  const scoped = Object.fromEntries(Object.entries(item)) as DynamicModule;
  byPath.set(parentPath, scoped);
  scoped.module = scopeModule(item.module, parentPath);
  if (item.imports) {
    const importParentPath = (item as { [SCOPED_IMPORTS]?: boolean })[SCOPED_IMPORTS]
      ? parentPath
      : fixPath(pathOf(scoped.module));
    const lists = scopeLists(item.imports, item.exports, importParentPath);
    scoped.imports = lists.imports;
    if (lists.exports) {
      scoped.exports = lists.exports;
    }
    (scoped as { [SCOPED_IMPORTS]?: boolean })[SCOPED_IMPORTS] = true;
  }
  return scoped;
}

function scopeImport(item: ModuleImport, parentPath: string): ModuleImport {
  if (!parentPath) {
    return item;
  }
  if (typeof item === 'function') {
    return scopeModule(item, parentPath);
  }
  if (item instanceof Promise) {
    return item.then(resolved => scopeImport(resolved, parentPath) as DynamicModule);
  }
  if (isDynamicModule(item)) {
    return scopeDynamicModule(item, parentPath);
  }
  if (isForwardReference(item)) {
    return {
      forwardRef: () => scopeImport(item.forwardRef(), parentPath) as Type<object>,
    };
  }
  return item;
}

/**
 * Scopes `imports` and rewrites `exports` that re-export one of those imported modules so
 * they keep pointing at the scoped copy Nest actually registered as an import.
 */
function scopeLists(
  imports: ModuleImport[],
  exports: ModuleExport[] | undefined,
  parentPath: string,
): { imports: ModuleImport[]; exports?: ModuleExport[] } {
  if (!parentPath) {
    return { imports, exports };
  }
  const scopedByOriginal = new Map<unknown, Type<object>>();
  const remember = (item: ModuleImport, scoped: ModuleImport) => {
    if (typeof item === 'function' && typeof scoped === 'function') {
      scopedByOriginal.set(item, scoped);
    } else if (isDynamicModule(item) && isDynamicModule(scoped)) {
      scopedByOriginal.set(item.module, scoped.module);
    }
  };
  const scopedImports = imports.map(item => {
    if (item instanceof Promise) {
      // Recorded once resolved; exports read it lazily (Nest reflects exports after imports).
      return item.then(resolved => {
        const scoped = scopeImport(resolved, parentPath);
        remember(resolved, scoped);
        return scoped as DynamicModule;
      });
    }
    const scoped = scopeImport(item, parentPath);
    remember(item, scoped);
    return scoped;
  });
  if (!exports) {
    return { imports: scopedImports };
  }
  const hasForwardImports = imports.some(isForwardReference);
  const hasPromiseImports = imports.some(item => item instanceof Promise);
  const scopedExports = exports.map(item => {
    if (isForwardReference(item)) {
      return { forwardRef: () => scopeImport(item.forwardRef(), parentPath) as Type<object> };
    }
    if (typeof item === 'function') {
      const direct = scopedByOriginal.get(item);
      if (direct) return direct;
      if (hasForwardImports || hasPromiseImports) {
        return {
          forwardRef: () => {
            const resolved = scopedByOriginal.get(item);
            if (resolved) return resolved;
            const matches = imports.some(ref => {
              if (!isForwardReference(ref)) return false;
              const resolved = ref.forwardRef();
              return resolved === item || (isDynamicModule(resolved) && resolved.module === item);
            });
            return matches ? scopeModule(item as Type<object>, parentPath) : item;
          },
        };
      }
      return item;
    }
    if (isDynamicModule(item)) {
      return scopedByOriginal.get(item.module) ?? item;
    }
    return item;
  });
  return { imports: scopedImports, exports: scopedExports };
}

export function ChildModule(childMetadata?: IChildModuleMetadata): ClassDecorator {
  const { prefix = '', ...metadata } = childMetadata || {};
  const propsKeys = Object.keys(metadata);
  validateModuleKeys(propsKeys);
  return target => {
    const defPrefix = fixPath(prefix);
    const scoped = metadata.imports
      ? scopeLists(metadata.imports, metadata.exports, defPrefix)
      : undefined;
    for (const property of Object.keys(metadata) as Array<keyof typeof metadata>) {
      const value =
        property === 'imports'
          ? scoped?.imports
          : property === 'exports'
            ? (scoped?.exports ?? metadata.exports)
            : metadata[property];
      Reflect.defineMetadata(property, value, target);
    }
    if (metadata.imports) {
      Reflect.defineMetadata(SCOPED_IMPORTS, true, target);
    }
    Reflect.defineMetadata(MODULE_PATH, defPrefix ? `/${defPrefix}` : defPrefix, target);
    const controllers = metadata.controllers || [];
    for (const ctr of controllers) {
      if (!ctr) {
        continue;
      }
      const groupName = prefix ? `[${toPascalCase(prefix)}] ${ctr.name}` : `[API]${ctr.name}`;
      ApiTags(groupName)(ctr);
    }
  };
}
