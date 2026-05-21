const express = require('express');
const router = express.Router();

const { validate } = require('../../middleware/validate');
const {
  coaAdminListQuerySchema,
  coaAdminDetailSchema,
  coaAdminStatusBodySchema,
} = require('../../validators/coaSchemas');
const {
  listTags,
  getTagDetail,
  updateTagStatus,
} = require('../../controllers/coaAdminController');

// authenticate + adminAuth are already applied at the parent admin index.
router.get('/tags', validate(coaAdminListQuerySchema), listTags);
router.get('/tags/:uid', validate(coaAdminDetailSchema), getTagDetail);
router.patch('/tags/:uid/status', validate(coaAdminStatusBodySchema), updateTagStatus);

module.exports = router;
