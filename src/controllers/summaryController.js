const { calculateSummary } = require('../services/summaryService');

function createSummaryController({ db }) {
  return {
    show(req, res) {
      return res.json(calculateSummary(db));
    }
  };
}

module.exports = {
  createSummaryController
};
