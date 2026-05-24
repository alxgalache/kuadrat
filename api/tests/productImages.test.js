const { db } = require('../config/database');
const { attachProductImages, attachVariationThumbnails, getPrimaryImageBasename } = require('../utils/productImages');

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

  describe('attachVariationThumbnails', () => {
    const insertedVarIds = [];
    const insertedOtherIds = [];

    async function insertOther(id) {
      await db.execute({
        sql: 'INSERT INTO others (id, seller_id, name, description, price, slug) VALUES (?, ?, ?, ?, ?, ?)',
        args: [id, 1, `vt-test-${id}`, 'desc'.padEnd(120, '.'), 99.0, `vt-test-${id}-${Date.now()}`],
      });
      insertedOtherIds.push(id);
    }

    async function insertVar(id, otherId, key) {
      await db.execute({
        sql: 'INSERT INTO other_vars (id, other_id, key, stock) VALUES (?, ?, ?, ?)',
        args: [id, otherId, key, 1],
      });
      insertedVarIds.push(id);
    }

    afterAll(async () => {
      if (insertedVarIds.length > 0) {
        const ph = insertedVarIds.map(() => '?').join(',');
        await db.execute({ sql: `DELETE FROM other_vars WHERE id IN (${ph})`, args: insertedVarIds });
      }
      if (insertedOtherIds.length > 0) {
        const ph = insertedOtherIds.map(() => '?').join(',');
        await db.execute({ sql: `DELETE FROM others WHERE id IN (${ph})`, args: insertedOtherIds });
      }
    });

    test('empty input returns empty array', async () => {
      const result = await attachVariationThumbnails([]);
      expect(result).toEqual([]);
    });

    test('product with two named variations both with images', async () => {
      const otherId = 999910;
      await insertOther(otherId);
      await insertVar(999920, otherId, 'Rojo');
      await insertVar(999921, otherId, 'Azul');
      await insertImage('other_var', 999920, `vt-r-${Date.now()}.jpg`, 0);
      await insertImage('other_var', 999921, `vt-b-${Date.now()}.jpg`, 0);

      const products = [{ id: otherId, thumbnail_basename: 'global-x.jpg' }];
      await attachVariationThumbnails(products);

      expect(products[0].variation_thumbnails).toHaveLength(2);
      expect(products[0].variation_thumbnails[0].key).toBe('Rojo');
      expect(products[0].variation_thumbnails[1].key).toBe('Azul');
      // No fallback when product already has thumbnail_basename
      expect(products[0].thumbnail_basename).toBe('global-x.jpg');
    });

    test('product with anonymous variation gets empty array', async () => {
      const otherId = 999911;
      await insertOther(otherId);
      await insertVar(999922, otherId, null);

      const products = [{ id: otherId, thumbnail_basename: null }];
      await attachVariationThumbnails(products);

      expect(products[0].variation_thumbnails).toEqual([]);
    });

    test('variation without images is omitted', async () => {
      const otherId = 999912;
      await insertOther(otherId);
      await insertVar(999923, otherId, 'A');
      await insertVar(999924, otherId, 'B');
      await insertImage('other_var', 999923, `vt-a-${Date.now()}.jpg`, 0);

      const products = [{ id: otherId, thumbnail_basename: null }];
      await attachVariationThumbnails(products);

      expect(products[0].variation_thumbnails).toHaveLength(1);
      expect(products[0].variation_thumbnails[0].key).toBe('A');
    });

    test('thumbnail_basename falls back to first variation image when no globals', async () => {
      const otherId = 999913;
      await insertOther(otherId);
      await insertVar(999925, otherId, 'X');
      const varBasename = `vt-fallback-${Date.now()}.jpg`;
      await insertImage('other_var', 999925, varBasename, 0);

      const products = [{ id: otherId, thumbnail_basename: null }];
      await attachVariationThumbnails(products);

      expect(products[0].thumbnail_basename).toBe(varBasename);
    });
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
