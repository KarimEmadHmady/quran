import { parseOrigins } from './origins';

describe('parseOrigins', () => {
  it('parses one origin', () => {
    expect(parseOrigins('http://localhost:3000')).toEqual(['http://localhost:3000']);
  });

  it('parses a comma list, trims spaces and drops duplicates/empties', () => {
    expect(parseOrigins(' https://a.example , https://b.example,,https://a.example ')).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
  });

  it.each([
    [''],
    [' , '],
    ['localhost:3000'],
    ['http://localhost:3000/'],
    ['https://a.example/path'],
    ['https://a.example?x=1'],
    ['https://user:pw@a.example'],
    ['ftp://a.example'],
    ['*'],
    ['https://ok.example,not a url'],
  ])('rejects %p', (raw) => {
    expect(parseOrigins(raw)).toBeUndefined();
  });
});
