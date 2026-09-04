import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findUnknownFields,
  isValidItemStatus,
  validateStatusRequiresPackedBy,
  validatePackedByParticipant,
  validateNumericField,
  isTripMember,
  extractParticipantEmails,
  findItemRecord,
  buildCreateItemAttributes,
} from './tripDetail.js';

describe('findUnknownFields', () => {
  test('returns unknown keys', () => {
    assert.deepEqual(findUnknownFields({ name: 'x', bogus: 1 }), ['bogus']);
  });

  test('returns empty array when all keys known', () => {
    assert.deepEqual(findUnknownFields({ name: 'x' }), []);
  });
});

describe('isValidItemStatus', () => {
  test('accepts packed', () => {
    assert.equal(isValidItemStatus('packed'), true);
  });

  test('rejects unknown status', () => {
    assert.equal(isValidItemStatus('lost'), false);
  });
});

describe('validateStatusRequiresPackedBy', () => {
  test('rejects packed with undefined packedBy', () => {
    assert.notEqual(validateStatusRequiresPackedBy('packed', undefined), null);
  });

  test('rejects packed with whitespace-only packedBy', () => {
    assert.notEqual(validateStatusRequiresPackedBy('packed', '  '), null);
  });

  test('accepts packed with a real packedBy', () => {
    assert.equal(validateStatusRequiresPackedBy('packed', 'a@b.com'), null);
  });

  test('accepts non-packed status with no packedBy', () => {
    assert.equal(validateStatusRequiresPackedBy('to-buy', undefined), null);
  });
});

describe('validatePackedByParticipant', () => {
  test('accepts case-insensitive match', () => {
    assert.equal(
      validatePackedByParticipant('A@B.com', ['a@b.com']),
      null,
    );
  });

  test('rejects non-participant', () => {
    assert.notEqual(
      validatePackedByParticipant('x@y.com', ['a@b.com']),
      null,
    );
  });
});

describe('validateNumericField', () => {
  test('accepts a valid number', () => {
    assert.deepEqual(validateNumericField(5, 'quantity'), {
      ok: true,
      value: 5,
    });
  });

  test('rejects a string', () => {
    const result = validateNumericField('5', 'quantity');
    assert.equal(result.ok, false);
  });

  test('rejects a negative number', () => {
    const result = validateNumericField(-1, 'quantity');
    assert.equal(result.ok, false);
  });

  test('rejects NaN', () => {
    const result = validateNumericField(NaN, 'quantity');
    assert.equal(result.ok, false);
  });
});

describe('isTripMember / extractParticipantEmails / findItemRecord', () => {
  const records = [
    { SK: 'USER#a@b.com', Email: 'a@b.com' },
    { SK: 'USER#c@d.com', Email: 'c@d.com' },
    { SK: 'ITEM#item-1', Name: 'Tent' },
  ];

  test('isTripMember true for known member', () => {
    assert.equal(isTripMember(records, 'a@b.com'), true);
  });

  test('isTripMember false for unknown member', () => {
    assert.equal(isTripMember(records, 'x@y.com'), false);
  });

  test('extractParticipantEmails returns all USER# emails', () => {
    assert.deepEqual(extractParticipantEmails(records), [
      'a@b.com',
      'c@d.com',
    ]);
  });

  test('findItemRecord finds matching ITEM# record', () => {
    assert.deepEqual(findItemRecord(records, 'item-1'), {
      SK: 'ITEM#item-1',
      Name: 'Tent',
    });
  });

  test('findItemRecord returns undefined when missing', () => {
    assert.equal(findItemRecord(records, 'nope'), undefined);
  });
});

describe('buildCreateItemAttributes', () => {
  const base = {
    tripId: 'trip-1',
    itemId: 'item-1',
    now: '2026-09-04T00:00:00.000Z',
    participantEmails: ['a@b.com'],
  };

  test('omitting weight yields no Weight key', () => {
    const result = buildCreateItemAttributes({
      ...base,
      body: { name: 'Tent' },
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal('Weight' in result.value, false);
    }
  });

  test('weight: 0 yields Weight: 0 present', () => {
    const result = buildCreateItemAttributes({
      ...base,
      body: { name: 'Tent', weight: 0 },
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.Weight, 0);
    }
  });

  test('omitting quantity defaults Qty to 1', () => {
    const result = buildCreateItemAttributes({
      ...base,
      body: { name: 'Tent' },
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.Qty, 1);
    }
  });

  test('omitting consumable defaults Consumable to false', () => {
    const result = buildCreateItemAttributes({
      ...base,
      body: { name: 'Tent' },
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.Consumable, false);
    }
  });

  test('status packed with no packedBy is rejected', () => {
    const result = buildCreateItemAttributes({
      ...base,
      body: { name: 'Stove', status: 'packed' },
    });
    assert.equal(result.ok, false);
  });

  test('unknown field is rejected', () => {
    const result = buildCreateItemAttributes({
      ...base,
      body: { name: 'Tent', foo: 1 } as never,
    });
    assert.equal(result.ok, false);
  });

  test('packedBy not in participant list is rejected', () => {
    const result = buildCreateItemAttributes({
      ...base,
      body: { name: 'Rope', packedBy: 'nobody@example.com' },
    });
    assert.equal(result.ok, false);
  });
});
