const {
  buildCategoryPayload,
  getCategoryById,
  hasDuplicateCategoryName,
  isCategoryReferenced
} = require('../services/categoryService');
const { jsonError, parseId } = require('../utils/common');

function createCategoriesController({ db }) {
  return {
    list(req, res) {
      return res.json(db.get('categories').value());
    },

    create(req, res) {
      const result = buildCategoryPayload(req.body);
      if (result.error) {
        return jsonError(res, 400, result.error);
      }

      if (hasDuplicateCategoryName(db, result.value)) {
        return jsonError(res, 409, 'Category name already exists for this type.');
      }

      db.get('categories').push(result.value).write();
      return res.status(201).json(result.value);
    },

    remove(req, res) {
      const categoryId = parseId(req.params.id);
      if (categoryId === null) {
        return jsonError(res, 400, 'Category id is invalid.');
      }

      const existing = getCategoryById(db, categoryId);
      if (!existing) {
        return jsonError(res, 404, 'Category not found.');
      }

      if (isCategoryReferenced(db, categoryId)) {
        return jsonError(res, 409, 'Category cannot be deleted because it is still referenced by transactions or budgets.');
      }

      db.get('categories').remove({ id: categoryId }).write();
      return res.json({ message: 'Deleted' });
    }
  };
}

module.exports = {
  createCategoriesController
};
