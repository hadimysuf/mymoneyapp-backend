const { calculateSummary } = require('../services/summaryService');

function createSummaryController({ db }) {
  return {
    async show(req, res) {
      return res.json(await calculateSummary(db));
    }
  };
}

module.exports = {
  createSummaryController
};
