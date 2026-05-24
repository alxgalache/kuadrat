const { db } = require('../config/database');
const { attachProductImages, getPrimaryImageBasename } = require('../utils/productImages');

describe('productImages helper', () => {
  const insertedBasenames = [];

  async function insertImage(productType, productId, basename, position) {
    await db.execute({
      sql: 'INSERT INTO product_images (product_type, product_id, basename, position) VALUES (?, ?, ?, ?)',
      args: [productType, productId, basename, position],
    });
    insertedBasenames.push(basename);
  }

  afterAll(async () => {
    if (insertedBasenames.length > 0) {
      const placeholders = insertedBasenames.map(() => '?').join(',');
      await db.execute({
        sql: `DELETE FROM product_images WHERE basename IN (${placeholders})`,
        args: insertedBasenames,
      });
    }
  });

  test('attachProductImages with empty rows returns []', async () => {
    const result = await attachProductImages([], 'art');
    expect(result).toEqual([]);
  });

  test('attachProductImages tolerates rows with no images', async () => {
    const rows = [{ id: 999999 }];
    await attachProductImages(rows, 'art');
    expect(rows[0].images).toEqual([]);
    expect(rows[0].thumbnail_basename).toBeNull();
  });

  test('attachProductImages returns images ordered by position', async () => {
    const fakeArtId = 999900;
    await insertImage('art', fakeArtId, `pi-test-a-2-${Date.now()}.jpg`, 2);
    await insertImage('art', fakeArtId, `pi-test-a-0-${Date.now()}.jpg`, 0);
    await insertImage('art', fakeArtId, `pi-test-a-1-${Date.now()}.jpg`, 1);

    const rows = [{ id: fakeArtId }];
    await attachProductImages(rows, 'art');

    expect(rows[0].images).toHaveLength(3);
    expect(rows[0].images.map((i) => i.position)).toEqual([0, 1, 2]);
    expect(rows[0].thumbnail_basename).toBe(rows[0].images[0].basename);
  });

  test('attachProductImages partitions images per product_id', async () => {
    const idA = 999901;
    const idB = 999902;
    await insertImage('other', idA, `pi-test-pa-${Date.now()}.jpg`, 0);
    await insertImage('other', idB, `pi-test-pb-${Date.now()}.jpg`, 0);

    const rows = [{ id: idA }, { id: idB }];
    await attachProductImages(rows, 'other');

    expect(rows[0].images).toHaveLength(1);
    expect(rows[1].images).toHaveLength(1);
    expect(rows[0].thumbnail_basename).not.toBe(rows[1].thumbnail_basename);
  });

  test('attachProductImages does not mix product_type', async () => {
    const sharedId = 999903;
    await insertImage('art', sharedId, `pi-test-art-${Date.now()}.jpg`, 0);
    await insertImage('other_var', sharedId, `pi-test-ovar-${Date.now()}.jpg`, 0);

    const rows = [{ id: sharedId }];
    await attachProductImages(rows, 'other_var');
    expect(rows[0].images).toHaveLength(1);
    expect(rows[0].images[0].basename).toContain('pi-test-ovar');
  });

  test('getPrimaryImageBasename returns null when no images', async () => {
    const result = await getPrimaryImageBasename('art', 9999999);
    expect(result).toBeNull();
  });

  test('getPrimaryImageBasename returns the first by position', async () => {
    const id = 999904;
    await insertImage('art', id, `pi-test-prim-late-${Date.now()}.jpg`, 5);
    await insertImage('art', id, `pi-test-prim-early-${Date.now()}.jpg`, 0);
    const result = await getPrimaryImageBasename('art', id);
    expect(result).toContain('prim-early');
  });
});
