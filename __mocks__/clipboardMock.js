module.exports = {
  setString: jest.fn(),
  getString: jest.fn(async () => ''),
};

module.exports.default = module.exports;
