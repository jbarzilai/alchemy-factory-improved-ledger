import { describe, expect, it } from 'vitest';
import { ByteReader } from '../src/reader';
import { PropertyError, Unparsed, readProps } from '../src/uprop';
import { bool, coins, num, optNum, str } from '../src/access';
import { bag, concat, f64, fstr, i32, tag, typeName, u8 } from './helpers/encode';

const INT = typeName('IntProperty');
const STR = typeName('StrProperty');
const NAME = typeName('NameProperty');
const DOUBLE = typeName('DoubleProperty');
const BOOL = typeName('BoolProperty');
const structType = (name: string, pkg = '/Script/CoreUObject') => typeName('StructProperty', typeName(name, typeName(pkg)));
const arrayOf = (inner: Uint8Array) => typeName('ArrayProperty', inner);

const parse = (bytes: Uint8Array) => {
  const r = new ByteReader(bytes);
  const out = readProps(r);
  expect(r.pos).toBe(bytes.length); // consumed exactly the list including None
  return out;
};

describe('readProps', () => {
  it('stores __proto__ as an own property in a null-prototype bag', () => {
    const out = parse(bag(tag('__proto__', INT, i32(7))));
    expect(Object.getPrototypeOf(out)).toBeNull();
    expect(Object.hasOwn(out, '__proto__')).toBe(true);
    expect(out.__proto__).toBe(7);
  });

  it('accessors ignore inherited keys', () => {
    expect(num({}, 'toString', 'bag')).toBe(0);
    const inherited = Object.create({ N: 5, B: true, S: 'inherited', C: [1, 2, 3] });
    expect(num(inherited, 'N', 'bag')).toBe(0);
    expect(optNum(inherited, 'N', 'bag')).toBeUndefined();
    expect(bool(inherited, 'B', 'bag')).toBe(false);
    expect(str(inherited, 'S', 'bag', 'default')).toBe('default');
    expect(coins(inherited, 'C', 'bag')).toEqual({ gold: 0, silver: 0, copper: 0 });
  });

  it('reads scalar properties until None', () => {
    expect(parse(bag(tag('Day', INT, i32(199)), tag('Name', STR, fstr('1 Point Oh')), tag('Coef', DOUBLE, f64(1.2)))))
      .toEqual({ Day: 199, Name: '1 Point Oh', Coef: 1.2 });
  });

  it('takes bool values from the 0x10 flag, with no value bytes', () => {
    expect(parse(bag(tag('On', BOOL, new Uint8Array(), 0x10), tag('Off', BOOL, new Uint8Array(), 0))))
      .toEqual({ On: true, Off: false });
  });

  it('reads native structs raw', () => {
    const ticks = Buffer.alloc(8);
    ticks.writeBigInt64LE(0x08df3295c3701c00n);
    const out = parse(bag(
      tag('SellProfit', structType('IntVector'), concat(i32(0), i32(2688), i32(0))),
      tag('SaveTime', structType('DateTime'), ticks, 0x08),
    ));
    expect(out).toEqual({ SellProfit: [0, 2688, 0], SaveTime: 0x08df3295c3701c00n });
  });

  it('reads non-native structs as nested property lists', () => {
    const inner = bag(tag('MajorVersion', INT, i32(1)), tag('BuildNumber', INT, i32(5024)));
    expect(parse(bag(tag('Version', structType('SaveGameVersion', '/Script/BeltTD'), inner))))
      .toEqual({ Version: { MajorVersion: 1, BuildNumber: 5024 } });
  });

  it('skips unknown native structs and continues with the next tag', () => {
    const out = parse(bag(
      tag('Tags', structType('GameplayTagContainer'), Uint8Array.of(1, 2, 3, 4, 5, 6, 7), 0x08),
      tag('After', INT, i32(9)),
    ));
    expect(out.Tags).toBeInstanceOf(Unparsed);
    expect(out.Tags).toMatchObject({ type: 'StructProperty<GameplayTagContainer>', size: 7 });
    expect(out.After).toBe(9);
  });

  it('reads arrays of structs (elements are untagged property lists)', () => {
    const rec = (item: string, sold: number) => bag(tag('IngredientName', NAME, fstr(item)), tag('SellCount', INT, i32(sold)));
    const value = concat(i32(2), rec('Salt', 106), rec('Soap', 156));
    const type = arrayOf(structType('IngredientRecordData', '/Script/BeltTD'));
    expect(parse(bag(tag('Records', type, value)))).toEqual({
      Records: [{ IngredientName: 'Salt', SellCount: 106 }, { IngredientName: 'Soap', SellCount: 156 }],
    });
  });

  it('reads arrays of scalars and maps', () => {
    const map = typeName('MapProperty', NAME, INT);
    const out = parse(bag(
      tag('Days', arrayOf(INT), concat(i32(3), i32(1), i32(2), i32(3))),
      tag('Stock', map, concat(i32(0), i32(2), fstr('Salt'), i32(5), fstr('Soap'), i32(7))),
    ));
    expect(out).toEqual({ Days: [1, 2, 3], Stock: [['Salt', 5], ['Soap', 7]] });
  });

  it.each([
    ['ArrayProperty', arrayOf(INT), concat(i32(0x7fffffff), i32(1))],
    ['SetProperty', typeName('SetProperty', INT), concat(i32(0), i32(0x7fffffff), i32(1))],
    ['MapProperty', typeName('MapProperty', INT, INT), concat(i32(0), i32(3), i32(1))],
  ])('rejects %s counts that cannot fit in the declared value', (_name, type, value) => {
    const run = () => parse(bag(tag('Records', type, value)));
    expect(run).toThrow(PropertyError);
    expect(run).toThrow(/Records: .*count (2147483647|3)/);
  });

  it('reads ByteProperty as u8 and EnumProperty as a name', () => {
    const out = parse(bag(
      tag('B', typeName('ByteProperty', typeName('None')), u8(7)),
      tag('E', typeName('EnumProperty', typeName('EQuestKind')), fstr('EQuestKind::Bulk')),
    ));
    expect(out).toEqual({ B: 7, E: 'EQuestKind::Bulk' });
  });

  it('skips unknown property types by size', () => {
    const out = parse(bag(tag('Title', typeName('TextProperty'), Uint8Array.of(1, 2, 3, 4, 5)), tag('After', INT, i32(9))));
    expect(out.Title).toBeInstanceOf(Unparsed);
    expect(out.Title).toMatchObject({ type: 'TextProperty', size: 5 });
    expect(out.After).toBe(9);
  });

  it('skips arrays whose element type is unsupported', () => {
    const out = parse(bag(tag('Refs', arrayOf(typeName('SoftObjectProperty')), concat(i32(1), fstr('/Game/X'), fstr('')))));
    expect(out.Refs).toMatchObject({ type: 'ArrayProperty<SoftObjectProperty>' });
  });

  it('stores static-array elements (ArrayIndex flag) as Name[i]', () => {
    const out = parse(bag(tag('Slot', INT, i32(10)), tag('Slot', INT, i32(11), 0x01, i32(1))));
    expect(out).toEqual({ Slot: 10, 'Slot[1]': 11 });
  });

  it('skips a property guid and a zero extension byte', () => {
    const out = parse(bag(tag('G', INT, i32(5), 0x02, new Uint8Array(16)), tag('X', INT, i32(6), 0x04, u8(0))));
    expect(out).toEqual({ G: 5, X: 6 });
  });

  it('fails loudly when a value does not consume its declared size', () => {
    expect(() => parse(bag(tag('Day', INT, concat(i32(199), i32(0)))))).toThrow(PropertyError);
    expect(() => parse(bag(tag('Day', INT, concat(i32(199), i32(0)))))).toThrow(/Day: IntProperty consumed 4 bytes, tag says 8/);
  });

  it('fails loudly on unknown tag flags and non-zero extensions', () => {
    expect(() => parse(bag(tag('Day', INT, i32(1), 0x40)))).toThrow(/unknown tag flags 0x40/);
    expect(() => parse(bag(tag('Day', INT, i32(1), 0x04, u8(2))))).toThrow(/unsupported property extensions 0x2/);
  });

  it('fails loudly on duplicate property names', () => {
    expect(() => parse(bag(tag('Day', INT, i32(1)), tag('Day', INT, i32(2))))).toThrow(/duplicate property Day/);
  });

  it('includes the nested path in errors', () => {
    const inner = bag(tag('SellCount', INT, concat(i32(1), i32(0))));
    expect(() => parse(bag(tag('Rec', structType('IngredientRecordData', '/Script/BeltTD'), inner)))).toThrow(/Rec\.SellCount/);
  });
});
