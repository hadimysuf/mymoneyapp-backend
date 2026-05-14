const { INCOME_GROUPS } = require('../config/constants');

function inferIncomeGroup(name) {
  return /gaji|salary/i.test(name) ? 'salary' : 'other';
}

function getIncomeGroup(category) {
  if (!category || category.type !== 'income') {
    return null;
  }

  if (INCOME_GROUPS.has(category.group)) {
    return category.group;
  }

  return inferIncomeGroup(category.name || '');
}

module.exports = {
  getIncomeGroup,
  inferIncomeGroup
};
