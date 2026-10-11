import { animalDisplayLabel, animalTagPath, isAnimalTagPath, parseAnimalTagPath } from './tag-path';

describe('animal tag path', () => {
  it('builds and parses Animals/Type/Name', () => {
    const path = animalTagPath('Cat', 'George');
    expect(path).toBe('Animals/Cat/George');
    expect(parseAnimalTagPath(path)).toEqual({ type: 'Cat', name: 'George', path });
    expect(isAnimalTagPath(path)).toBe(true);
  });

  it('allows same name under different types', () => {
    const cat = animalTagPath('Cat', 'George');
    const dog = animalTagPath('Dog', 'George');
    expect(cat).not.toBe(dog);
    expect(parseAnimalTagPath(cat)?.type).toBe('Cat');
    expect(parseAnimalTagPath(dog)?.type).toBe('Dog');
  });

  it('rejects non-animal paths', () => {
    expect(parseAnimalTagPath('Vacation/Beach')).toBeNull();
    expect(parseAnimalTagPath('Animals/Cat')).toBeNull();
    expect(isAnimalTagPath('Animals')).toBe(false);
  });

  it('sanitizes slashes in type/name', () => {
    expect(animalTagPath('Sea/Bird', 'Mr/Paws')).toBe('Animals/Sea-Bird/Mr-Paws');
  });

  it('formats display label', () => {
    expect(animalDisplayLabel({ type: 'Cat', name: 'George', path: 'Animals/Cat/George' })).toBe('George · Cat');
  });
});
