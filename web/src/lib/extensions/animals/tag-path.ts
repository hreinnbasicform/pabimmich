/** Hierarchical tag convention for animals (no ML, reuses Immich tags). */
export const ANIMALS_ROOT = 'Animals';

export type AnimalIdentity = {
  type: string;
  name: string;
  /** Full tag path, e.g. Animals/Cat/George */
  path: string;
};

const segment = (value: string) => value.trim().replaceAll('/', '-');

/** Build `Animals/{Type}/{Name}`. */
export function animalTagPath(type: string, name: string): string {
  return `${ANIMALS_ROOT}/${segment(type)}/${segment(name)}`;
}

/** Parse an animal leaf tag path; returns null if not under Animals/Type/Name. */
export function parseAnimalTagPath(path: string): AnimalIdentity | null {
  const parts = path.split('/').filter(Boolean);
  if (parts.length !== 3 || parts[0] !== ANIMALS_ROOT) {
    return null;
  }
  const [, type, name] = parts;
  if (!type || !name) {
    return null;
  }
  return { type, name, path };
}

export function isAnimalTagPath(path: string): boolean {
  return parseAnimalTagPath(path) !== null;
}

export function animalDisplayLabel(identity: AnimalIdentity): string {
  return `${identity.name} · ${identity.type}`;
}
