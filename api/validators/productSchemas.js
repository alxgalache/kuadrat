const { z } = require('zod');

/**
 * PUT /api/admin/products/:id
 * All fields are optional because the admin route uses COALESCE-style logic --
 * only the provided fields are updated.  Multipart (image upload) is handled
 * by multer, so `image` is NOT part of the JSON body.
 */
const updateProductSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    price: z.union([z.number(), z.string()]).optional(),
    type: z.string().optional(),
    visible: z.union([z.boolean(), z.number(), z.string()]).optional(),
    is_sold: z.union([z.boolean(), z.number(), z.string()]).optional(),
    status: z.string().optional(),
    for_auction: z.union([z.number(), z.string()]).optional(),
  }),
});

/**
 * PUT /api/admin/products/:id/visibility
 * PUT /api/seller/products/:id/visibility
 *
 * Controller checks product_type is 'art' or 'others'.
 * `visible` is treated as truthy/falsy.
 */
const toggleVisibilitySchema = z.object({
  body: z.object({
    product_type: z.enum(['art', 'others'], { message: 'Tipo de producto inválido' }),
    visible: z.union([z.boolean(), z.number()]),
  }),
});

// Single variation entry
const variationSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  key: z.string().optional(),
  value: z.string().optional(),
  stock: z.union([z.number(), z.string()]).optional(),
});

/**
 * PUT /api/admin/others/:id/variations
 * PUT /api/seller/others/:id/variations
 *
 * Body: { variations: [ { id?, key, value, stock } ] }
 */
const updateVariationsSchema = z.object({
  body: z.object({
    variations: z.array(variationSchema),
  }),
});

/**
 * DELETE /api/admin/products/:id
 * DELETE /api/seller/products/:id
 *
 * Body: { product_type: 'art' | 'others' }
 */
const deleteProductSchema = z.object({
  body: z.object({
    product_type: z.enum(['art', 'others'], { message: 'Tipo de producto inválido' }),
  }),
});

module.exports = {
  updateProductSchema,
  toggleVisibilitySchema,
  updateVariationsSchema,
  deleteProductSchema,
};
